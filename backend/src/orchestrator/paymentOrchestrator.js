import { randomUUID } from "crypto";
import { encodeFunctionData, parseUnits, keccak256, toHex } from "viem";
import {
  createJob,
  updateJobStatus,
  updateJobTxHash,
  getJob,
  getSessionKey,
} from "../db/database.js";
import { scanBalances } from "../scanner/balanceScanner.js";
import { getQuote } from "../router/quoteEngine.js";
import { getSwapProvider } from "../swap/swapProvider.js";
import { buildSmartAccountClient, sendBatchUserOp } from "../aa/smartAccount.js";
import { decryptKey } from "../aa/sessionKeys.js";
import {
  buildTransferToEoaTx,
  callEoaApproveAndDeposit,
  initiateTransfer,
  buildMintTx,
} from "../bridge/gatewayBridge.js";
import {
  createCircleGatewayWallet,
  circleApproveAndDeposit,
} from "../circle/circleDeposit.js";
import {
  updateSessionKeyCircleWallet,
} from "../db/database.js";
import { config } from "../config/networks.js";
import { getSplitConfig } from "../merchant/merchant.js";
import { dispatchWebhook } from "../webhooks/webhookDispatcher.js";

const USDC_DECIMALS = 6;

// PaymentRouter ABI — pay(), splitPay(), and ERC-20 approve()
const PAYMENT_ROUTER_ABI = [
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
  {
    name: "pay",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "grossAmount", type: "uint256" },
      { name: "paymentRef", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "splitPay",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipients", type: "address[]" },
      { name: "bps", type: "uint256[]" },
      { name: "grossAmount", type: "uint256" },
      { name: "paymentRef", type: "bytes32" },
    ],
    outputs: [],
  },
];

/**
 * State machine for a cross-chain USDC payment job.
 *
 * States (in order):
 *  SCANNING → ROUTING → AWAITING_CONFIRMATION (skipped if autoExecute)
 *  → SWAPPING (only if swap steps exist)
 *  → GATEWAY_DEPOSITING
 *  → GATEWAY_TRANSFERRING
 *  → MINTING
 *  → PAYING
 *  → COMPLETE | FAILED | EXPIRED
 *
 * CRITICAL: Every state transition saves to DB BEFORE executing the on-chain step.
 */

// ── Job creation ──────────────────────────────────────────────────────────────

/**
 * Create a new payment job and begin scanning balances.
 * Returns immediately with a jobId — the rest runs async.
 *
 * @param {object} params
 * @param {string} params.payerAddress
 * @param {string} params.merchantAddress
 * @param {string} params.targetAmount
 * @param {string} [params.label]
 * @param {string} [params.paymentRef]
 * @param {number} [params.expiresAt]   - unix ms timestamp for expiry (stored in DB)
 */
/**
 * Create a new payment job and immediately begin execution (auto-execute).
 * The user has already confirmed on the frontend (clicked "Confirm & Authorize"
 * and signed the fund transactions), so AWAITING_CONFIRMATION is skipped.
 *
 * @param {object} params
 */
export function createPaymentJob({ payerAddress, merchantAddress, targetAmount, label, paymentRef, expiresAt }) {
  const jobId = randomUUID();
  createJob({
    id: jobId,
    payer_address: payerAddress,
    merchant_address: merchantAddress,
    target_amount: targetAmount,
    label: label ?? null,
    payment_ref: paymentRef ?? null,
    status: "SCANNING",
    expires_at: expiresAt ?? null,
  });
  // skipConfirmation: true — user already confirmed on the frontend
  runOrchestrator(jobId, { skipConfirmation: true }).catch((err) => {
    console.error(`[orchestrator] Job ${jobId} crashed:`, err.message);
    updateJobStatus(jobId, "FAILED", { error: err.message });
  });
  return jobId;
}

/**
 * Create a payment job that skips the AWAITING_CONFIRMATION step.
 * Used by subscription auto-charges.
 */
