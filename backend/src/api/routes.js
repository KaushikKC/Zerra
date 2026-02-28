import { Router } from "express";
import { encodeFunctionData, parseUnits, parseEther } from "viem";
import { scanBalances } from "../scanner/balanceScanner.js";
import { getQuote } from "../router/quoteEngine.js";
import { generateSessionKey, encryptKey } from "../aa/sessionKeys.js";
import {
  saveSessionKey,
  getSessionKey,
  getJob,
  getMerchantWebhookDeliveries,
} from "../db/database.js";
import {
  createPaymentJob,
  confirmAndExecute,
  retryJob,
} from "../orchestrator/paymentOrchestrator.js";
import { generatePaymentLink, verifyPaymentLink } from "../links/paymentLinks.js";
import {
  registerMerchant,
  getMerchant,
  getMerchantPayments,
  getMerchantAllPayments,
  updateWebhookUrl,
  setSplitConfig,
  getSplitConfig,
} from "../merchant/merchant.js";
import { setupSlug, upsertProduct, removeProduct, getStorefront } from "../storefront/storefront.js";
import {
  createSubscription,
  getSubscription,
  authorizeSubscription,
  cancelSubscription,
  getMerchantSubscriptions,
  getPayerSubscriptions,
} from "../subscriptions/subscriptions.js";
import { dispatchTestWebhook } from "../webhooks/webhookDispatcher.js";
import { config } from "../config/networks.js";

const router = Router();

// Minimal ERC-20 transfer ABI for building fund transactions
const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
];

// ── GET /api/balances/:walletAddress ──────────────────────────────────────────

