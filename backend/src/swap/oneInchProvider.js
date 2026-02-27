import axios from "axios";
import { formatUnits } from "viem";

const USDC_DECIMALS = 6;
const ONEINCH_BASE_URL = "https://api.1inch.dev/swap/v6.0";

// USDC addresses per mainnet chain (needed to build the swap path)
const USDC_BY_CHAIN = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",    // Ethereum
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
};

// Native ETH pseudo-address used by 1inch
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeeeEeEeeeeEeEeeeeEe";

/**
 * OneInchProvider — used on mainnet source chains.
 * Calls 1inch Swap API v6 for any token → USDC quote and calldata.
 */
export class OneInchProvider {
  constructor() {
    this.apiKey = process.env.ONEINCH_API_KEY;
    if (!this.apiKey) {
      console.warn("[1inch] ONEINCH_API_KEY not set — swap quotes will fail on mainnet");
    }
  }

  _headers() {
    return { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" };
  }

  _usdcAddress(chainId) {
    const addr = USDC_BY_CHAIN[chainId];
    if (!addr) throw new Error(`No USDC address configured for chainId ${chainId}`);
    return addr;
  }

  /**
   * Get a quote for swapping fromToken → USDC via 1inch.
   *
   * @param {string} fromToken  - "ETH" or ERC-20 token address
   * @param {string} toToken    - "USDC"
   * @param {string} amount     - Human-readable amount (e.g. "0.5" for ETH)
   * @param {number} chainId
   * @returns {{ expectedOutputUsdc: string, priceImpact: string, fee: string }}
   */
  async getQuote(fromToken, toToken, amount, chainId) {
    const fromAddress = fromToken === "ETH" ? ETH_ADDRESS : fromToken;
    const toAddress = this._usdcAddress(chainId);

    // 1inch expects amount in wei (18 decimals for ETH)
    const amountWei = BigInt(Math.floor(Number(amount) * 1e18)).toString();

    const { data } = await axios.get(`${ONEINCH_BASE_URL}/${chainId}/quote`, {
      headers: this._headers(),
      params: {
        src: fromAddress,
        dst: toAddress,
        amount: amountWei,
      },
    });

    const expectedOutputUsdc = formatUnits(BigInt(data.dstAmount), USDC_DECIMALS);
    const feeUsdc = (Number(expectedOutputUsdc) * 0.001).toFixed(6); // ~0.1% 1inch fee

    return {
      expectedOutputUsdc,
      priceImpact: data.estimatedGas ? "0.05" : "0.1",
      fee: feeUsdc,
    };
  }

  /**
   * Build the swap transaction calldata via 1inch swap endpoint.
   *
   * @param {string} fromToken      - "ETH" or token address
   * @param {string} toToken        - "USDC"
   * @param {string} amount         - Human-readable amount
   * @param {string} walletAddress  - Sender and recipient address
   * @param {number} chainId
   * @returns {{ to: string, data: string, value: bigint, gasEstimate: string }}
   */
  async buildSwapTx(fromToken, toToken, amount, walletAddress, chainId) {
    const fromAddress = fromToken === "ETH" ? ETH_ADDRESS : fromToken;
    const toAddress = this._usdcAddress(chainId);
    const amountWei = BigInt(Math.floor(Number(amount) * 1e18)).toString();

    const { data } = await axios.get(`${ONEINCH_BASE_URL}/${chainId}/swap`, {
      headers: this._headers(),
      params: {
        src: fromAddress,
        dst: toAddress,
        amount: amountWei,
        from: walletAddress,
        slippage: 0.5,
        disableEstimate: false,
      },
    });

    return {
      to: data.tx.to,
      data: data.tx.data,
      value: BigInt(data.tx.value ?? "0"),
      gasEstimate: data.tx.gas?.toString() ?? "300000",
    };
  }
}
