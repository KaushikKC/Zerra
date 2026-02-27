import { createHmac, randomUUID } from "crypto";
import { getMerchant, saveWebhookDelivery, updateWebhookDelivery } from "../db/database.js";

const MAX_ATTEMPTS = 3;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sign a JSON string body with HMAC-SHA256 using LINK_SECRET.
 */
function signPayload(body) {
  const secret = process.env.LINK_SECRET;
  if (!secret) throw new Error("LINK_SECRET is not set");
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Dispatch a webhook for a completed payment job.
 * Retries up to 3× with exponential backoff (1s, 2s, 4s).
 * Non-blocking — errors are caught and logged; the job is never failed.
 *
 * @param {object} job - Completed payment job row (with parsed JSON fields)
 */
export async function dispatchWebhook(job) {
  try {
    const merchant = getMerchant(job.merchant_address);
    if (!merchant?.webhook_url) return; // No webhook configured

    const webhookUrl = merchant.webhook_url;

    const payload = {
      event: "payment.complete",
      jobId: job.id,
      merchantAddress: job.merchant_address,
      payerAddress: job.payer_address,
      amount: job.quote?.merchantReceives ?? job.target_amount,
      txHash: job.tx_hashes?.pay ?? null,
      label: job.label ?? null,
      paymentRef: job.payment_ref ?? null,
      timestamp: Date.now(),
    };

    const deliveryId = randomUUID();
    saveWebhookDelivery({
      id: deliveryId,
      job_id: job.id,
      url: webhookUrl,
      status: "PENDING",
      attempts: 0,
    });

    await _attemptDelivery(deliveryId, webhookUrl, payload, 0);
  } catch (err) {
    console.error(`[webhook] Dispatch error for job ${job.id}:`, err.message);
  }
}

async function _attemptDelivery(deliveryId, url, payload, attempt) {
  const body = JSON.stringify(payload);
  const sig = signPayload(body);

  let responseCode = null;
  let lastError = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Zerra-Signature": sig,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    responseCode = res.status;
    success = res.ok;

    if (!success) {
      lastError = `HTTP ${res.status}`;
    }
  } catch (err) {
    lastError = err.message;
  }

  const newAttempts = attempt + 1;

  if (success) {
    updateWebhookDelivery(deliveryId, {
      status: "DELIVERED",
      response_code: responseCode,
      attempts: newAttempts,
      delivered_at: Date.now(),
    });
    console.log(`[webhook] Delivered to ${url} (attempt ${newAttempts})`);
    return;
  }

  if (newAttempts >= MAX_ATTEMPTS) {
    updateWebhookDelivery(deliveryId, {
      status: "FAILED",
      response_code: responseCode,
      attempts: newAttempts,
      last_error: lastError,
    });
    console.warn(`[webhook] Failed after ${newAttempts} attempts: ${lastError}`);
    return;
  }

  // Exponential backoff before retry
  const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
  console.log(`[webhook] Attempt ${newAttempts} failed (${lastError}), retrying in ${backoffMs}ms`);
  updateWebhookDelivery(deliveryId, {
    status: "PENDING",
    response_code: responseCode,
    attempts: newAttempts,
    last_error: lastError,
  });

  await delay(backoffMs);
  await _attemptDelivery(deliveryId, url, payload, newAttempts);
}

/**
 * Fire a test webhook with a dummy payload.
 */
export async function dispatchTestWebhook(merchantAddress, webhookUrl) {
  const payload = {
    event: "payment.test",
    jobId: "test-" + randomUUID(),
    merchantAddress,
    payerAddress: "0x0000000000000000000000000000000000000000",
    amount: "1.00",
    txHash: null,
    label: "Test webhook",
    paymentRef: null,
    timestamp: Date.now(),
  };

  const deliveryId = randomUUID();
  saveWebhookDelivery({
    id: deliveryId,
    job_id: payload.jobId,
    url: webhookUrl,
    status: "PENDING",
    attempts: 0,
  });

  await _attemptDelivery(deliveryId, webhookUrl, payload, 0);
  return deliveryId;
}
