/**
 * networks.js — Single source of truth for all chain/contract/API configuration.
 *
 * NEVER hardcode any address, chain ID, or API URL outside this file.
 * To switch testnet → mainnet: set NETWORK=mainnet in your environment.
 */

const TESTNET = {
  // ── Source chains ─────────────────────────────────────────────────────────

  sourceChains: [
    {
      key: "ethereum-sepolia",
      name: "Ethereum Sepolia",
      chainId: 11155111,
      domain: 0,
      rpcUrl: process.env.RPC_URL_ETHEREUM_SEPOLIA,
      usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      wethAddress: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
      uniswapV2Router: "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008",
      hasSwap: true,
      nativeSymbol: "ETH",
      blockExplorer: "https://sepolia.etherscan.io",
      pimlicoChainName: "sepolia",
    },
    {
      key: "base-sepolia",
      name: "Base Sepolia",
      chainId: 84532,
      domain: 6,
      rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
      usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      wethAddress: null,
      uniswapV2Router: null,
      hasSwap: false, // No swap available on Base Sepolia testnet
      nativeSymbol: "ETH",
      blockExplorer: "https://sepolia-explorer.base.org",
      pimlicoChainName: "base-sepolia",
    },
  ],

  // ── Destination chain (Arc Testnet) ───────────────────────────────────────

  destinationChain: {
    key: "arc-testnet",
    name: "Arc Testnet",
    chainId: 5042002,
    domain: 26,
    rpcUrl: "https://rpc.testnet.arc.network",
    usdcAddress: "0x3600000000000000000000000000000000000000",
    blockExplorer: "https://testnet.arcscan.app",
    pimlicoChainName: "arc-testnet",
    // USDC is the native gas token on Arc — no ETH needed
    gasIsUsdc: true,
  },

  // ── Circle Gateway ─────────────────────────────────────────────────────────
  // Addresses are constants across all chains (confirmed via official Arc SDK).

  gateway: {
    apiUrl: "https://gateway-api-testnet.circle.com",
    // Gateway Wallet — call deposit(token, amount) and addDelegate(token, delegate) here
    walletContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    // Gateway Minter on Arc Testnet — call gatewayMint(attestation, signature) here
    minterContract: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
  },

  // ── Swap provider ─────────────────────────────────────────────────────────
  // testnet: UniswapV2 on Ethereum Sepolia only
  // mainnet: 1inch on all source chains

  swapProvider: "uniswapV2",

  // ── Pimlico bundler ───────────────────────────────────────────────────────

  pimlico: {
    // URL template — replace {chainName} and append ?apikey={PIMLICO_API_KEY}
    rpcUrlTemplate: "https://api.pimlico.io/v2/{chainName}/rpc",
    apiKey: process.env.PIMLICO_API_KEY,
  },
};

const MAINNET = {
  // ── Source chains ─────────────────────────────────────────────────────────

  sourceChains: [
    {
      key: "ethereum",
      name: "Ethereum",
      chainId: 1,
      domain: 0,
      rpcUrl: process.env.RPC_URL_ETHEREUM,
      usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      wethAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      uniswapV2Router: null,
      hasSwap: true, // 1inch handles swap
      nativeSymbol: "ETH",
      blockExplorer: "https://etherscan.io",
      pimlicoChainName: "ethereum",
    },
    {
      key: "base",
      name: "Base",
      chainId: 8453,
      domain: 6,
      rpcUrl: process.env.RPC_URL_BASE,
      usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      wethAddress: "0x4200000000000000000000000000000000000006",
      uniswapV2Router: null,
      hasSwap: true, // 1inch handles swap
      nativeSymbol: "ETH",
      blockExplorer: "https://basescan.org",
      pimlicoChainName: "base",
    },
  ],

  // ── Destination chain (Arc Mainnet) ───────────────────────────────────────

  destinationChain: {
    key: "arc",
    name: "Arc",
    chainId: 5042001, // placeholder — update when Arc mainnet is live
    domain: 26,
    rpcUrl: process.env.RPC_URL_ARC,
    usdcAddress: "0x3600000000000000000000000000000000000000",
    blockExplorer: "https://arcscan.app",
    pimlicoChainName: "arc",
    gasIsUsdc: true,
  },

  // ── Circle Gateway ─────────────────────────────────────────────────────────

  gateway: {
    apiUrl: "https://gateway-api.circle.com",
    walletContract: null,   // update once Arc mainnet addresses are published
    minterContract: null,
  },

  // ── Swap provider ─────────────────────────────────────────────────────────

  swapProvider: "oneInch",

  // ── Pimlico bundler ───────────────────────────────────────────────────────

  pimlico: {
    rpcUrlTemplate: "https://api.pimlico.io/v2/{chainName}/rpc",
    apiKey: process.env.PIMLICO_API_KEY,
  },
};

// ── One-line testnet/mainnet toggle ──────────────────────────────────────────
// Set NETWORK=mainnet in your .env to go live. Zero other code changes needed.

export const config = process.env.NETWORK === "mainnet" ? MAINNET : TESTNET;

// ── Convenience helpers ───────────────────────────────────────────────────────

/** Get a source chain config by key (e.g. 'ethereum-sepolia') */
export function getSourceChain(key) {
  const chain = config.sourceChains.find((c) => c.key === key);
  if (!chain) throw new Error(`Unknown source chain: ${key}`);
  return chain;
}

/** Get a source chain config by chainId */
export function getSourceChainById(chainId) {
  const chain = config.sourceChains.find((c) => c.chainId === chainId);
  if (!chain) throw new Error(`No source chain with chainId: ${chainId}`);
  return chain;
}

/** Build a Pimlico bundler URL for a given chain name */
export function getPimlicoUrl(chainName) {
  const { rpcUrlTemplate, apiKey } = config.pimlico;
  if (!apiKey) throw new Error("PIMLICO_API_KEY is not set");
  return `${rpcUrlTemplate.replace("{chainName}", chainName)}?apikey=${apiKey}`;
}
