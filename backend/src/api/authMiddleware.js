import { recoverMessageAddress } from "viem";

/**
 * Middleware: verify that the caller signed a Zerra epoch-keyed message.
 *
 * Expected headers:
 *   X-Wallet-Address: "0x..."
 *   X-Wallet-Sig:     "0x..."
 *
 * Message format: "Zerra auth: {address_lowercase} {epoch5min}"
 * where epoch5min = Math.floor(Date.now() / 300_000)
 * (rotates every 5 minutes; we accept current + previous epoch for clock skew)
 */
export async function requireMerchantAuth(req, res, next) {
  const address = req.headers["x-wallet-address"];
  const sig = req.headers["x-wallet-sig"];

  if (!address || !sig) {
    return res.status(401).json({ error: "Auth required — include X-Wallet-Address and X-Wallet-Sig headers" });
  }

  const epoch = Math.floor(Date.now() / 300_000);

  for (const e of [epoch, epoch - 1]) {
    try {
      const message = `Zerra auth: ${address.toLowerCase()} ${e}`;
      const recovered = await recoverMessageAddress({ message, signature: sig });
      if (recovered.toLowerCase() === address.toLowerCase()) {
        return next();
      }
    } catch {
      // malformed sig — try next epoch
    }
  }

  return res.status(401).json({ error: "Invalid wallet signature" });
}