export function createPaymentJobAutoExecute({ payerAddress, merchantAddress, targetAmount, label, paymentRef, expiresAt }) {
  const jobId = randomUUID();
  createJob({
    id: jobId,
    payer_address: payerAddress,
    merchant_address: merchantAddress,
    target_amount: targetAmount,
    label: label ?? null,
    payment_ref: paymentRef ?? null,
    status: "SCANNING",
    expires_at: expiresAt ?? null,
  });
  runOrchestrator(jobId, { skipConfirmation: true }).catch((err) => {
    console.error(`[orchestrator] Auto-job ${jobId} crashed:`, err.message);
    updateJobStatus(jobId, "FAILED", { error: err.message });
  });
  return jobId;
}

// ── Main state machine ────────────────────────────────────────────────────────

async function runOrchestrator(jobId, opts = {}) {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  switch (job.status) {
    case "SCANNING":
      await stepScan(jobId, opts);
      break;
    case "ROUTING":
      await stepRoute(jobId, opts);
      break;
    case "AWAITING_CONFIRMATION":
      break;
    case "SWAPPING":
      await stepSwap(jobId);
      break;
    case "GATEWAY_DEPOSITING":
      await stepDeposit(jobId);
      break;
    case "GATEWAY_TRANSFERRING":
      await stepTransfer(jobId);
      break;
    case "MINTING":
      await stepMint(jobId);
      break;
    case "PAYING":
      await stepPay(jobId);
      break;
    case "COMPLETE":
    case "FAILED":
    case "EXPIRED":
      break;
    default:
      throw new Error(`Unknown job status: ${job.status}`);
  }
}

// ── State: SCANNING ───────────────────────────────────────────────────────────