router.get("/balances/:walletAddress", async (req, res) => {
  try {
    const balances = await scanBalances(req.params.walletAddress);
    res.json(balances);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/quote ───────────────────────────────────────────────────────────

router.post("/quote", async (req, res) => {
  const { walletAddress, targetAmount } = req.body;
  if (!walletAddress || !targetAmount) {
    return res.status(400).json({ error: "walletAddress and targetAmount are required" });
  }
  try {
    const quote = await getQuote(walletAddress, targetAmount);
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/session/create ──────────────────────────────────────────────────

router.post("/session/create", async (req, res) => {
  const { walletAddress, spendLimitUsdc, expirySeconds = 3600, sourcePlan } = req.body;
  if (!walletAddress || !spendLimitUsdc) {
    return res.status(400).json({ error: "walletAddress and spendLimitUsdc are required" });
  }

  try {
    const { privateKey, address: sessionAddress } = generateSessionKey();
    const encryptedKey = encryptKey(privateKey);
    const expiry = Math.floor(Date.now() / 1000) + expirySeconds;

    const plan =
      sourcePlan && sourcePlan.length > 0
        ? sourcePlan
        : [{ chain: config.sourceChains.find((c) => !c.isDirect)?.key ?? config.sourceChains[0].key, type: "usdc", amount: spendLimitUsdc }];

    // With Bridge Kit: the session key EOA is ALWAYS the payer address.
    //   Arc-direct  → session key EOA holds USDC on Arc, pays directly
    //   Cross-chain → session key EOA holds USDC on source chain, Bridge Kit
    //                 bridges it to the SAME EOA address on Arc, then pays directly
    const payerAddress = sessionAddress;

    // Index the session key so the orchestrator can look it up via
    // getSessionKey(job.payer_address).
    await saveSessionKey({
      wallet_address: payerAddress,
      encrypted_private_key: encryptedKey,
      session_address: sessionAddress,
      allowed_contracts: [],
      spend_limit: spendLimitUsdc,
      expiry,
    });

    // Build fund transactions — user sends USDC (or ETH for swaps) from their EOA
    // directly to the session key EOA on the source chain.
    // Bridge Kit will then bridge from session key EOA → session key EOA on Arc.
    const fundTxes = [];
    for (const step of plan) {
      const chainConfig = config.sourceChains.find((c) => c.key === step.chain);
      if (!chainConfig) continue;

      if (step.type === "swap") {
        fundTxes.push({
          chainId: chainConfig.chainId,
          to: sessionAddress,
          data: "0x",
          value: parseEther(String(step.fromAmount)).toString(),
        });
      } else {
        const data = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [sessionAddress, parseUnits(String(step.amount), 6)],
        });
        fundTxes.push({
          chainId: chainConfig.chainId,
          to: chainConfig.usdcAddress,
          data,
          value: "0",
        });
      }
    }

    res.json({ sessionAddress, payerAddress, expiry, fundTxes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/pay ─────────────────────────────────────────────────────────────

router.post("/pay", async (req, res) => {
  const { payerAddress, merchantAddress, targetAmount, label, paymentRef, expiresAt } = req.body;
  if (!payerAddress || !merchantAddress || !targetAmount) {
    return res.status(400).json({ error: "payerAddress, merchantAddress, targetAmount are required" });
  }

  try {
    const jobId = await createPaymentJob({ payerAddress, merchantAddress, targetAmount, label, paymentRef, expiresAt });
    res.status(201).json({ jobId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/pay/:jobId/status ────────────────────────────────────────────────

router.get("/pay/:jobId/status", async (req, res) => {
  const job = await getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.json({
    jobId: job.id,
    status: job.status,
    sourcePlan: job.source_plan,
    quote: job.quote,
    txHashes: job.tx_hashes,
    error: job.error,
    merchantAddress: job.merchant_address,
    targetAmount: job.target_amount,
    label: job.label,
    expiresAt: job.expires_at,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  });
});

// ── GET /api/pay/:jobId/receipt ───────────────────────────────────────────────
// Public receipt — safe fields only, no session info

router.get("/pay/:jobId/receipt", async (req, res) => {
  const job = await getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.json({
    jobId: job.id,
    status: job.status,
    merchantAddress: job.merchant_address,
    targetAmount: job.target_amount,
    label: job.label,
    merchantReceives: job.quote?.merchantReceives ?? null,
    txHash: job.tx_hashes?.pay ?? null,
    expiresAt: job.expires_at,
    createdAt: job.created_at,
  });
});

// ── POST /api/pay/:jobId/confirm ──────────────────────────────────────────────

router.post("/pay/:jobId/confirm", async (req, res) => {
  try {
    await confirmAndExecute(req.params.jobId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/pay/:jobId/retry ────────────────────────────────────────────────

router.post("/pay/:jobId/retry", async (req, res) => {
  try {
    await retryJob(req.params.jobId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/payment-link/create ────────────────────────────────────────────

router.post("/payment-link/create", async (req, res) => {
  const { merchantAddress, amount, label, ref, expiryHours } = req.body;
  if (!merchantAddress || !amount || !label) {
    return res.status(400).json({ error: "merchantAddress, amount, and label are required" });
  }

  try {
    const result = await generatePaymentLink(merchantAddress, amount, label, ref, expiryHours);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/payment-link/verify ─────────────────────────────────────────────

router.get("/payment-link/verify", (req, res) => {
  const result = verifyPaymentLink(req.query);
  if (!result.valid) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// ── POST /api/merchant/register ───────────────────────────────────────────────

router.post("/merchant/register", async (req, res) => {
  const { walletAddress, displayName, logoUrl } = req.body;
  if (!walletAddress || !displayName) {
    return res.status(400).json({ error: "walletAddress and displayName are required" });
  }

  try {
    const merchant = await registerMerchant(walletAddress, displayName, logoUrl);
    res.status(201).json(merchant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/merchant/:walletAddress ──────────────────────────────────────────

router.get("/merchant/:walletAddress", async (req, res) => {
  const merchant = await getMerchant(req.params.walletAddress);
  if (!merchant) return res.status(404).json({ error: "Merchant not found" });
  res.json(merchant);
});

// ── GET /api/merchant/:walletAddress/payments ─────────────────────────────────

router.get("/merchant/:walletAddress/payments", async (req, res) => {
  const limit = parseInt(req.query.limit ?? "20", 10);
  const offset = parseInt(req.query.offset ?? "0", 10);
  const all = req.query.all === "1";

  try {
    const payments = all
      ? await getMerchantAllPayments(req.params.walletAddress, limit, offset)
      : await getMerchantPayments(req.params.walletAddress, limit, offset);
    res.json({ payments, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/merchant/split ──────────────────────────────────────────────────

router.post("/merchant/split", async (req, res) => {
  const { walletAddress, splits } = req.body;
  if (!walletAddress || !splits) {
    return res.status(400).json({ error: "walletAddress and splits are required" });
  }

  try {
    const merchant = await setSplitConfig(walletAddress, splits);
    res.json(merchant);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/merchant/:address/split ─────────────────────────────────────────

router.get("/merchant/:address/split", async (req, res) => {
  try {
    const splits = await getSplitConfig(req.params.address);
    res.json({ splits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/merchant/webhook ────────────────────────────────────────────────

router.post("/merchant/webhook", async (req, res) => {
  const { walletAddress, webhookUrl } = req.body;
  if (!walletAddress || !webhookUrl) {
    return res.status(400).json({ error: "walletAddress and webhookUrl are required" });
  }

  try {
    const merchant = await updateWebhookUrl(walletAddress, webhookUrl);
    res.json(merchant);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/merchant/webhook/test ──────────────────────────────────────────

router.post("/merchant/webhook/test", async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ error: "walletAddress is required" });
  }

  try {
    const merchant = await getMerchant(walletAddress);
    if (!merchant?.webhook_url) {
      return res.status(400).json({ error: "No webhook URL configured" });
    }
    const deliveryId = await dispatchTestWebhook(walletAddress, merchant.webhook_url);
    res.json({ ok: true, deliveryId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/merchant/:address/webhooks ───────────────────────────────────────

router.get("/merchant/:address/webhooks", async (req, res) => {
  try {
    const deliveries = await getMerchantWebhookDeliveries(req.params.address, 20);
    res.json({ deliveries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/storefront/slug ─────────────────────────────────────────────────

router.post("/storefront/slug", async (req, res) => {
  const { walletAddress, slug } = req.body;
  if (!walletAddress || !slug) {
    return res.status(400).json({ error: "walletAddress and slug are required" });
  }

  try {
    const merchant = await setupSlug(walletAddress, slug);
    res.json(merchant);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/storefront/:slug ─────────────────────────────────────────────────

router.get("/storefront/:slug", async (req, res) => {
  const storefront = await getStorefront(req.params.slug);
  if (!storefront) return res.status(404).json({ error: "Storefront not found" });
  res.json(storefront);
});

// ── POST /api/storefront/product ──────────────────────────────────────────────

router.post("/storefront/product", async (req, res) => {
  const { merchantAddress, name, description, price, imageUrl, sortOrder, type, intervalDays } = req.body;
  if (!merchantAddress || !name || !price) {
    return res.status(400).json({ error: "merchantAddress, name, and price are required" });
  }

  try {
    const id = await upsertProduct(merchantAddress, { name, description, price, imageUrl, sortOrder, type, intervalDays });
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PUT /api/storefront/product/:id ──────────────────────────────────────────

router.put("/storefront/product/:id", async (req, res) => {
  const { merchantAddress, name, description, price, imageUrl, sortOrder, type, intervalDays } = req.body;
  if (!merchantAddress) {
    return res.status(400).json({ error: "merchantAddress is required" });
  }

  try {
    await upsertProduct(merchantAddress, { id: req.params.id, name, description, price, imageUrl, sortOrder, type, intervalDays });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE /api/storefront/product/:id ───────────────────────────────────────

router.delete("/storefront/product/:id", async (req, res) => {
  const { merchantAddress } = req.body;
  if (!merchantAddress) {
    return res.status(400).json({ error: "merchantAddress is required" });
  }

  try {
    await removeProduct(req.params.id, merchantAddress);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/subscriptions ───────────────────────────────────────────────────

router.post("/subscriptions", async (req, res) => {
  const { merchantAddress, payerAddress, amountUsdc, intervalDays, label } = req.body;
  if (!merchantAddress || !payerAddress || !amountUsdc || !intervalDays) {
    return res.status(400).json({ error: "merchantAddress, payerAddress, amountUsdc, intervalDays are required" });
  }

  try {
    const id = await createSubscription(merchantAddress, payerAddress, amountUsdc, intervalDays, label);
    const appUrl = process.env.APP_URL ?? "http://localhost:5173";
    res.status(201).json({ id, authorizeUrl: `${appUrl}/subscribe/${id}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/subscriptions/:id ────────────────────────────────────────────────

router.get("/subscriptions/:id", async (req, res) => {
  const sub = await getSubscription(req.params.id);
  if (!sub) return res.status(404).json({ error: "Subscription not found" });
  // Don't expose encrypted session key
  const { encrypted_session_key, ...safe } = sub;
  res.json(safe);
});

// ── POST /api/subscriptions/:id/authorize ────────────────────────────────────

router.post("/subscriptions/:id/authorize", async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ error: "walletAddress (payer) is required" });
  }

  try {
    const sub = await getSubscription(req.params.id);
    if (!sub) return res.status(404).json({ error: "Subscription not found" });
    if (sub.payer_address.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not the payer for this subscription" });
    }

    // Read session key from session_keys table (just created via /api/session/create)
    const sessionKeyRow = await getSessionKey(walletAddress);
    if (!sessionKeyRow) {
      return res.status(400).json({ error: "No session key found. Call /api/session/create first" });
    }

    await authorizeSubscription(
      req.params.id,
      sessionKeyRow.encrypted_private_key,
      sessionKeyRow.session_address,
      sessionKeyRow.expiry
    );

    res.json({ ok: true, subscriptionId: req.params.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/subscriptions/:id/cancel ───────────────────────────────────────

router.post("/subscriptions/:id/cancel", async (req, res) => {
  const { callerAddress } = req.body;
  if (!callerAddress) {
    return res.status(400).json({ error: "callerAddress is required" });
  }

  try {
    await cancelSubscription(req.params.id, callerAddress);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/subscriptions/merchant/:address ──────────────────────────────────

router.get("/subscriptions/merchant/:address", async (req, res) => {
  try {
    const subs = await getMerchantSubscriptions(req.params.address);
    res.json({ subscriptions: subs.map(({ encrypted_session_key, ...safe }) => safe) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/subscriptions/payer/:address ─────────────────────────────────────

router.get("/subscriptions/payer/:address", async (req, res) => {
  try {
    const subs = await getPayerSubscriptions(req.params.address);
    res.json({ subscriptions: subs.map(({ encrypted_session_key, ...safe }) => safe) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
