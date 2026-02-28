import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

let _client = null;

/**
 * Returns the Circle Developer-Controlled Wallets SDK client.
 * Initialized lazily from CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET env vars.
 */
export function getCircleClient() {
  if (!_client) {
    const apiKey = process.env.CIRCLE_API_KEY?.trim();
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.trim();
    if (!apiKey || !entitySecret) {
      throw new Error(
        "CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set in .env for Gateway deposits"
      );
    }
    _client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  }
  return _client;
}
