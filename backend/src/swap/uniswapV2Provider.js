import { createPublicClient, http, encodeFunctionData, parseEther, formatUnits } from "viem";
import { getSourceChain } from "../config/networks.js";

// Uniswap V2 Router ABI — only the methods we need
const UNISWAP_V2_ROUTER_ABI = [
  {
    name: "getAmountsOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    name: "swapExactETHForTokens",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
];

const USDC_DECIMALS = 6;
// 0.5% slippage tolerance
const SLIPPAGE_BPS = 50n;

/**
 * UniswapV2Provider — used on Ethereum Sepolia testnet.
 * Swaps ETH → WETH → USDC via the Uniswap V2 router.
 */
export class UniswapV2Provider {
  constructor() {
    this.chainKey = "ethereum-sepolia";
    this.chain = getSourceChain(this.chainKey);

    this.client = createPublicClient({
      chain: {
        id: this.chain.chainId,
        name: "sepolia",
        nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
        rpcUrls: { default: { http: [this.chain.rpcUrl] } },
      },
      transport: http(this.chain.rpcUrl),
    });
  }

  /**
   * Get a quote for swapping ETH → USDC.
   *
   * @param {string} fromToken  - "ETH" (only ETH supported on testnet)
   * @param {string} toToken    - "USDC"
   * @param {string} amount     - Amount of ETH to swap (e.g. "0.02")
   * @param {number} chainId    - Must match Ethereum Sepolia
   * @returns {{ expectedOutputUsdc: string, priceImpact: string, fee: string }}
   */
  async getQuote(fromToken, toToken, amount, chainId) {
    if (chainId !== this.chain.chainId) {
      throw new Error(`UniswapV2Provider only supports chainId ${this.chain.chainId}`);
    }
    if (fromToken !== "ETH" || toToken !== "USDC") {
      throw new Error("UniswapV2Provider only supports ETH → USDC");
    }

    const amountInWei = parseEther(amount);
    const path = [this.chain.wethAddress, this.chain.usdcAddress];

    const amounts = await this.client.readContract({
      address: this.chain.uniswapV2Router,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountInWei, path],
    });

    const usdcOut = amounts[1];
    const expectedOutputUsdc = formatUnits(usdcOut, USDC_DECIMALS);

    // Uniswap V2 charges 0.3% per hop (ETH→WETH is free, WETH→USDC is 0.3%)
    const feeUsdc = (Number(expectedOutputUsdc) * 0.003).toFixed(6);

    return {
      expectedOutputUsdc,
      priceImpact: "0.1", // estimated — V2 doesn't expose impact directly
      fee: feeUsdc,
    };
  }

  /**
   * Build the swap transaction calldata.
   *
   * @param {string} fromToken      - "ETH"
   * @param {string} toToken        - "USDC"
   * @param {string} amount         - ETH amount to swap
   * @param {string} walletAddress  - Recipient of USDC (smart account address)
   * @param {number} chainId
   * @returns {{ to: string, data: string, value: bigint, gasEstimate: string }}
   */
  async buildSwapTx(fromToken, toToken, amount, walletAddress, chainId) {
    if (chainId !== this.chain.chainId) {
      throw new Error(`UniswapV2Provider only supports chainId ${this.chain.chainId}`);
    }

    const amountInWei = parseEther(amount);
    const path = [this.chain.wethAddress, this.chain.usdcAddress];

    // Get expected output for slippage calculation
    const amounts = await this.client.readContract({
      address: this.chain.uniswapV2Router,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountInWei, path],
    });

    const expectedOut = amounts[1];
    // Apply slippage: amountOutMin = expectedOut * (10000 - 50) / 10000
    const amountOutMin = (expectedOut * (10000n - SLIPPAGE_BPS)) / 10000n;

    // Deadline: 20 minutes from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    const data = encodeFunctionData({
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: "swapExactETHForTokens",
      args: [amountOutMin, path, walletAddress, deadline],
    });

    return {
      to: this.chain.uniswapV2Router,
      data,
      value: amountInWei,
      gasEstimate: "150000",
    };
  }
}
