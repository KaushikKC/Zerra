import express from "express";
import cors from "cors";
import apiRoutes from "./api/routes.js";

const app = express();

app.use(cors());
app.use(express.json());

// Mount all API routes under /api
app.use("/api", apiRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", network: process.env.NETWORK ?? "testnet" });
});

export default app;
