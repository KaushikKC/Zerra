/**
 * Step 2 — Register your CIRCLE_ENTITY_SECRET with Circle.
 * Run from backend directory: node scripts/register-entity-secret.mjs
 * Requires CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET in .env (or pass as env vars).
 */
import "dotenv/config";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

if (!apiKey) {
  console.error("Missing CIRCLE_API_KEY. Set it in .env or pass CIRCLE_API_KEY=...");
  process.exit(1);
}
if (!entitySecret) {
  console.error("Missing CIRCLE_ENTITY_SECRET. Set it in .env (from Step 1 output).");
  process.exit(1);
}

console.log("Registering entity secret with Circle...");
const result = await registerEntitySecretCiphertext({
  apiKey,
  entitySecret: entitySecret.trim().replace(/^0x/, ""),
  recoveryFileDownloadPath: rootDir,
});

const recoveryPath = join(rootDir, `circle-recovery-file.dat`);
if (result.data?.recoveryFile) {
  writeFileSync(recoveryPath, result.data.recoveryFile);
  console.log("Recovery file saved:", recoveryPath);
}
console.log("Registered:", result.data ? "OK" : result);
console.log("You can now use CIRCLE_ENTITY_SECRET in .env. Keep the recovery file safe.");