async function stepScan(jobId, opts) {
  const job = getJob(jobId);
  console.log(`[orchestrator:${jobId}] SCANNING balances for ${job.payer_address}`);

  // Retry up to 6× (max ~30s) to handle RPC lag: the backend node may take a few
  // seconds to index the block that the frontend already confirmed via receipt.
  const MAX_RETRIES = 6;
  const RETRY_DELAY_MS = 5000;
  let balances;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    balances = await scanBalances(job.payer_address);
    const totalUsdc = Object.values(balances).reduce(
      (sum, b) => sum + parseFloat(b.usdc ?? "0"),
      0
    );
    if (totalUsdc > 0) break;

    if (attempt < MAX_RETRIES) {
      console.log(`[orchestrator:${jobId}] No USDC found yet (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS / 1000}s…`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  updateJobStatus(jobId, "ROUTING", { source_plan: { _rawBalances: balances } });
  await stepRoute(jobId, opts);
}

// ── State: ROUTING ────────────────────────────────────────────────────────────

async function stepRoute(jobId, opts = {}) {
  const job = getJob(jobId);
  console.log(`[orchestrator:${jobId}] ROUTING`);

  const rawBalances = job.source_plan?._rawBalances;
  const quote = await getQuote(job.payer_address, job.target_amount, rawBalances ?? undefined);

  if (!quote.sufficientFunds) {
    updateJobStatus(jobId, "FAILED", {
      error: `Insufficient funds. Need ${job.target_amount} USDC + fees. Shortfall: ${quote.shortfallUsdc} USDC`,
    });
    return;
  }

  const quoteData = {
    totalFees: quote.totalFees,
    userAuthorizes: quote.userAuthorizes,
    merchantReceives: quote.merchantReceives,
    breakdown: quote.breakdown,
  };

  if (opts.skipConfirmation) {
    // For subscription auto-charges, skip AWAITING_CONFIRMATION
    const hasSwap = quote.sourcePlan.some((s) => s.type === "swap");
    const nextState = hasSwap ? "SWAPPING" : "GATEWAY_DEPOSITING";
    updateJobStatus(jobId, nextState, { source_plan: quote.sourcePlan, quote: quoteData });
    console.log(`[orchestrator:${jobId}] Auto-executing (skipConfirmation), next: ${nextState}`);
    await runOrchestrator(jobId, opts);
  } else {
    updateJobStatus(jobId, "AWAITING_CONFIRMATION", {
      source_plan: quote.sourcePlan,
      quote: quoteData,
    });
    console.log(`[orchestrator:${jobId}] Quote ready — awaiting user confirmation`);
  }
}

// ── Called by API after session key is granted ────────────────────────────────

/**
 * Advance a job from AWAITING_CONFIRMATION → begin execution.
 */
export async function confirmAndExecute(jobId) {
  const job = getJob(jobId);
  if (!job || job.status !== "AWAITING_CONFIRMATION") {
    throw new Error(`Job ${jobId} is not in AWAITING_CONFIRMATION state`);
  }

  const hasSwap = job.source_plan?.some((s) => s.type === "swap");
  const nextState = hasSwap ? "SWAPPING" : "GATEWAY_DEPOSITING";
  updateJobStatus(jobId, nextState);

  await runOrchestrator(jobId, {});
}

// ── State: SWAPPING ───────────────────────────────────────────────────────────

async function stepSwap(jobId) {
  const job = getJob(jobId);
  const swapSteps = job.source_plan.filter((s) => s.type === "swap");
  console.log(`[orchestrator:${jobId}] SWAPPING (${swapSteps.length} steps)`);

  const swapProvider = getSwapProvider();
  const swapTxHashes = {};

  for (const step of swapSteps) {
    const chain = config.sourceChains.find((c) => c.key === step.chain);
    const sessionKeyRow = getSessionKey(job.payer_address);
    if (!sessionKeyRow) throw new Error("Session key not found for payer");

    const client = await buildSmartAccountClient(
      job.payer_address,
      chain,
      sessionKeyRow.encrypted_private_key
    );

    const swapTx = await swapProvider.buildSwapTx(
      step.fromToken,
      "USDC",
      step.fromAmount,
      client.account.address,
      chain.chainId
    );

    const { txHash } = await sendBatchUserOp(client, [swapTx]);
    swapTxHashes[step.chain] = txHash;
    console.log(`[orchestrator:${jobId}] Swap on ${step.chain}: ${txHash}`);
  }

  updateJobTxHash(jobId, { swap: swapTxHashes });
  updateJobStatus(jobId, "GATEWAY_DEPOSITING");
  await stepDeposit(jobId);
}

// ── State: GATEWAY_DEPOSITING ─────────────────────────────────────────────────

async function stepDeposit(jobId) {
  const job = getJob(jobId);
  console.log(`[orchestrator:${jobId}] GATEWAY_DEPOSITING`);

  const depositTxHashes = {};
  const chainGroups = {};
  for (const step of job.source_plan) {
    if (!chainGroups[step.chain]) chainGroups[step.chain] = [];
    chainGroups[step.chain].push(step);
  }

  for (const [chainKey, steps] of Object.entries(chainGroups)) {
    const chain = config.sourceChains.find((c) => c.key === chainKey);
    let sessionKeyRow = getSessionKey(job.payer_address);
    if (!sessionKeyRow) throw new Error("Session key not found for payer");

    const client = await buildSmartAccountClient(
      job.payer_address,
      chain,
      sessionKeyRow.encrypted_private_key
    );

    const totalUsdc = steps.reduce((sum, s) => {
      const amt = s.type === "swap" ? parseFloat(s.toUsdc ?? "0") : parseFloat(s.amount);
      return sum + amt;
    }, 0);

    console.log(`[orchestrator:${jobId}] Smart account: ${client.account.address}`);

    // ── Get or create a Circle-managed EOA wallet for this session ──────────
    // The Circle wallet is the Gateway depositor + BurnIntent signer.
    // Using Circle SDK for approve+deposit means Circle's indexer knows immediately
    // (no testnet delay), so the BurnIntent is accepted without waiting.

    let circleWalletId = sessionKeyRow.circle_wallet_id;
    let circleWalletAddress = sessionKeyRow.circle_wallet_address;

    if (!circleWalletId) {
      console.log(`[orchestrator:${jobId}] Creating Circle gateway wallet for payer ${job.payer_address}...`);
      const created = await createCircleGatewayWallet();
      circleWalletId = created.walletId;
      circleWalletAddress = created.walletAddress;
      updateSessionKeyCircleWallet(job.payer_address, circleWalletId, circleWalletAddress);
      console.log(`[orchestrator:${jobId}] Circle wallet: ${circleWalletAddress} (id: ${circleWalletId})`);
      // Re-fetch the row so stepTransfer can read the updated addresses
      sessionKeyRow = getSessionKey(job.payer_address);
    } else {
      console.log(`[orchestrator:${jobId}] Using existing Circle wallet: ${circleWalletAddress} (id: ${circleWalletId})`);
    }

    // Step 1: Smart account transfers USDC to Circle wallet address (UserOp, Pimlico-sponsored)
    const transferTx = buildTransferToEoaTx(chainKey, totalUsdc.toFixed(6), circleWalletAddress);
    const { txHash } = await sendBatchUserOp(client, [transferTx]);
    depositTxHashes[chainKey] = txHash;
    console.log(`[orchestrator:${jobId}] USDC transferred to Circle wallet on ${chainKey}: ${txHash}`);

    // Step 2: Circle wallet calls approve+deposit via Circle SDK.
    // circleApproveAndDeposit auto-funds ETH for gas and waits for Circle to
    // index the USDC before submitting — eliminates all testnet indexer lag.
    const depositHash = await circleApproveAndDeposit(circleWalletId, circleWalletAddress, chainKey, totalUsdc.toFixed(6));
    depositTxHashes[`${chainKey}_deposit`] = depositHash;
    console.log(`[orchestrator:${jobId}] Circle wallet deposited on ${chainKey}: ${depositHash}`);
  }

  updateJobTxHash(jobId, { deposit: depositTxHashes });
  updateJobStatus(jobId, "GATEWAY_TRANSFERRING");
  await stepTransfer(jobId);
}

// ── State: GATEWAY_TRANSFERRING ───────────────────────────────────────────────

async function stepTransfer(jobId) {
  const job = getJob(jobId);
  console.log(`[orchestrator:${jobId}] GATEWAY_TRANSFERRING`);

  const sessionKeyRow = getSessionKey(job.payer_address);
  if (!sessionKeyRow) throw new Error("Session key not found for payer");

  const chainGroups = {};
  for (const step of job.source_plan) {
    if (!chainGroups[step.chain]) chainGroups[step.chain] = 0;
    const amt = step.type === "swap" ? parseFloat(step.toUsdc ?? "0") : parseFloat(step.amount);
    chainGroups[step.chain] += amt;
  }

  const sources = Object.entries(chainGroups).map(([chain, amount]) => ({
    chain,
    amount: amount.toFixed(6),
  }));

  // Circle wallet deposited and will sign the BurnIntent (preferred path)
  // Falls back to raw EOA signing if no Circle wallet was created
  const circleWalletId = sessionKeyRow.circle_wallet_id ?? null;
  const depositorAddress = sessionKeyRow.circle_wallet_address ?? sessionKeyRow.session_address;
  const signerPrivateKey = circleWalletId ? null : decryptKey(sessionKeyRow.encrypted_private_key);

  const recipientAddress = job.payer_address; // smart account on Arc (receives minted USDC)

  console.log(`[orchestrator:${jobId}] Depositor: ${depositorAddress} (${circleWalletId ? "Circle wallet" : "session key EOA"})`);
  console.log(`[orchestrator:${jobId}] Recipient on Arc (smart account): ${recipientAddress}`);

  // Destination recipient is the smart account (USDC lands here, stepPay pays merchant)
  const { attestation, attestationSignature } = await initiateTransfer(
    sources,
    config.destinationChain.key,
    recipientAddress,    // minted USDC goes to smart account on Arc
    depositorAddress,    // Circle wallet (or EOA) holds the gateway balance
    signerPrivateKey,    // null if using Circle SDK
    circleWalletId       // Circle wallet ID for SDK signing (preferred)
  );

  updateJobStatus(jobId, "MINTING", {
    quote: {
      ...job.quote,
      _attestation: attestation,
      _attestationSignature: attestationSignature,
    },
  });
  await stepMint(jobId);
}

// ── State: MINTING ────────────────────────────────────────────────────────────

async function stepMint(jobId) {
  const job = getJob(jobId);
  console.log(`[orchestrator:${jobId}] MINTING on Arc`);

  const { _attestation, _attestationSignature } = job.quote;
  if (!_attestation || !_attestationSignature) {
    throw new Error("Missing attestation or attestationSignature for mint step");
  }

  const sessionKeyRow = getSessionKey(job.payer_address);
  if (!sessionKeyRow) throw new Error("Session key not found for payer");

  const arcClient = await buildSmartAccountClient(
    job.payer_address,
    config.destinationChain,
    sessionKeyRow.encrypted_private_key
  );

  const mintTx = buildMintTx(_attestation, _attestationSignature);
  const { txHash } = await sendBatchUserOp(arcClient, [mintTx]);

  updateJobTxHash(jobId, { mint: txHash });
  updateJobStatus(jobId, "PAYING");
  await stepPay(jobId);
}

// ── State: PAYING ─────────────────────────────────────────────────────────────

async function stepPay(jobId) {
  const job = getJob(jobId);
  console.log(`[orchestrator:${jobId}] PAYING merchant on Arc`);

  const routerAddress = process.env.PAYMENT_ROUTER_ADDRESS;
  if (!routerAddress) throw new Error("PAYMENT_ROUTER_ADDRESS not set");

  const sessionKeyRow = getSessionKey(job.payer_address);
  if (!sessionKeyRow) throw new Error("Session key not found for payer");

  const arcClient = await buildSmartAccountClient(
    job.payer_address,
    config.destinationChain,
    sessionKeyRow.encrypted_private_key
  );

  // grossAmount = what the merchant should receive (before PaymentRouter fee).
  // The smart account on Arc holds userAuthorizes minus Circle's bridge fee, which is
  // always >> merchantReceives, so the smart account has sufficient balance.
  const grossAmount = parseUnits(job.quote.merchantReceives, USDC_DECIMALS);
  const paymentRef = job.payment_ref
    ? keccak256(toHex(job.payment_ref))
    : `0x${"00".repeat(32)}`;

  // Approve PaymentRouter to spend grossAmount
  const approveTx = {
    to: config.destinationChain.usdcAddress,
    data: encodeFunctionData({
      abi: PAYMENT_ROUTER_ABI,
      functionName: "approve",
      args: [routerAddress, grossAmount],
    }),
    value: 0n,
  };

  // Check for split config
  const splitConfig = getSplitConfig(job.merchant_address);

  let payTx;
  if (splitConfig && splitConfig.length > 0) {
    const recipients = splitConfig.map((s) => s.address);
    const bps = splitConfig.map((s) => BigInt(s.bps));
    payTx = {
      to: routerAddress,
      data: encodeFunctionData({
        abi: PAYMENT_ROUTER_ABI,
        functionName: "splitPay",
        args: [recipients, bps, grossAmount, paymentRef],
      }),
      value: 0n,
    };
    console.log(`[orchestrator:${jobId}] Using splitPay with ${splitConfig.length} recipients`);
  } else {
    payTx = {
      to: routerAddress,
      data: encodeFunctionData({
        abi: PAYMENT_ROUTER_ABI,
        functionName: "pay",
        args: [job.merchant_address, grossAmount, paymentRef],
      }),
      value: 0n,
    };
  }

  const { txHash } = await sendBatchUserOp(arcClient, [approveTx, payTx]);

  updateJobTxHash(jobId, { pay: txHash });
  updateJobStatus(jobId, "COMPLETE");
  console.log(`[orchestrator:${jobId}] COMPLETE — tx: ${txHash}`);

  // Dispatch webhook async (never fails the job)
  const completedJob = getJob(jobId);
  dispatchWebhook(completedJob).catch((err) => {
    console.error(`[orchestrator:${jobId}] Webhook dispatch error:`, err.message);
  });
}

// ── Retry ─────────────────────────────────────────────────────────────────────

/**
 * Retry a failed job from the last successful state.
 */
export async function retryJob(jobId) {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  if (job.status !== "FAILED") throw new Error(`Job ${jobId} is not in FAILED state`);

  const hashes = job.tx_hashes ?? {};
  let resumeState;

  if (hashes.pay) {
    resumeState = "PAYING";
  } else if (hashes.mint) {
    resumeState = "PAYING";
  } else if (hashes.deposit) {
    resumeState = "GATEWAY_TRANSFERRING";
  } else if (hashes.swap) {
    resumeState = "GATEWAY_DEPOSITING";
  } else {
    resumeState = "SCANNING";
  }

  updateJobStatus(jobId, resumeState, { error: null });
  await runOrchestrator(jobId, {});
}
