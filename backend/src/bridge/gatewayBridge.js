import { randomBytes } from "crypto";
import {
  encodeFunctionData,
  parseUnits,
  pad,
  maxUint256,
  zeroAddress,
  createPublicClient,
  createWalletClient,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config/networks.js";
import { circleSignBurnIntent } from "../circle/circleDeposit.js";

const USDC_DECIMALS = 6;

// Gateway domain IDs — same as Circle CCTP domain IDs.
// Source: official Arc SDK (lib/circle/gateway-sdk.ts) + Circle CCTP docs.
const GATEWAY_DOMAIN_IDS = {
  "ethereum-sepolia": 0,
  "base-sepolia": 6,
  "arc-testnet": 26,
  // mainnet
  "ethereum": 0,
  "base": 6,
};

// ── ABIs ──────────────────────────────────────────────────────────────────────

const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

// EOA direct deposit: session key EOA calls deposit() as a plain EOA tx.
// msg.sender = EOA = depositor. sourceDepositor == sourceSigner — no addDelegate needed.
const GATEWAY_WALLET_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
];

// ── EIP-712 BurnIntent types ──────────────────────────────────────────────────
// Confirmed against official Arc SDK (lib/circle/gateway-sdk.ts)

const BURN_INTENT_TYPES = {
  BurnIntent: [
    { name: "maxBlockHeight", type: "uint256" },
    { name: "maxFee", type: "uint256" },
    { name: "spec", type: "TransferSpec" },
  ],
  TransferSpec: [
    { name: "version", type: "uint32" },
    { name: "sourceDomain", type: "uint32" },
    { name: "destinationDomain", type: "uint32" },
    { name: "sourceContract", type: "bytes32" },
    { name: "destinationContract", type: "bytes32" },
    { name: "sourceToken", type: "bytes32" },
    { name: "destinationToken", type: "bytes32" },
    { name: "sourceDepositor", type: "bytes32" },
    { name: "destinationRecipient", type: "bytes32" },
    { name: "sourceSigner", type: "bytes32" },
    { name: "destinationCaller", type: "bytes32" },
    { name: "value", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "hookData", type: "bytes" },
  ],
};

const BURN_INTENT_DOMAIN = { name: "GatewayWallet", version: "1" };

/** Pad a 20-byte address into a 32-byte hex value (left-zero-padded). */
function addressToBytes32(address) {
  return pad(address.toLowerCase(), { size: 32 });
}

/** Build a viem chain object from a chainConfig entry. */
function toViemChain(chainConfig) {
  return {
    id: chainConfig.chainId,
    name: chainConfig.name,
    nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
    rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
  };
}

// ── Gateway info (verification only, addresses are hardcoded constants) ────────

/**
 * Fetch Gateway info from Circle's /v1/info endpoint.
 */
export async function getGatewayInfo() {
  try {
    const res = await fetch(`${config.gateway.apiUrl}/v1/info`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const domains = data.domains ?? [];
    console.log("[gatewayBridge] Gateway domains:", domains.map((d) => ({
      chain: d.chain,
      domain: d.domain,
      wallet: d.walletContract?.address,
      minter: d.minterContract?.address,
    })));
    return data;
  } catch (err) {
    console.error("[gatewayBridge] /v1/info fetch failed:", err.message);
    return {};
  }
}

// ── Transaction builders ──────────────────────────────────────────────────────

/**
 * Build the USDC transfer tx from the smart account to the session key EOA.
 * The EOA then calls approve+deposit directly as a plain EOA transaction,
 * making it both the depositor (msg.sender) and signer — no addDelegate needed.
 *
 * @param {string} chainKey             - e.g. 'base-sepolia'
 * @param {string} amountUsdc           - Human-readable amount, e.g. "30.00"
 * @param {string} sessionKeyEoaAddress - Recipient EOA address
 * @returns {{ to, data, value }}
 */
export function buildTransferToEoaTx(chainKey, amountUsdc, sessionKeyEoaAddress) {
  const ERC20_TRANSFER_ABI = [
    {
      name: "transfer",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
  ];

  const sourceChain = config.sourceChains.find((c) => c.key === chainKey);
  if (!sourceChain) throw new Error(`Unknown source chain: ${chainKey}`);

  const amountRaw = parseUnits(amountUsdc, USDC_DECIMALS);
  return {
    to: sourceChain.usdcAddress,
    data: encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [sessionKeyEoaAddress, amountRaw],
    }),
    value: 0n,
  };
}

