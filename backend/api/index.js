/**
 * Vercel serverless entry: forwards all requests to the Express app.
 * Deploy from the backend directory and set DATABASE_URL (Postgres) in Vercel env.
 */
import "dotenv/config";
import app from "../src/app.js";

export default function handler(req, res) {
  return app(req, res);
}
