import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { config } from "../config/networks.js";

// ERC-20 balanceOf ABI (minimal)
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
];

// USDC always has 6 decimals — hardcoded to avoid extra RPC calls
const USDC_DECIMALS = 6;

/**
 * Build a viem public client for a given RPC URL and chainId.
 */
function makeClient(rpcUrl, chainId) {
  return createPublicClient({
    chain: { id: chainId, name: "custom", nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" }, rpcUrls: { default: { http: [rpcUrl] } } },
    transport: http(rpcUrl),
  });
}

/**
 * Scan a single chain for both native balance and USDC balance using multicall.
 * Falls back to sequential calls if multicall isn't available on the chain.
 *
 * @param {object} chain - Source chain config from networks.js
 * @param {string} walletAddress - EOA wallet address to scan
 * @returns {{ native: string, nativeSymbol: string, usdc: string }}
 */
async function scanChain(chain, walletAddress) {
  const client = makeClient(chain.rpcUrl, chain.chainId);

  try {
    // Fetch native balance and USDC balance with two plain eth_call / eth_getBalance
    // requests — avoids multicall3 which requires the chain object to have a known
    // contract address configured (fails on custom chain objects).
    const [nativeBalance, usdcRaw] = await Promise.all([
      client.getBalance({ address: walletAddress }),
      client.readContract({
        address: chain.usdcAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress],
      }),
    ]);

    return {
      native: formatEther(nativeBalance),
      nativeSymbol: chain.nativeSymbol,
      usdc: formatUnits(usdcRaw, USDC_DECIMALS),
      chainId: chain.chainId,
      hasSwap: chain.hasSwap,
    };
  } catch (err) {
    console.error(`[balanceScanner] Failed to scan ${chain.key}:`, err.message);
    // Return zero balances on failure — quote engine will skip this chain
    return {
      native: "0",
      nativeSymbol: chain.nativeSymbol,
      usdc: "0",
      chainId: chain.chainId,
      hasSwap: chain.hasSwap,
      error: err.message,
    };
  }
}

/**
 * Scan all configured source chains in parallel.
 *
 * @param {string} walletAddress - The payer's wallet address
 * @returns {Promise<Record<string, object>>} Balance map keyed by chain key
 *
 * @example
 * {
 *   'ethereum-sepolia': { native: '0.03', nativeSymbol: 'ETH', usdc: '0.00', hasSwap: true },
 *   'base-sepolia':     { native: '0.001', nativeSymbol: 'ETH', usdc: '30.00', hasSwap: false }
 * }
 */
export async function scanBalances(walletAddress) {
  const scans = config.sourceChains.map((chain) =>
    scanChain(chain, walletAddress).then((result) => [chain.key, result])
  );

  const entries = await Promise.all(scans);
  return Object.fromEntries(entries);
}
