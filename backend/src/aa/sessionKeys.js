import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hexToBytes, encodeFunctionData, parseUnits } from "viem";

// AES-256-CBC: key must be exactly 32 bytes (256 bits)
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16; // 128-bit IV

/**
 * Load and validate the encryption key from environment.
 * Throws at startup if SESSION_ENCRYPTION_KEY is missing or wrong length.
 */
function getEncryptionKey() {
  const hex = process.env.SESSION_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "SESSION_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, "hex");
}

// ── Core crypto ───────────────────────────────────────────────────────────────

/**
 * AES-256-CBC encrypt a private key string.
 * @param {string} privateKey  - Hex private key (with or without 0x prefix)
 * @returns {string}  "<ivHex>:<ciphertextHex>"  — safe to store in DB
 */
export function encryptKey(privateKey) {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  // Strip 0x prefix before encrypting
  const rawKey = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;

  let encrypted = cipher.update(rawKey, "utf8", "hex");
  encrypted += cipher.final("hex");

  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * AES-256-CBC decrypt an encrypted private key.
 * Decrypted value is only held in memory — never logged or stored.
 * @param {string} encryptedValue  - "<ivHex>:<ciphertextHex>"
 * @returns {string}  Hex private key with 0x prefix
 */
export function decryptKey(encryptedValue) {
  const key = getEncryptionKey();
  const [ivHex, ciphertextHex] = encryptedValue.split(":");
  if (!ivHex || !ciphertextHex) {
    throw new Error("Invalid encrypted key format — expected iv:ciphertext");
  }

  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return `0x${decrypted}`;
}

// ── Session key lifecycle ─────────────────────────────────────────────────────

/**
 * Generate a fresh random session keypair.
 * @returns {{ privateKey: string, address: string }}
 */
export function generateSessionKey() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { privateKey, address: account.address };
}

// Minimal SessionKeyModule ABI — the exact selector depends on the AA implementation.
// Using ERC-7579 session key module interface as reference.
const SESSION_MODULE_ABI = [
  {
    name: "enableSessionKey",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionKey", type: "address" },
      { name: "validUntil", type: "uint48" },
      { name: "validAfter", type: "uint48" },
      { name: "paymaster", type: "address" },
      { name: "allowedTargets", type: "address[]" },
      { name: "allowedSelectors", type: "bytes4[]" },
      { name: "spendingLimitInUSDC", type: "uint256" },
    ],
    outputs: [],
  },
];

const USDC_DECIMALS = 6;

/**
 * Build calldata to grant a session key on the smart account's session module.
 *
 * @param {string}   sessionKeyAddress    - The ephemeral keypair's address
 * @param {string[]} allowedContracts     - Contracts the session key may call
 * @param {string}   spendLimitUsdc       - Max USDC the session key may spend
 * @param {number}   expirySeconds        - TTL from now (default 3600 = 1 hour)
 * @returns {{ to: string, data: string }} Transaction to send from the user's wallet
 */
export function buildGrantSessionKeyTx(
  sessionKeyAddress,
  allowedContracts,
  spendLimitUsdc,
  expirySeconds = 3600
) {
  const validUntil = Math.floor(Date.now() / 1000) + expirySeconds;
  const spendLimit = parseUnits(spendLimitUsdc, USDC_DECIMALS);

  // Allow all function selectors on the listed contracts (bytes4 zero = wildcard)
  const allowedSelectors = allowedContracts.map(() => "0x00000000");

  const data = encodeFunctionData({
    abi: SESSION_MODULE_ABI,
    functionName: "enableSessionKey",
    args: [
      sessionKeyAddress,
      validUntil,
      0,               // validAfter = now
      "0x0000000000000000000000000000000000000000", // no paymaster restriction
      allowedContracts,
      allowedSelectors,
      spendLimit,
    ],
  });

  // The call goes to the smart account itself (it routes to its session module)
  return { to: null, data }; // `to` = smart account address (filled by orchestrator)
}

/**
 * Sign a UserOperation hash with the session key.
 * Decrypts the key in memory, signs, then immediately clears the reference.
 *
 * @param {string} userOpHash         - Hash to sign (as returned by permissionless)
 * @param {string} encryptedPrivateKey - AES-256-CBC encrypted private key from DB
 * @returns {string} ECDSA signature hex
 */
export async function signUserOpWithSessionKey(userOpHash, encryptedPrivateKey) {
  // Decrypt in memory — never stored beyond this function scope
  let privateKey = decryptKey(encryptedPrivateKey);

  try {
    const account = privateKeyToAccount(privateKey);
    const signature = await account.signMessage({
      message: { raw: hexToBytes(userOpHash) },
    });
    return signature;
  } finally {
    // Explicitly clear the reference — helps GC reclaim it sooner
    privateKey = null;
  }
}
