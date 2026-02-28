import "dotenv/config";
import app from "./app.js";
import { getGatewayInfo } from "./bridge/gatewayBridge.js";
import { expireStaleJobs, findStuckJobs, updateJobStatus } from "./db/database.js";
import { tickSubscriptions } from "./subscriptions/subscriptions.js";
import { seedDemoData } from "./db/seed.js";

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`Backend running on port ${PORT} (${process.env.NETWORK ?? "testnet"})`);

  // Pre-fetch and cache Gateway wallet contract addresses
  try {
    const contracts = await getGatewayInfo();
    console.log("Gateway contracts cached:", Object.keys(contracts).length, "chains");
  } catch (err) {
    console.warn("Could not pre-fetch Gateway info (will retry on first use):", err.message);
  }

  // Seed demo storefront data (idempotent — skips if already seeded)
  try {
    await seedDemoData();
  } catch (err) {
    console.warn("[seed] Demo data seed failed (non-fatal):", err.message);
  }

  // Expire stale payment jobs on startup
  try {
    const expired = await expireStaleJobs();
    if (expired > 0) console.log(`Expired ${expired} stale job(s)`);
  } catch (err) {
    if (err?.code === "ENOTFOUND" || err?.message?.includes("getaddrinfo")) {
      console.error("");
      console.error("Cannot reach Supabase database (ENOTFOUND). Use the Session pooler URL, not Direct:");
      console.error("  Supabase Dashboard → Connect → choose \"Session\" mode");
      console.error("  Host should be: aws-0-<region>.pooler.supabase.com (not db.xxx.supabase.co)");
      console.error("");
    }
    throw err;
  }

  // Expire stale jobs every 5 minutes
  setInterval(async () => {
    const n = await expireStaleJobs();
    if (n > 0) console.log(`[scheduler] Expired ${n} stale job(s)`);
  }, 5 * 60 * 1000);

  // Recover stuck jobs (BRIDGING/SWAPPING > 30 min) every 5 minutes
  setInterval(async () => {
    try {
      const stuck = await findStuckJobs();
      for (const { id } of stuck) {
        await updateJobStatus(id, "FAILED", { error: "Job timed out (stuck in processing)" });
        console.log(`[scheduler] Marked stuck job ${id} as FAILED`);
      }
    } catch (err) {
      console.error("[scheduler] Stuck-job recovery error:", err.message);
    }
  }, 5 * 60 * 1000);

  // Charge due subscriptions every 60 seconds
  setInterval(async () => {
    try {
      await tickSubscriptions();
    } catch (err) {
      console.error("[scheduler] Subscription tick error:", err.message);
    }
  }, 60 * 1000);
});
