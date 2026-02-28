import "dotenv/config";
import express from "express";
import cors from "cors";
import apiRoutes from "./api/routes.js";
import { getGatewayInfo } from "./bridge/gatewayBridge.js";
import { expireStaleJobs } from "./db/database.js";
import { tickSubscriptions } from "./subscriptions/subscriptions.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Mount all API routes under /api
app.use("/api", apiRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", network: process.env.NETWORK ?? "testnet" });
});

app.listen(PORT, async () => {
  console.log(`Backend running on port ${PORT} (${process.env.NETWORK ?? "testnet"})`);

  // Pre-fetch and cache Gateway wallet contract addresses
  try {
    const contracts = await getGatewayInfo();
    console.log("Gateway contracts cached:", Object.keys(contracts).length, "chains");
  } catch (err) {
    console.warn("Could not pre-fetch Gateway info (will retry on first use):", err.message);
  }

  // Expire stale payment jobs on startup
  const expired = expireStaleJobs();
  if (expired > 0) console.log(`Expired ${expired} stale job(s)`);

  // Expire stale jobs every 5 minutes
  setInterval(() => {
    const n = expireStaleJobs();
    if (n > 0) console.log(`[scheduler] Expired ${n} stale job(s)`);
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
