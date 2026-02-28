import { randomUUID } from "crypto";
import { parseUnits, formatEther, formatUnits, keccak256, toHex, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
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
// smartAccount.js (ERC-4337) is no longer used in the payment flow — plain EOA only.
import { decryptKey } from "../aa/sessionKeys.js";
import { bridgeUsdcToArc } from "../bridge/bridgeKitBridge.js";
import { config } from "../config/networks.js";
import { getSplitConfig } from "../merchant/merchant.js";
import { dispatchWebhook } from "../webhooks/webhookDispatcher.js";

const USDC_DECIMALS = 6;
// How much ETH to keep on Ethereum Sepolia for gas when executing a swap
const SWAP_GAS_RESERVE_WEI = parseUnits("0.003", 18);

// Minimal ERC-20 ABI for reading USDC balance after a swap
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

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
 *  → BRIDGING  (Circle Bridge Kit CCTPv2: approve + burn + mint in one call)
 *  → PAYING    (session key EOA calls approve + pay on Arc directly)
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
export async function createPaymentJob({ payerAddress, merchantAddress, targetAmount, label, paymentRef, expiresAt }) {
  const jobId = randomUUID();
  await createJob({
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
  runOrchestrator(jobId, { skipConfirmation: true }).catch(async (err) => {
    console.error(`[orchestrator] Job ${jobId} crashed:`, err.message);
    await updateJobStatus(jobId, "FAILED", { error: err.message });
  });
  return jobId;
}

/**
 * Create a payment job that skips the AWAITING_CONFIRMATION step.
 * Used by subscription auto-charges.
 */
export async function createPaymentJobAutoExecute({ payerAddress, merchantAddress, targetAmount, label, paymentRef, expiresAt }) {
  const jobId = randomUUID();
  await createJob({
    id: jobId,
    payer_address: payerAddress,
    merchant_address: merchantAddress,
    target_amount: targetAmount,
    label: label ?? null,
    payment_ref: paymentRef ?? null,
    status: "SCANNING",
    expires_at: expiresAt ?? null,
  });
  runOrchestrator(jobId, { skipConfirmation: true }).catch(async (err) => {
    console.error(`[orchestrator] Auto-job ${jobId} crashed:`, err.message);
    await updateJobStatus(jobId, "FAILED", { error: err.message });
  });
  return jobId;
}

// ── Main state machine ────────────────────────────────────────────────────────

async function runOrchestrator(jobId, opts = {}) {
  const job = await getJob(jobId);
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
    case "BRIDGING":
      await stepBridge(jobId);
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
  const job = await getJob(jobId);
  console.log(`[orchestrator:${jobId}] SCANNING balances for ${job.payer_address}`);

  // If a Circle wallet was pre-created during session/create, the user funded it
  // directly — scan that address instead of the smart account (which has no USDC).
  const sessionKeyRow = await getSessionKey(job.payer_address);
  const scanAddress = sessionKeyRow?.circle_wallet_address ?? job.payer_address;
  if (scanAddress !== job.payer_address) {
    console.log(`[orchestrator:${jobId}] Pre-funded Circle wallet detected — scanning ${scanAddress}`);
  }

  // Retry up to 6× (max ~30s) to handle RPC lag: the backend node may take a few
  // seconds to index the block that the frontend already confirmed via receipt.
  const MAX_RETRIES = 6;
  const RETRY_DELAY_MS = 5000;
  let balances;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    balances = await scanBalances(scanAddress);
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

  await updateJobStatus(jobId, "ROUTING", { source_plan: { _rawBalances: balances } });
  await stepRoute(jobId, opts);
}

// ── State: ROUTING ────────────────────────────────────────────────────────────

async function stepRoute(jobId, opts = {}) {
  const job = await getJob(jobId);
  console.log(`[orchestrator:${jobId}] ROUTING`);

  const rawBalances = job.source_plan?._rawBalances;
  const quote = await getQuote(job.payer_address, job.target_amount, rawBalances ?? undefined);

  if (!quote.sufficientFunds) {
    await updateJobStatus(jobId, "FAILED", {
      error: `Insufficient funds. Need ${job.target_amount} USDC + fees. Shortfall: ${quote.shortfallUsdc} USDC`,
    });
    return;
  }

  const quoteData = {
    totalFees: quote.totalFees,
    userAuthorizes: quote.userAuthorizes,
    merchantReceives: quote.merchantReceives,
    breakdown: quote.breakdown,
    isDirect: quote.isDirect ?? false,
  };

  // ── Arc-direct shortcut ──────────────────────────────────────────────────────
  // Payer already has USDC on Arc — skip the entire bridge chain and go straight
  // to PAYING where the session key EOA executes approve + pay as plain EOA txs.
  if (quote.isDirect) {
    await updateJobStatus(jobId, "PAYING", { source_plan: quote.sourcePlan, quote: quoteData });
    console.log(`[orchestrator:${jobId}] Arc-direct path — skipping bridge, going straight to PAYING`);
    await stepPay(jobId);
    return;
  }

  if (opts.skipConfirmation) {
    // For subscription auto-charges, skip AWAITING_CONFIRMATION
    const hasSwap = quote.sourcePlan.some((s) => s.type === "swap");
    const nextState = hasSwap ? "SWAPPING" : "BRIDGING";
    await updateJobStatus(jobId, nextState, { source_plan: quote.sourcePlan, quote: quoteData });
    console.log(`[orchestrator:${jobId}] Auto-executing (skipConfirmation), next: ${nextState}`);
    await runOrchestrator(jobId, opts);
  } else {
    await updateJobStatus(jobId, "AWAITING_CONFIRMATION", {
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
  const job = await getJob(jobId);
  if (!job || job.status !== "AWAITING_CONFIRMATION") {
    throw new Error(`Job ${jobId} is not in AWAITING_CONFIRMATION state`);
  }

  const hasSwap = job.source_plan?.some((s) => s.type === "swap");
  const nextState = hasSwap ? "SWAPPING" : "BRIDGING";
  await updateJobStatus(jobId, nextState);

  await runOrchestrator(jobId, {});
}

// ── State: SWAPPING ───────────────────────────────────────────────────────────

async function stepSwap(jobId) {
  const job = await getJob(jobId);
  const swapSteps = job.source_plan.filter((s) => s.type === "swap");
  console.log(`[orchestrator:${jobId}] SWAPPING (${swapSteps.length} steps) via EOA`);

  const sessionKeyRow = await getSessionKey(job.payer_address);
  if (!sessionKeyRow) throw new Error("Session key not found for payer");
  const privateKey = decryptKey(sessionKeyRow.encrypted_private_key);
  const account = privateKeyToAccount(privateKey);

  const swapProvider = getSwapProvider();
  const swapTxHashes = {};
  const updatedPlan = [...job.source_plan];

  for (const step of swapSteps) {
    const chainConfig = config.sourceChains.find((c) => c.key === step.chain);
    const viemChain = {
      id: chainConfig.chainId,
      name: chainConfig.name,
      nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
      rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
    };

    const publicClient = createPublicClient({ chain: viemChain, transport: http(chainConfig.rpcUrl) });
    const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chainConfig.rpcUrl) });

    // The session key EOA received the user's ETH via the fund tx.
    // Reserve SWAP_GAS_RESERVE_WEI for the swap tx gas cost; swap everything else.
    const ethBalance = await publicClient.getBalance({ address: account.address });
    const swapAmountWei = ethBalance > SWAP_GAS_RESERVE_WEI
      ? ethBalance - SWAP_GAS_RESERVE_WEI
      : (ethBalance * 8n) / 10n; // fallback: use 80% if balance is very low
    const swapAmountEth = formatEther(swapAmountWei);

    console.log(
      `[orchestrator:${jobId}] Swapping ${swapAmountEth} ETH → USDC on ${step.chain}` +
      ` (reserved ${formatEther(SWAP_GAS_RESERVE_WEI)} ETH for gas)`
    );

    // Build Uniswap V2 swap tx — swapExactETHForTokens, USDC lands in session key EOA
    const swapTx = await swapProvider.buildSwapTx(
      step.fromToken,
      "USDC",
      swapAmountEth,
      account.address,   // USDC recipient = session key EOA (same as sender)
      chainConfig.chainId
    );

    const hash = await walletClient.sendTransaction({
      to: swapTx.to,
      data: swapTx.data,
      value: swapAmountWei,  // send the ETH being swapped (payable call)
    });
    await publicClient.waitForTransactionReceipt({ hash });
    swapTxHashes[step.chain] = hash;
    console.log(`[orchestrator:${jobId}] Swap confirmed on ${step.chain}: ${hash}`);

    // Read actual USDC balance so stepBridge knows the exact amount to bridge
    const usdcRaw = await publicClient.readContract({
      address: chainConfig.usdcAddress,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });
    const actualUsdc = formatUnits(usdcRaw, USDC_DECIMALS);
    console.log(`[orchestrator:${jobId}] Post-swap USDC on ${step.chain}: ${actualUsdc}`);

    // Update this step in the plan with the actual USDC received
    const planIdx = updatedPlan.findIndex((s) => s.chain === step.chain && s.type === "swap");
    if (planIdx !== -1) {
      updatedPlan[planIdx] = { ...updatedPlan[planIdx], fromAmount: swapAmountEth, toUsdc: actualUsdc };
    }
  }

  await updateJobTxHash(jobId, { swap: swapTxHashes });
  // Save updated plan (with actual toUsdc values) before bridging
  await updateJobStatus(jobId, "BRIDGING", { source_plan: updatedPlan });
  await stepBridge(jobId);
}

// ── State: BRIDGING ───────────────────────────────────────────────────────────

/**
 * Bridge USDC from source chain(s) to Arc Testnet using Circle Bridge Kit (CCTPv2).
 *
 * The session key EOA (private key stored encrypted in DB) is both the sender on the
 * source chain and the recipient on Arc. After this step, the session key EOA holds
 * USDC on Arc and can pay the merchant directly (stepDirectArcPay).
 */
async function stepBridge(jobId) {
  const job = await getJob(jobId);

  const sessionKeyRow = await getSessionKey(job.payer_address);
  if (!sessionKeyRow) throw new Error("Session key not found for payer");

  const privateKey = decryptKey(sessionKeyRow.encrypted_private_key);

  // Collect all steps that require bridging (non-direct, swap or usdc type)
  const bridgeSteps = (job.source_plan ?? []).filter((s) => !s.isDirect);

  console.log(
    `[orchestrator:${jobId}] BRIDGING via Circle Bridge Kit — ${bridgeSteps.length} source chain(s): ` +
    bridgeSteps.map((s) => s.chain).join(", ")
  );

  // Bridge sequentially to avoid nonce conflicts on Arc (both mint txs use the same signer)
  for (let i = 0; i < bridgeSteps.length; i++) {
    const step = bridgeSteps[i];
    const amount = step.type === "swap" ? (step.toUsdc ?? "0") : step.amount;

    console.log(`[orchestrator:${jobId}] Bridge ${i + 1}/${bridgeSteps.length}: ${amount} USDC from ${step.chain} → Arc`);
    const BRIDGE_TIMEOUT_MS = 25 * 60 * 1000; // 25 minutes
    const destAddress = await Promise.race([
      bridgeUsdcToArc(privateKey, step.chain, amount),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Bridge timed out after 25 minutes")), BRIDGE_TIMEOUT_MS)
      ),
    ]);
    console.log(`[orchestrator:${jobId}] Bridge ${i + 1}/${bridgeSteps.length} done — USDC at ${destAddress} on Arc`);
  }

  await updateJobStatus(jobId, "PAYING", { quote: { ...job.quote, _bridgeKit: true } });
  await stepDirectArcPay(jobId);
}

// ── State: PAYING ─────────────────────────────────────────────────────────────

// ── State: PAYING (Arc-direct — session key EOA, no ERC-4337) ────────────────

/**
 * Arc-direct payment: the session key EOA holds USDC on Arc and calls
 * PaymentRouter directly as a plain EOA transaction (no Pimlico/ERC-4337).
 * USDC is Arc's native gas token, so the EOA pays gas from the same balance.
 */
async function stepDirectArcPay(jobId) {
  const job = await getJob(jobId);
  console.log(`[orchestrator:${jobId}] PAYING (Arc-direct EOA)`);

  const routerAddress = process.env.PAYMENT_ROUTER_ADDRESS;
  if (!routerAddress) throw new Error("PAYMENT_ROUTER_ADDRESS not set");

  const sessionKeyRow = await getSessionKey(job.payer_address);
  if (!sessionKeyRow) throw new Error("Session key not found for payer");

  const privateKey = decryptKey(sessionKeyRow.encrypted_private_key);
  const account = privateKeyToAccount(privateKey);

  // Arc Testnet: USDC is the native gas token (decimals 6)
  const arcChain = {
    id: config.destinationChain.chainId,
    name: config.destinationChain.name,
    nativeCurrency: { decimals: 6, name: "USDC", symbol: "USDC" },
    rpcUrls: { default: { http: [config.destinationChain.rpcUrl] } },
  };

  const publicClient = createPublicClient({ chain: arcChain, transport: http(config.destinationChain.rpcUrl) });
  const walletClient = createWalletClient({ account, chain: arcChain, transport: http(config.destinationChain.rpcUrl) });

  const grossAmount = parseUnits(job.quote.merchantReceives, USDC_DECIMALS);
  const paymentRef = job.payment_ref
    ? keccak256(toHex(job.payment_ref))
    : `0x${"00".repeat(32)}`;

  const usdcAddress = config.destinationChain.usdcAddress;

  // Step 1: approve PaymentRouter to spend grossAmount
  console.log(`[orchestrator:${jobId}] Arc-direct: approving ${job.quote.merchantReceives} USDC to PaymentRouter...`);
  const approveHash = await walletClient.writeContract({
    address: usdcAddress,
    abi: PAYMENT_ROUTER_ABI,
    functionName: "approve",
    args: [routerAddress, grossAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log(`[orchestrator:${jobId}] Arc-direct approve confirmed: ${approveHash}`);

  // Step 2: pay (or splitPay)
  const splitConfig = await getSplitConfig(job.merchant_address);
  let payHash;
  if (splitConfig && splitConfig.length > 0) {
    payHash = await walletClient.writeContract({
      address: routerAddress,
      abi: PAYMENT_ROUTER_ABI,
      functionName: "splitPay",
      args: [splitConfig.map((s) => s.address), splitConfig.map((s) => BigInt(s.bps)), grossAmount, paymentRef],
    });
  } else {
    payHash = await walletClient.writeContract({
      address: routerAddress,
      abi: PAYMENT_ROUTER_ABI,
      functionName: "pay",
      args: [job.merchant_address, grossAmount, paymentRef],
    });
  }
  await publicClient.waitForTransactionReceipt({ hash: payHash });

  await updateJobTxHash(jobId, { pay: payHash });
  await updateJobStatus(jobId, "COMPLETE");
  console.log(`[orchestrator:${jobId}] COMPLETE (Arc-direct) — tx: ${payHash}`);

  // Dispatch webhook async (never fails the job)
  const completedJob = await getJob(jobId);
  dispatchWebhook(completedJob).catch((err) => {
    console.error(`[orchestrator:${jobId}] Webhook dispatch error:`, err.message);
  });
}

// ── State: PAYING ─────────────────────────────────────────────────────────────

async function stepPay(jobId) {
  // All payment paths use the session key EOA directly on Arc (no ERC-4337).
  //   Arc-direct:  EOA already had USDC on Arc.
  //   Bridge Kit:  USDC just bridged to the same EOA address on Arc.
  await stepDirectArcPay(jobId);
}

// ── Retry ─────────────────────────────────────────────────────────────────────

/**
 * Retry a failed job from the last successful state.
 */
export async function retryJob(jobId) {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  if (job.status !== "FAILED") throw new Error(`Job ${jobId} is not in FAILED state`);

  const hashes = job.tx_hashes ?? {};
  let resumeState;

  if (hashes.pay) {
    resumeState = "PAYING";
  } else if (hashes.swap) {
    resumeState = "BRIDGING";
  } else {
    resumeState = "SCANNING";
  }

  await updateJobStatus(jobId, resumeState, { error: null });
  await runOrchestrator(jobId, {});
}
