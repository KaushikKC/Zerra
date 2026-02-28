import { parseUnits, encodeFunctionData, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getCircleClient } from "./circleClient.js";
import { config } from "../config/networks.js";

const USDC_DECIMALS = 6;

// ── Wallet set management ─────────────────────────────────────────────────────

let _walletSetId = null;

/**
 * Get the Circle wallet set ID for Zerra's gateway wallets.
 * Uses CIRCLE_WALLET_SET_ID from env; auto-creates one if missing.
 */
async function getWalletSetId() {
  if (_walletSetId) return _walletSetId;

  if (process.env.CIRCLE_WALLET_SET_ID?.trim()) {
    _walletSetId = process.env.CIRCLE_WALLET_SET_ID.trim();
    return _walletSetId;
  }

  const client = getCircleClient();
  const response = await client.createWalletSet({ name: "Zerra-Gateway-Wallets" });
  const setId = response.data?.walletSet?.id;
  if (!setId) throw new Error("[circleDeposit] Failed to create Circle wallet set");

  _walletSetId = setId;
  console.log(`[circleDeposit] ✓ Created wallet set: ${setId}`);
  console.log(`[circleDeposit]   Save CIRCLE_WALLET_SET_ID=${setId} to your .env to reuse it`);
  return _walletSetId;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal viem chain object from a chainConfig entry. */
function toViemChain(chainConfig) {
  return {
    id: chainConfig.chainId,
    name: chainConfig.name,
    nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
    rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
  };
}

/**
 * Ensure the Circle wallet has enough native ETH to pay for gas.
 *
 * Circle's Developer-Controlled Wallets SDK submits transactions from the wallet,
 * meaning the wallet itself pays for gas using its ETH balance.
 * A brand-new Circle wallet has 0 ETH — we auto-fund it from BACKEND_GAS_FUNDER_PRIVATE_KEY.
 *
 * @param {string} walletAddress - Circle EOA wallet address
 * @param {object} chainConfig   - From config.sourceChains
 */
async function ensureCircleWalletHasGas(walletAddress, chainConfig) {
  const MIN_GAS_WEI = parseUnits("0.0005", 18); // enough for 2 txs with HIGH fee
  const FUND_AMOUNT_WEI = parseUnits("0.002", 18);

  const chain = toViemChain(chainConfig);
  const publicClient = createPublicClient({ chain, transport: http(chainConfig.rpcUrl) });

  const ethBalance = await publicClient.getBalance({ address: walletAddress });
  console.log(`[circleDeposit] Circle wallet ETH balance: ${ethBalance} wei`);

  if (ethBalance >= MIN_GAS_WEI) return; // already has enough gas

  let funderKey = process.env.BACKEND_GAS_FUNDER_PRIVATE_KEY?.trim();
  if (!funderKey) {
    throw new Error(
      `Circle wallet ${walletAddress} has no ETH for gas. ` +
      `Set BACKEND_GAS_FUNDER_PRIVATE_KEY in .env to auto-fund it.`
    );
  }
  if (!funderKey.startsWith("0x")) funderKey = "0x" + funderKey;

  const funderAccount = privateKeyToAccount(funderKey);
  const funderClient = createWalletClient({ account: funderAccount, chain, transport: http(chainConfig.rpcUrl) });

  console.log(`[circleDeposit] Funding Circle wallet with 0.002 ETH for gas...`);
  const fundHash = await funderClient.sendTransaction({
    to: walletAddress,
    value: FUND_AMOUNT_WEI,
  });
  await publicClient.waitForTransactionReceipt({ hash: fundHash });
  console.log(`[circleDeposit] ETH funded: ${fundHash}`);
}

// ── Circle tx confirmation ────────────────────────────────────────────────────

/**
 * Poll a Circle transaction challenge until it reaches a terminal state.
 */
async function waitForCircleTx(challengeId) {
  const client = getCircleClient();
  while (true) {
    const response = await client.getTransaction({ id: challengeId });
    const tx = response.data?.transaction;

    if (tx?.state === "CONFIRMED" || tx?.state === "COMPLETE") {
      const hash = tx.txHash;
      if (!hash) throw new Error(`Circle tx ${challengeId} confirmed but txHash is missing`);
      console.log(`[circleDeposit] TX ${challengeId} confirmed → ${hash}`);
      return hash;
    }

    if (tx?.state === "FAILED") {
      throw new Error(`Circle tx ${challengeId} failed: ${tx.errorReason ?? "unknown reason"}`);
    }

    console.log(`[circleDeposit] TX ${challengeId} state: ${tx?.state ?? "pending"}, polling in 2s...`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ── Wallet creation ───────────────────────────────────────────────────────────

/**
 * Create a new Circle EOA wallet on BASE-SEPOLIA.
 * This wallet is the Gateway depositor + BurnIntent signer.
 *
 * @returns {Promise<{ walletId: string, walletAddress: string }>}
 */
export async function createCircleGatewayWallet() {
  const client = getCircleClient();
  const walletSetId = await getWalletSetId();

  const response = await client.createWallets({
    walletSetId,
    accountType: "EOA",
    blockchains: ["BASE-SEPOLIA"],
    count: 1,
  });

  const wallet = response.data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address) {
    throw new Error("[circleDeposit] Failed to create Circle EOA wallet");
  }

  console.log(`[circleDeposit] Created Circle wallet: ${wallet.id} → ${wallet.address}`);
  return { walletId: wallet.id, walletAddress: wallet.address };
}

// ── Deposit via Circle SDK ────────────────────────────────────────────────────


/**
 * Call approve + deposit on GatewayWallet using Circle Developer-Controlled Wallets SDK.
 *
 * Key insight: Circle's `createContractExecutionTransaction` pre-checks its own
 * indexed token balance when called with `abiFunctionSignature`. USDC sent to the
 * Circle wallet via an ERC-4337 UserOp is NOT tracked by Circle's indexer (Circle's
 * Developer Wallet service only indexes regular top-level transfers, not internal calls
 * inside EntryPoint.handleOps). Using raw `callData` bypasses this pre-check — the
 * transaction executes based on on-chain state, which IS correct.
 *
 * Pre-condition: Circle wallet must have ETH for gas — auto-funded from
 * BACKEND_GAS_FUNDER_PRIVATE_KEY if needed.
 *
 * @param {string} walletId        - Circle wallet ID
 * @param {string} walletAddress   - Circle wallet EOA address (for gas check)
 * @param {string} chainKey        - e.g. 'base-sepolia'
 * @param {string} amountUsdc      - Human-readable USDC amount, e.g. "30.0"
 * @returns {Promise<string>} depositTxHash
 */
export async function circleApproveAndDeposit(walletId, walletAddress, chainKey, amountUsdc) {
  const client = getCircleClient();

  const sourceChain = config.sourceChains.find((c) => c.key === chainKey);
  if (!sourceChain) throw new Error(`Unknown source chain: ${chainKey}`);

  const gatewayWallet = config.gateway.walletContract;
  if (!gatewayWallet) throw new Error("gateway.walletContract not set in config");

  const usdcAddress = sourceChain.usdcAddress;
  const amountRaw = parseUnits(amountUsdc, USDC_DECIMALS);

  // Ensure the Circle wallet has ETH for gas fees (new wallet starts with 0 ETH)
  await ensureCircleWalletHasGas(walletAddress, sourceChain);

  // Step 1: approve(gatewayWallet, amount) on USDC contract.
  //
  // MUST use callData (not abiFunctionSignature) for approve.
  // Circle's SDK pre-checks its INDEXED token balance when abiFunctionSignature is used.
  // USDC arrived via ERC-4337 UserOp → Circle's indexer never sees it → indexed balance = 0.
  // For approve(), the on-chain state IS correct (USDC is there), but Circle would reject
  // the call based on its stale indexed balance. callData bypasses this check.
  // approve() does not need to be tracked by Circle's registry — only deposit() does.
  const approveCallData = encodeFunctionData({
    abi: [{ name: "approve", type: "function", stateMutability: "nonpayable",
      inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
      outputs: [{ name: "", type: "bool" }] }],
    functionName: "approve",
    args: [gatewayWallet, amountRaw],
  });
  console.log(`[circleDeposit] Circle wallet calling approve(${amountUsdc} USDC) via callData...`);
  const approveRes = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: usdcAddress,
    callData: approveCallData,
    fee: { type: "level", config: { feeLevel: "HIGH" } },
  });

  const approveId = approveRes.data?.id;
  if (!approveId) throw new Error("[circleDeposit] No challenge ID returned for approve tx");
  const approveTxHash = await waitForCircleTx(approveId);
  console.log(`[circleDeposit] approve confirmed: ${approveTxHash}`);

  // Step 2: deposit(token, value) on GatewayWallet — MUST use abiFunctionSignature.
  //
  // Circle's /v1/transfer (BurnIntent submission) checks Circle's INTERNAL deposit
  // registry, NOT on-chain state. This registry is only updated when Circle SDK
  // submits a "deposit" call using abiFunctionSignature — Circle parses the function
  // name, identifies it as a Gateway deposit, and immediately records it internally.
  //
  // Using callData bypasses the pre-check but also bypasses Circle's registry update,
  // so /v1/transfer still sees "available 0" even though the on-chain balance is correct.
  //
  // Unlike approve() on the USDC contract, Circle's pre-check for deposit() on the
  // GatewayWallet contract appears to be ETH-only (gas) — Circle does not pre-check
  // the indexed USDC balance when the target is their own GatewayWallet contract.
  // The on-chain transferFrom succeeds because the USDC IS there (sent via UserOp earlier).
  console.log(`[circleDeposit] Circle wallet calling deposit(${amountUsdc} USDC)...`);
  const depositRes = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: gatewayWallet,
    abiFunctionSignature: "deposit(address,uint256)",
    abiParameters: [usdcAddress, amountRaw.toString()],
    fee: { type: "level", config: { feeLevel: "HIGH" } },
  });

  const depositId = depositRes.data?.id;
  if (!depositId) throw new Error("[circleDeposit] No challenge ID returned for deposit tx");
  const depositTxHash = await waitForCircleTx(depositId);
  console.log(`[circleDeposit] deposit confirmed: ${depositTxHash}`);

  return depositTxHash;
}

// ── BurnIntent signing via Circle SDK ────────────────────────────────────────

/**
 * Sign a BurnIntent EIP-712 typed data using Circle SDK (HSM — no raw key exposure).
 *
 * @param {string} walletId  - Circle wallet ID
 * @param {object} message   - BurnIntent EIP-712 message (BigInts OK — serialized internally)
 * @param {object} types     - EIP-712 types (BurnIntent + TransferSpec)
 * @returns {Promise<string>} hex signature (0x...)
 */
export async function circleSignBurnIntent(walletId, message, types) {
  const client = getCircleClient();

  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
      ],
      ...types,
    },
    domain: {
      name: "GatewayWallet",
      version: "1",
    },
    primaryType: "BurnIntent",
    message,
  };

  const serialized = JSON.stringify(typedData, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );

  const response = await client.signTypedData({
    walletId,
    data: serialized,
  });

  const signature = response.data?.signature;
  if (!signature) {
    throw new Error("[circleDeposit] Circle SDK did not return a BurnIntent signature");
  }

  console.log(`[circleDeposit] BurnIntent signed via Circle SDK`);
  return signature;
}