/**
 * Session key EOA calls approve + deposit DIRECTLY (not via ERC-4337 smart account).
 *
 * This makes msg.sender = session key EOA = depositor in Circle's system.
 * sourceDepositor == sourceSigner in the BurnIntent → no addDelegate required.
 *
 * Gas requirement: the session key EOA needs ETH on the source chain.
 * If BACKEND_GAS_FUNDER_PRIVATE_KEY is set and the EOA has insufficient ETH,
 * the funder auto-sends 0.001 ETH before proceeding.
 *
 * @param {string} chainKey          - e.g. 'base-sepolia'
 * @param {string} signerPrivateKey  - Session key private key (0x-prefixed)
 * @param {string} amountUsdc        - Human-readable amount
 * @returns {Promise<{ approveHash, depositHash }>}
 */
export async function callEoaApproveAndDeposit(chainKey, signerPrivateKey, amountUsdc) {
  const gatewayWallet = config.gateway.walletContract;
  if (!gatewayWallet) throw new Error("gateway.walletContract not set in config");

  const sourceChain = config.sourceChains.find((c) => c.key === chainKey);
  if (!sourceChain) throw new Error(`Unknown source chain: ${chainKey}`);

  if (GATEWAY_DOMAIN_IDS[chainKey] === undefined) {
    throw new Error(`Chain '${chainKey}' is not supported by Circle Gateway.`);
  }

  const usdcAddress = sourceChain.usdcAddress;
  const amountRaw = parseUnits(amountUsdc, USDC_DECIMALS);

  const signerAccount = privateKeyToAccount(signerPrivateKey);
  const chain = toViemChain(sourceChain);

  const publicClient = createPublicClient({ chain, transport: http(sourceChain.rpcUrl) });
  const walletClient = createWalletClient({ account: signerAccount, chain, transport: http(sourceChain.rpcUrl) });

  // ── Gas check: ensure the EOA has ETH to cover 2 transactions ────────────
  const MIN_GAS_WEI = parseUnits("0.0003", 18); // ~0.0003 ETH comfortably covers 2 txs
  const ethBalance = await publicClient.getBalance({ address: signerAccount.address });
  console.log(`[gatewayBridge] EOA ${signerAccount.address} ETH balance: ${ethBalance} wei`);

  if (ethBalance < MIN_GAS_WEI) {
    let funderKey = process.env.BACKEND_GAS_FUNDER_PRIVATE_KEY?.trim();
    if (!funderKey) {
      throw new Error(
        `Session key EOA ${signerAccount.address} has insufficient ETH (${ethBalance} wei). ` +
        `Either fund it manually with Base Sepolia ETH, or set BACKEND_GAS_FUNDER_PRIVATE_KEY in .env.`
      );
    }
    // viem expects Hex: "0x" + 64 hex chars (otherwise .slice(2) corrupts the key)
    if (!funderKey.startsWith("0x")) funderKey = "0x" + funderKey;

    const funderAccount = privateKeyToAccount(funderKey);
    const funderClient = createWalletClient({
      account: funderAccount,
      chain,
      transport: http(sourceChain.rpcUrl),
    });

    console.log(`[gatewayBridge] Auto-funding EOA ${signerAccount.address} with 0.002 ETH for gas...`);
    const fundHash = await funderClient.sendTransaction({
      to: signerAccount.address,
      value: parseUnits("0.002", 18),
    });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });
    console.log(`[gatewayBridge] EOA funded: ${fundHash}`);
  }

  // ── Step 1: EOA approves GatewayWallet to pull USDC ──────────────────────
  console.log(`[gatewayBridge] EOA calling approve(gatewayWallet, ${amountUsdc} USDC)...`);
  const approveHash = await walletClient.writeContract({
    address: usdcAddress,
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [gatewayWallet, amountRaw],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log(`[gatewayBridge] EOA approve confirmed: ${approveHash}`);

  // ── Step 2: EOA deposits USDC — msg.sender = EOA = depositor ──────────────
  console.log(`[gatewayBridge] EOA calling deposit(usdc, ${amountUsdc})...`);
  const depositHash = await walletClient.writeContract({
    address: gatewayWallet,
    abi: GATEWAY_WALLET_ABI,
    functionName: "deposit",
    args: [usdcAddress, amountRaw],
  });
  await publicClient.waitForTransactionReceipt({ hash: depositHash });
  console.log(`[gatewayBridge] EOA deposit confirmed: ${depositHash}`);

  return { approveHash, depositHash };
}

/**
 * Poll Circle's Gateway /v1/balances endpoint until the depositor's indexed balance
 * reaches the required amount.
 *
 * This checks the EXACT same balance that /v1/transfer validates — Circle's off-chain
 * indexed registry. The on-chain GatewayWallet.availableBalance() updates immediately
 * after the deposit tx mines, but /v1/transfer uses Circle's backend index which has
 * a variable lag (10s–3min on testnet). Polling /v1/balances guarantees we only
 * submit the BurnIntent when Circle's index is ready.
 *
 * Official ref: arc-multichain-wallet/lib/circle/gateway-sdk.ts fetchGatewayBalance()
 *
 * @param {string} depositorAddress - Circle wallet that made the deposit
 * @param {number} sourceDomain     - Gateway domain ID (6 = base-sepolia, 26 = arc-testnet)
 * @param {number} requiredAmount   - Required USDC (human-readable, e.g. 3.673)
 * @returns {Promise<void>} Resolves when Circle has indexed the balance
 */
async function pollGatewayIndexedBalance(depositorAddress, sourceDomain, requiredAmount) {
  // Circle testnet indexer lags 5-15 minutes behind the chain tip.
  // Poll for up to 20 minutes total (120 × 10s).
  const MAX_ATTEMPTS = 120;
  const POLL_INTERVAL_MS = 10_000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${config.gateway.apiUrl}/v1/balances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "USDC",
          sources: [{ domain: sourceDomain, depositor: depositorAddress }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const balanceEntry = Array.isArray(data.balances) ? data.balances[0] : null;

        // IMPORTANT: Circle Gateway /v1/balances returns balance as a human-readable
        // decimal string (e.g. "3.673000"), NOT an atomic integer ("3673000").
        // Parse with parseFloat, compare directly against requiredAmount (also USDC).
        const balanceUsdc = parseFloat(balanceEntry?.balance ?? "0") || 0;
        console.log(`[gatewayBridge] Circle indexed balance (attempt ${attempt}/${MAX_ATTEMPTS}): ${balanceUsdc} USDC (need ${requiredAmount})`);

        if (balanceUsdc >= requiredAmount - 0.001) {
          console.log(`[gatewayBridge] ✓ Circle Gateway balance confirmed — submitting BurnIntent`);
          return;
        }
      } else {
        const errText = await res.text();
        console.log(`[gatewayBridge] /v1/balances returned ${res.status}: ${errText}`);
      }
    } catch (err) {
      console.log(`[gatewayBridge] /v1/balances error (attempt ${attempt}): ${err.message}`);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  throw new Error(
    `Circle Gateway balance not indexed for ${depositorAddress} after ${MAX_ATTEMPTS} attempts (${MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}s). ` +
    `Deposit may still be processing — try retrying the job.`
  );
}

/**
 * Sign and submit a Circle Gateway BurnIntent to initiate a cross-chain USDC transfer.
 *
 * Signing strategy (controlled by `circleWalletId`):
 *
 *   Circle SDK (preferred, circleWalletId is set):
 *     sourceDepositor == sourceSigner == Circle wallet address
 *     BurnIntent is signed via Circle SDK (HSM) — Circle's indexer knows about the
 *     deposit immediately, so the BurnIntent is accepted without any retry delay.
 *
 *   Raw EOA fallback (circleWalletId is null, legacy):
 *     sourceDepositor == sourceSigner == session key EOA
 *     BurnIntent is self-signed with signerPrivateKey — may hit Circle indexer lag.
 *
 * @param {Array<{ chain: string, amount: string }>} sourcePlans
 * @param {string}      destinationChainKey
 * @param {string}      recipientAddress    - Recipient on Arc (smart account)
 * @param {string}      depositorAddress    - Address that holds the Gateway balance
 * @param {string|null} signerPrivateKey    - Raw hex key (for EOA fallback; null if using Circle)
 * @param {string|null} [circleWalletId]   - Circle wallet ID for SDK signing (preferred)
 * @returns {Promise<{ attestation: string, attestationSignature: string }>}
 */
export async function initiateTransfer(
  sourcePlans,
  destinationChainKey,
  recipientAddress,
  depositorAddress,
  signerPrivateKey,
  circleWalletId = null
) {
  // signerAccount is only used for raw EOA signing path
  const signerAccount = circleWalletId ? null : privateKeyToAccount(signerPrivateKey);
  const gatewayWallet = config.gateway.walletContract;
  const gatewayMinter = config.gateway.minterContract;

  console.log(`[gatewayBridge] Depositor/Signer (session key EOA): ${depositorAddress}`);
  console.log(`[gatewayBridge] Recipient on Arc: ${recipientAddress}`);

  const destChainConfig = destinationChainKey === config.destinationChain.key
    ? config.destinationChain
    : config.sourceChains.find((c) => c.key === destinationChainKey);
  if (!destChainConfig) throw new Error(`Unknown destination chain: ${destinationChainKey}`);

  const destinationDomain = GATEWAY_DOMAIN_IDS[destinationChainKey];
  if (destinationDomain === undefined) {
    throw new Error(`No Gateway domain ID for destination chain: ${destinationChainKey}`);
  }

  const results = [];
  for (const plan of sourcePlans) {
    const sourceChainConfig = config.sourceChains.find((c) => c.key === plan.chain);
    if (!sourceChainConfig) throw new Error(`Unknown source chain: ${plan.chain}`);

    const sourceDomain = GATEWAY_DOMAIN_IDS[plan.chain];
    if (sourceDomain === undefined) {
      throw new Error(`Chain '${plan.chain}' is not supported by Circle Gateway`);
    }

    const amountRaw = parseUnits(plan.amount, USDC_DECIMALS);

    // Circle deducts (value + protocol_fee) from the depositor's gateway balance.
    // We set BurnIntent.value = deposited - 0.5% buffer so that:
    //   deposited_amount >= value + Circle_actual_fee   (actual fee ≈ 0.277%)
    // The smart account on Arc receives exactly `value` (fee is never charged to recipient).
    const circleFeeBuffer = amountRaw * BigInt(5) / BigInt(1000); // 0.5% ≥ actual fee ~0.277%
    const burnIntentValue = amountRaw - circleFeeBuffer;

    // Step 1: Poll Circle's /v1/balances until the deposit is indexed.
    // This is the same balance /v1/transfer checks — we must wait for it before
    // submitting the BurnIntent. (On-chain availableBalance() is NOT sufficient;
    // Circle's off-chain indexer has a separate lag.)
    await pollGatewayIndexedBalance(
      depositorAddress,
      sourceDomain,
      parseFloat(plan.amount)
    );

    // sourceDepositor == sourceSigner (self-signed, Circle or EOA)
    const burnIntentMessage = {
      maxBlockHeight: maxUint256,
      maxFee: BigInt(2_010_000), // 2.01 USDC — Circle Gateway minimum
      spec: {
        version: 1,
        sourceDomain,
        destinationDomain,
        sourceContract: addressToBytes32(gatewayWallet),
        destinationContract: addressToBytes32(gatewayMinter),
        sourceToken: addressToBytes32(sourceChainConfig.usdcAddress),
        destinationToken: addressToBytes32(destChainConfig.usdcAddress),
        sourceDepositor: addressToBytes32(depositorAddress),      // Circle wallet or EOA
        destinationRecipient: addressToBytes32(recipientAddress), // smart account on Arc
        sourceSigner: addressToBytes32(depositorAddress),         // same as depositor — self-sign
        destinationCaller: addressToBytes32(zeroAddress),
        value: burnIntentValue,
        salt: `0x${randomBytes(32).toString("hex")}`,
        hookData: "0x",
      },
    };

    // Sign BurnIntent: Circle SDK (preferred) or raw EOA
    let signature;
    if (circleWalletId) {
      // Circle SDK signing — ECDSA via Circle HSM, accepted immediately by Circle's API
      signature = await circleSignBurnIntent(circleWalletId, burnIntentMessage, BURN_INTENT_TYPES);
    } else {
      // Fallback: raw EOA signing
      signature = await signerAccount.signTypedData({
        domain: BURN_INTENT_DOMAIN,
        types: BURN_INTENT_TYPES,
        primaryType: "BurnIntent",
        message: burnIntentMessage,
      });
    }

    const payload = [
      {
        burnIntent: {
          maxBlockHeight: burnIntentMessage.maxBlockHeight.toString(),
          maxFee: burnIntentMessage.maxFee.toString(),
          spec: {
            ...burnIntentMessage.spec,
            value: burnIntentMessage.spec.value.toString(),
          },
        },
        signature,
      },
    ];

    // Step 2: Submit BurnIntent to Circle Gateway.
    //
    // /v1/balances already confirmed the deposit is indexed (Step 1 above),
    // so /v1/transfer should accept on the first try. Keep 3 retries as a
    // safety net for transient race conditions only.
    const BURN_MAX_ATTEMPTS = 3;
    const BURN_RETRY_DELAY_MS = 5_000;

    let transferData;
    for (let attempt = 1; attempt <= BURN_MAX_ATTEMPTS; attempt++) {
      const res = await fetch(`${config.gateway.apiUrl}/v1/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        transferData = await res.json();
        console.log(`[gatewayBridge] BurnIntent accepted on attempt ${attempt}`);
        break;
      }

      const errText = await res.text();

      // "Insufficient balance" or "not authorized" = indexer lag — retry
      const isIndexerLag = res.status === 400 && (
        errText.includes("Insufficient balance") ||
        errText.includes("not authorized")
      );

      if (isIndexerLag && attempt < BURN_MAX_ATTEMPTS) {
        console.log(`[gatewayBridge] Circle indexer not ready (attempt ${attempt}/${BURN_MAX_ATTEMPTS}), retrying in ${BURN_RETRY_DELAY_MS / 1000}s: ${errText}`);
        await new Promise((r) => setTimeout(r, BURN_RETRY_DELAY_MS));
        continue;
      }

      throw new Error(`Gateway /v1/transfer error ${res.status}: ${errText}`);
    }

    if (!transferData) {
      throw new Error(`BurnIntent not accepted by Circle after ${BURN_MAX_ATTEMPTS} attempts`);
    }

    const result = Array.isArray(transferData) ? transferData[0] : transferData;
    const transferId = result.transferId;

    console.log(`[gatewayBridge] Transfer submitted. ID: ${transferId}`);

    // Poll until attestation is available
    let attestation = result.attestation;
    let attestationSignature = result.signature;

    if (!attestation || !attestationSignature) {
      console.log(`[gatewayBridge] Polling for attestation (transfer ${transferId})...`);
      let attempts = 0;
      const MAX_ATTEMPTS = 60; // 3 minutes at 3s intervals
      while (attempts < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 3000));
        const pollRes = await fetch(
          `${config.gateway.apiUrl}/v1/transfers/${transferId}`
        );
        const pollJson = await pollRes.json();
        const status = pollJson.status ?? pollJson.state;
        console.log(`[gatewayBridge] Transfer ${transferId} status: ${status} (attempt ${attempts + 1})`);

        if (pollJson.attestation && pollJson.signature) {
          attestation = pollJson.attestation;
          attestationSignature = pollJson.signature;
          break;
        }
        if (status === "FAILED") {
          throw new Error(`Gateway transfer failed: ${JSON.stringify(pollJson)}`);
        }
        attempts++;
      }
    }

    if (!attestation || !attestationSignature) {
      throw new Error(`Attestation not received for transfer ${transferId} after 3 minutes`);
    }

    console.log(`[gatewayBridge] Attestation received for transfer ${transferId}`);
    results.push({ attestation, attestationSignature });
  }

  return results[0];
}

/**
 * Build the mint transaction to call on the Arc destination chain.
 *
 * @param {string} attestation          - From initiateTransfer()
 * @param {string} attestationSignature - From initiateTransfer()
 * @returns {{ to: string, data: string, value: bigint }}
 */
export function buildMintTx(attestation, attestationSignature) {
  const GATEWAY_MINTER_ABI = [
    {
      name: "gatewayMint",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "attestationPayload", type: "bytes" },
        { name: "signature", type: "bytes" },
      ],
      outputs: [],
    },
  ];

  const data = encodeFunctionData({
    abi: GATEWAY_MINTER_ABI,
    functionName: "gatewayMint",
    args: [attestation, attestationSignature],
  });

  return {
    to: config.gateway.minterContract,
    data,
    value: 0n,
  };
}
