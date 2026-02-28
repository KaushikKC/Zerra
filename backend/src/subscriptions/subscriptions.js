import { randomUUID } from "crypto";
import {
  createSubscriptionDb,
  getSubscriptionDb,
  getDueSubscriptions,
  updateSubscriptionNextCharge,
  cancelSubscriptionDb,
  authorizeSubscriptionDb,
  getMerchantSubscriptions as dbGetMerchantSubscriptions,
  getPayerSubscriptions as dbGetPayerSubscriptions,
  saveSessionKey,
} from "../db/database.js";
import { createPaymentJobAutoExecute } from "../orchestrator/paymentOrchestrator.js";

/**
 * Create a new subscription (without session key — payer must authorize separately).
 */
export async function createSubscription(merchantAddress, payerAddress, amountUsdc, intervalDays, label) {
  if (!merchantAddress || !payerAddress || !amountUsdc || !intervalDays) {
    throw new Error("merchantAddress, payerAddress, amountUsdc, intervalDays are required");
  }
  if (intervalDays < 1) throw new Error("intervalDays must be >= 1");

  const id = randomUUID();
  const nextChargeAt = Date.now() + intervalDays * 24 * 60 * 60 * 1000;

  await createSubscriptionDb({
    id,
    merchant_address: merchantAddress,
    payer_address: payerAddress,
    amount_usdc: amountUsdc,
    label: label ?? null,
    interval_days: intervalDays,
    next_charge_at: nextChargeAt,
  });

  return id;
}

/**
 * Authorize a subscription — stores the payer's encrypted session key.
 * Called after the payer grants a session key via the frontend.
 */
export async function authorizeSubscription(subscriptionId, encryptedSessionKey, sessionAddress, sessionExpiry) {
  const sub = await getSubscriptionDb(subscriptionId);
  if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);
  if (sub.status !== "ACTIVE") throw new Error("Subscription is not active");

  await authorizeSubscriptionDb(subscriptionId, encryptedSessionKey, sessionAddress, sessionExpiry);
}

/**
 * Get a subscription by ID.
 */
export async function getSubscription(id) {
  return getSubscriptionDb(id);
}

/**
 * Get all subscriptions for a merchant.
 */
export async function getMerchantSubscriptions(merchantAddress) {
  return dbGetMerchantSubscriptions(merchantAddress);
}

/**
 * Get active subscriptions for a payer.
 */
export async function getPayerSubscriptions(payerAddress) {
  return dbGetPayerSubscriptions(payerAddress);
}

/**
 * Cancel a subscription. Caller must be the payer or the merchant.
 */
export async function cancelSubscription(id, callerAddress) {
  const sub = await getSubscriptionDb(id);
  if (!sub) throw new Error(`Subscription ${id} not found`);

  const caller = callerAddress.toLowerCase();
  if (caller !== sub.merchant_address.toLowerCase() && caller !== sub.payer_address.toLowerCase()) {
    throw new Error("Not authorized to cancel this subscription");
  }

  await cancelSubscriptionDb(id);
}

/**
 * Charge a due subscription — creates a payment job that executes automatically.
 * Advances next_charge_at before executing to prevent double-charging.
 */
export async function chargeSubscription(subscriptionId) {
  const sub = await getSubscriptionDb(subscriptionId);
  if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);
  if (sub.status !== "ACTIVE") throw new Error("Subscription is not active");
  if (!sub.encrypted_session_key || !sub.session_expiry) {
    throw new Error("Subscription not yet authorized by payer");
  }

  // Save the subscription's session key for the payer (used by orchestrator)
  await saveSessionKey({
    wallet_address: sub.payer_address,
    encrypted_private_key: sub.encrypted_session_key,
    session_address: sub.session_address,
    allowed_contracts: [process.env.PAYMENT_ROUTER_ADDRESS].filter(Boolean),
    spend_limit: sub.amount_usdc,
    expiry: sub.session_expiry,
  });

  // Advance next_charge_at immediately to prevent double-charge on retry
  const nextChargeAt = Date.now() + sub.interval_days * 24 * 60 * 60 * 1000;
  await updateSubscriptionNextCharge(subscriptionId, nextChargeAt);

  // Create payment job — skipConfirmation bypasses AWAITING_CONFIRMATION
  const jobId = await createPaymentJobAutoExecute({
    payerAddress: sub.payer_address,
    merchantAddress: sub.merchant_address,
    targetAmount: sub.amount_usdc,
    label: sub.label ?? `Subscription charge`,
  });

  console.log(`[subscriptions] Charged subscription ${subscriptionId} → job ${jobId}`);
  return jobId;
}

/**
 * Process all due subscriptions. Called by the scheduler.
 */
export async function tickSubscriptions() {
  const due = await getDueSubscriptions();
  if (due.length === 0) return;

  console.log(`[subscriptions] Charging ${due.length} due subscription(s)`);
  for (const sub of due) {
    try {
      await chargeSubscription(sub.id);
    } catch (err) {
      console.error(`[subscriptions] Failed to charge ${sub.id}:`, err.message);
    }
  }
}
