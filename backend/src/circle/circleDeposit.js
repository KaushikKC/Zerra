import { parseUnits } from "viem";
import { getCircleClient } from "./circleClient.js";
import { config } from "../config/networks.js";

const USDC_DECIMALS = 6;

// ── Wallet set management ─────────────────────────────────────────────────────

let _walletSetId = null;

/**
 * Get the Circle wallet set ID for Zerra's gateway wallets.
 * Uses CIRCLE_WALLET_SET_ID from env; auto-creates one if missing (logs the ID
 * so the operator can save it to .env for subsequent restarts).
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

// ── Tx confirmation polling ───────────────────────────────────────────────────

/**
 * Poll a Circle transaction challenge until it reaches a terminal state.
 * Circle SDK returns a challengeId immediately; the actual tx is submitted async.
 *
 * @param {string} challengeId - From circleDeveloperSdk.createContractExecutionTransaction
 * @returns {Promise<string>} on-chain txHash once CONFIRMED/COMPLETE
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
 *
 * This wallet is used as the Gateway depositor:
 *  - Smart account sends USDC to this wallet's address
 *  - This wallet calls approve + deposit via Circle SDK (Circle indexes immediately)
 *  - This wallet signs BurnIntents via Circle SDK (ECDSA, same address on all chains)
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
 * Because Circle's SDK creates and submits the transaction through Circle's own
 * infrastructure, Circle's internal indexer knows about the deposit IMMEDIATELY
 * — eliminating the testnet indexer lag that affects raw EOA transactions.
 *
 * @param {string} walletId   - Circle wallet ID (created by createCircleGatewayWallet)
 * @param {string} chainKey   - e.g. 'base-sepolia'
 * @param {string} amountUsdc - Human-readable USDC amount, e.g. "30.0"
 * @returns {Promise<string>} depositTxHash
 */
export async function circleApproveAndDeposit(walletId, chainKey, amountUsdc) {
  const client = getCircleClient();

  const sourceChain = config.sourceChains.find((c) => c.key === chainKey);
  if (!sourceChain) throw new Error(`Unknown source chain: ${chainKey}`);

  const gatewayWallet = config.gateway.walletContract;
  if (!gatewayWallet) throw new Error("gateway.walletContract not set in config");

  const usdcAddress = sourceChain.usdcAddress;
  const amountRaw = parseUnits(amountUsdc, USDC_DECIMALS).toString();

  // Step 1: approve(gatewayWallet, amount) on USDC contract
  console.log(`[circleDeposit] Circle wallet calling approve(${amountUsdc} USDC)...`);
  const approveRes = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: usdcAddress,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [gatewayWallet, amountRaw],
    fee: { type: "level", config: { feeLevel: "HIGH" } },
  });

  const approveId = approveRes.data?.id;
  if (!approveId) throw new Error("[circleDeposit] No challenge ID returned for approve tx");
  const approveTxHash = await waitForCircleTx(approveId);
  console.log(`[circleDeposit] approve confirmed: ${approveTxHash}`);

  // Step 2: deposit(token, value) on GatewayWallet
  console.log(`[circleDeposit] Circle wallet calling deposit(${amountUsdc} USDC)...`);
  const depositRes = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: gatewayWallet,
    abiFunctionSignature: "deposit(address,uint256)",
    abiParameters: [usdcAddress, amountRaw],
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
 * Circle's `signTypedData` performs ECDSA signing via their internal HSM,
 * producing an ECDSA signature that Circle's Gateway API can verify immediately
 * against the Circle-managed wallet address.
 *
 * @param {string} walletId       - Circle wallet ID
 * @param {object} message        - The BurnIntent EIP-712 message (BigInts OK — will be serialized)
 * @param {object} types          - EIP-712 types (BurnIntent + TransferSpec)
 * @returns {Promise<string>} hex signature (0x...)
 */
export async function circleSignBurnIntent(walletId, message, types) {
  const client = getCircleClient();

  // Build the full EIP-712 typed data structure Circle SDK expects
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

  // Serialize: BigInts must be strings for JSON
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
