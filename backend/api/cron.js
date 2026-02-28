/**
 * Vercel Cron: runs scheduled maintenance (expire stale jobs, recover stuck jobs, subscription tick).
 * Triggered by vercel.json "crons" schedule; no HTTP auth needed (Vercel invokes internally).
 */
import "dotenv/config";
import {
  expireStaleJobs,
  findStuckJobs,
  updateJobStatus,
} from "../src/db/database.js";
import { tickSubscriptions } from "../src/subscriptions/subscriptions.js";

export const config = {
  maxDuration: 60,
};

export default async function handler(_req, res) {
  try {
    const results = { expired: 0, stuck: 0, subscriptionError: null };

    const expired = await expireStaleJobs();
    results.expired = expired;

    const stuck = await findStuckJobs();
    for (const { id } of stuck) {
      await updateJobStatus(id, "FAILED", {
        error: "Job timed out (stuck in processing)",
      });
      results.stuck += 1;
    }

    try {
      await tickSubscriptions();
    } catch (err) {
      results.subscriptionError = err.message;
    }

    res.status(200).json({ ok: true, ...results });
  } catch (err) {
    console.error("[cron]", err);
    res.status(500).json({ error: err.message });
  }
}
