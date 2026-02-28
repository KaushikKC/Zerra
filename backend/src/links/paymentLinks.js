import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from "crypto";
import QRCode from "qrcode";

/**
 * Deterministic string representation of payment link parameters.
 * expires is appended only when present so old links (without expires) remain valid.
 */
function buildSignaturePayload(merchantAddress, amount, label, ref, expires) {
  const parts = [
    merchantAddress.toLowerCase(),
    String(amount),
    String(label ?? ""),
    String(ref ?? ""),
  ];
  if (expires !== undefined && expires !== null && expires !== "") {
    parts.push(String(expires));
  }
  return parts.join("|");
}

/**
 * Compute HMAC-SHA256 signature for a payment link.
 */
function computeHmac(payload) {
  const secret = process.env.LINK_SECRET;
  if (!secret) throw new Error("LINK_SECRET is not set");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Generate a signed payment link and QR code.
 *
 * @param {string} merchantAddress
 * @param {string|number} amount       - USDC amount
 * @param {string} label               - Human-readable description
 * @param {string} [ref]               - Optional merchant reference ID
 * @param {number} [expiryHours=24]    - Link validity in hours (0 = no expiry)
 * @returns {{ url: string, qrCode: string, expiresAt: number|null }}
 */
export async function generatePaymentLink(merchantAddress, amount, label, ref = "", expiryHours = 24) {
  const appUrl = process.env.APP_URL ?? "http://localhost:5173";

  // Compute expiry timestamp (unix seconds). 0 means no expiry.
  const expires = expiryHours > 0
    ? Math.floor(Date.now() / 1000) + expiryHours * 3600
    : null;

  const payload = buildSignaturePayload(merchantAddress, amount, label, ref, expires);
  const sig = computeHmac(payload);

  const params = new URLSearchParams({
    to: merchantAddress,
    amount: String(amount),
    label: label ?? "",
    ...(ref ? { ref } : {}),
    ...(expires !== null ? { expires: String(expires) } : {}),
    sig,
  });

  const url = `${appUrl}/pay?${params.toString()}`;
  const qrCode = await QRCode.toDataURL(url, { width: 256, margin: 2 });

  return { url, qrCode, expiresAt: expires };
}

/**
 * Verify a payment link's HMAC signature and expiry.
 *
 * @param {object} params - { to, amount, label, ref, expires?, sig } from query string
 * @returns {{ valid: boolean, merchantAddress?, amount?, label?, ref?, expiresAt? }}
 */
export function verifyPaymentLink(params) {
  const { to, amount, label, ref, expires, sig } = params;

  if (!to || !amount || !sig) {
    return { valid: false, error: "Missing required parameters" };
  }

  // Check expiry before verifying HMAC
  if (expires) {
    const expiresAt = parseInt(expires, 10);
    if (!isNaN(expiresAt) && Math.floor(Date.now() / 1000) > expiresAt) {
      return { valid: false, error: "Link expired" };
    }
  }

  const payload = buildSignaturePayload(to, amount, label, ref, expires);
  let expectedSig;
  try {
    expectedSig = computeHmac(payload);
  } catch (err) {
    return { valid: false, error: err.message };
  }

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(sig, "hex");
  const expectedBuffer = Buffer.from(expectedSig, "hex");

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return { valid: false, error: "Invalid signature" };
  }

  return {
    valid: true,
    merchantAddress: to,
    amount,
    label: label ?? "",
    ref: ref ?? "",
    expiresAt: expires ? parseInt(expires, 10) : null,
  };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  return cryptoTimingSafeEqual(a, b);
}
