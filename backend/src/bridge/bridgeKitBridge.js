import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config/networks.js";

// Map our internal chain keys to Circle Bridge Kit blockchain names
const BRIDGE_KIT_CHAIN = {
  "base-sepolia": "Base_Sepolia",
  "ethereum-sepolia": "Ethereum_Sepolia",
  "arc-testnet": "Arc_Testnet",
  "base": "Base",
  "ethereum": "Ethereum",
  "arc": "Arc",
};

/**
 * Return our configured RPC URL for a given EVM chainId.
 * Falls back to undefined so Bridge Kit uses its own public endpoint.
 */
function rpcForChainId(chainId) {
  const all = [...config.sourceChains, config.destinationChain];
  return all.find((c) => c.chainId === chainId)?.rpcUrl;
}

/**
 * Build a viem public + wallet client pair for a given chainConfig entry.
 */
function makeClients(chainConfig, account) {
  const chain = {
    id: chainConfig.chainId,
    name: chainConfig.name,
    nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
    rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
  };
  const publicClient = createPublicClient({ chain, transport: http(chainConfig.rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(chainConfig.rpcUrl) });
  return { publicClient, walletClient };
}

/**
 * Ensure the session key EOA has enough ETH on the source chain to pay gas.
 *
 * Bridge Kit submits 2 transactions from the EOA (approve + burn), so it needs ETH.
 * Auto-funds from BACKEND_GAS_FUNDER_PRIVATE_KEY if the balance is too low.
 */
async function ensureGas(account, chainConfig) {
  const MIN_GAS_WEI = parseUnits("0.0005", 18); // covers approve + burn with margin
  const FUND_AMOUNT_WEI = parseUnits("0.002", 18);

  const { publicClient, walletClient: _ } = makeClients(chainConfig, account);
  const ethBalance = await publicClient.getBalance({ address: account.address });
  console.log(`[bridgeKitBridge] EOA ${account.address} ETH balance on ${chainConfig.key}: ${ethBalance} wei`);

  if (ethBalance >= MIN_GAS_WEI) return; // already has enough

  let funderKey = process.env.BACKEND_GAS_FUNDER_PRIVATE_KEY?.trim();
  if (!funderKey) {
    throw new Error(
      `Session key EOA ${account.address} has no ETH on ${chainConfig.key} for gas. ` +
      `Set BACKEND_GAS_FUNDER_PRIVATE_KEY in .env to auto-fund it.`
    );
  }
  if (!funderKey.startsWith("0x")) funderKey = "0x" + funderKey;

  const funderAccount = privateKeyToAccount(funderKey);
  const chain = {
    id: chainConfig.chainId,
    name: chainConfig.name,
    nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
    rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
  };
  const funderClient = createWalletClient({ account: funderAccount, chain, transport: http(chainConfig.rpcUrl) });
  const funderPublic = createPublicClient({ chain, transport: http(chainConfig.rpcUrl) });

  console.log(`[bridgeKitBridge] Auto-funding EOA ${account.address} with 0.002 ETH on ${chainConfig.key}...`);
  const fundHash = await funderClient.sendTransaction({ to: account.address, value: FUND_AMOUNT_WEI });
  await funderPublic.waitForTransactionReceipt({ hash: fundHash });
  console.log(`[bridgeKitBridge] ETH funded: ${fundHash}`);
}

/**
 * Bridge USDC from a source chain to Arc Testnet using Circle Bridge Kit (CCTPv2).
 *
 * The session key private key signs ALL transactions:
 *   1. approve USDC on source chain
 *   2. burn via CCTPv2 fast transfer
 *   3. mint USDC on Arc Testnet (automatic — no manual attestation polling)
 *
 * USDC lands at the session key EOA address on Arc. The orchestrator then
 * calls stepDirectArcPay to pay the merchant from that same EOA.
 *
 * @param {string} signerPrivateKey  - Session key EOA private key (0x-prefixed)
 * @param {string} sourceChainKey   - Source chain key, e.g. 'base-sepolia'
 * @param {string} amountUsdc       - Human-readable USDC amount, e.g. "3.00"
 * @returns {Promise<string>}       - Destination address on Arc where USDC arrived
 */
export async function bridgeUsdcToArc(signerPrivateKey, sourceChainKey, amountUsdc) {
  const fromChainName = BRIDGE_KIT_CHAIN[sourceChainKey];
  if (!fromChainName) {
    throw new Error(`[bridgeKitBridge] Unsupported source chain: '${sourceChainKey}'`);
  }

  const sourceChainConfig = config.sourceChains.find((c) => c.key === sourceChainKey);
  if (!sourceChainConfig) throw new Error(`Unknown source chain: ${sourceChainKey}`);

  const account = privateKeyToAccount(signerPrivateKey);

  // Ensure the EOA has ETH for gas before Bridge Kit tries to send transactions
  await ensureGas(account, sourceChainConfig);

  const kit = new BridgeKit();

  // Build adapter with our custom RPC URLs (falls back to Bridge Kit's public endpoints)
  const adapter = createViemAdapterFromPrivateKey({
    privateKey: signerPrivateKey,
    getPublicClient: ({ chain }) =>
      createPublicClient({
        chain,
        transport: http(rpcForChainId(chain.id) ?? chain.rpcUrls?.default?.http?.[0]),
      }),
    getWalletClient: ({ chain, account: acc }) =>
      createWalletClient({
        account: acc,
        chain,
        transport: http(rpcForChainId(chain.id) ?? chain.rpcUrls?.default?.http?.[0]),
      }),
  });

  console.log(`[bridgeKitBridge] Bridging ${amountUsdc} USDC from ${sourceChainKey} → Arc_Testnet`);
  console.log(`[bridgeKitBridge] Signer/recipient EOA: ${account.address}`);

  const result = await kit.bridge({
    from: { adapter, chain: fromChainName },
    to: { adapter, chain: "Arc_Testnet" },
    amount: amountUsdc,
  });

  if (result.state === "error") {
    throw new Error(`[bridgeKitBridge] Bridge failed: ${JSON.stringify(result)}`);
  }

  const destAddress = result.destination?.address ?? account.address;
  console.log(`[bridgeKitBridge] ✓ Bridge complete (${result.state}) — USDC at ${destAddress} on Arc`);
  return destAddress;
}
