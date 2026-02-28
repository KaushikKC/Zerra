import { scanBalances } from "../scanner/balanceScanner.js";
import { getSwapProvider } from "../swap/swapProvider.js";
import { config } from "../config/networks.js";

// Circle Bridge Kit (CCTPv2) fast transfer — near-zero protocol fee, ~0.005 USDC buffer per bridge.
const GATEWAY_BRIDGE_FEE_USDC = 0.005;
// Arc USDC gas cost per bridge operation (session key EOA pays Arc USDC gas after mint).
const ARC_GAS_FEE_USDC = 0.01;
// Fee buffer multiplier applied to all fee estimates
const FEE_BUFFER = 1.1;
// Gas buffer for Arc-direct payments (session key EOA pays Arc USDC gas)
const ARC_DIRECT_GAS_BUFFER_USDC = 0.05;

/**
 * Round a number to 6 decimal places (USDC precision).
 */
function r6(n) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Build the optimal sourcing plan from a balance map and a target USDC amount.
 *
 * Routing rules (applied in order):
 *  1. Use existing USDC first (no swap, cheapest)
 *  2. Prefer Base over Ethereum (lower gas)
 *  3. For any shortfall, use ETH on chains where hasSwap: true
 *
 * @param {Record<string, object>} balances - From scanBalances()
 * @param {number} targetUsdc
 * @returns {{ sourcePlan: object[], shortfallUsdc: number }}
 */
function buildSourcePlan(balances, targetUsdc) {
  const sourcePlan = [];
  let remaining = targetUsdc;

  // Sort chains: Base before Ethereum (lower gas preferred).
  // Exclude isDirect chains (arc-testnet) — they're handled by the arc-direct fast path
  // and don't need bridging; including them here would generate invalid bridge-from-Arc steps.
  const chainOrder = config.sourceChains
    .filter((c) => !c.isDirect)
    .map((c) => ({ ...c, balance: balances[c.key] }))
    .sort((a, b) => {
      // Prefer Base (domain 6) over Ethereum (domain 0)
      if (a.key.startsWith("base")) return -1;
      if (b.key.startsWith("base")) return 1;
      return 0;
    });

  // Pass 1: consume existing USDC
  for (const chain of chainOrder) {
    if (remaining <= 0) break;
    const bal = chain.balance;
    if (!bal || bal.error) continue;

    const availableUsdc = Math.min(parseFloat(bal.usdc), remaining);
    if (availableUsdc > 0.000001) {
      sourcePlan.push({
        chain: chain.key,
        chainId: chain.chainId,
        type: "usdc",
        amount: r6(availableUsdc).toString(),
      });
      remaining -= availableUsdc;
    }
  }

  // Pass 2: fill shortfall by swapping native ETH on swappable chains
  for (const chain of chainOrder) {
    if (remaining <= 0.000001) break;
    const bal = chain.balance;
    if (!bal || bal.error || !chain.hasSwap) continue;

    const nativeEth = parseFloat(bal.native);
    if (nativeEth <= 0) continue;

    sourcePlan.push({
      chain: chain.key,
      chainId: chain.chainId,
      type: "swap",
      fromToken: "ETH",
      fromAmount: nativeEth.toFixed(6), // use all available ETH; quote engine trims later
      toUsdc: null, // filled in after swap quote
    });

    // Optimistically assume all ETH covers the remaining (quote will refine)
    remaining = 0;
  }

  return { sourcePlan, shortfallUsdc: Math.max(0, remaining) };
}

/**
 * Calculate the total fees with a 10% buffer.
 *
 * @param {number} swapFeeUsdc
 * @param {number} bridgeCount - Number of source chains being bridged (default 1)
 * @returns {{ swapFee: string, bridgeFee: string, arcGas: string, totalFees: string }}
 */
function calcFees(swapFeeUsdc, bridgeCount = 1) {
  const swapFee = r6(swapFeeUsdc * FEE_BUFFER);
  const bridgeFee = r6(GATEWAY_BRIDGE_FEE_USDC * bridgeCount * FEE_BUFFER);
  const arcGas = r6(ARC_GAS_FEE_USDC * FEE_BUFFER);
  const totalFees = r6(swapFee + bridgeFee + arcGas);
  return {
    swapFee: swapFee.toFixed(6),
    bridgeFee: bridgeFee.toFixed(6),
    arcGas: arcGas.toFixed(6),
    totalFees: totalFees.toFixed(6),
  };
}

/**
 * Generate the full sourcing quote for a payment.
 *
 * @param {string} walletAddress   - Payer's EOA address
 * @param {number|string} targetAmount - USDC amount the merchant receives
 * @param {Record<string,object>} [existingBalances] - Optional pre-fetched balances
 * @returns {Promise<object>} Full quote object
 *
 * @example
 * {
 *   sourcePlan: [
 *     { chain: 'base-sepolia', type: 'usdc', amount: '30.000000' },
 *     { chain: 'ethereum-sepolia', type: 'swap', fromToken: 'ETH',
 *       fromAmount: '0.02', toUsdc: '22.50' }
 *   ],
 *   breakdown: { swapFee: '0.077000', bridgeFee: '2.200000', arcGas: '0.473000' },
 *   totalFees: '2.750000',
 *   userAuthorizes: '52.750000',
 *   merchantReceives: '50.000000',
 *   sufficientFunds: true
 * }
 */
export async function getQuote(walletAddress, targetAmount, existingBalances = null) {
  const target = parseFloat(targetAmount);
  if (isNaN(target) || target <= 0) {
    throw new Error("targetAmount must be a positive number");
  }

  // Fetch balances if not provided
  const balances = existingBalances ?? (await scanBalances(walletAddress));

  // ── Arc-direct fast path ─────────────────────────────────────────────────────
  // If the payer already holds enough USDC on Arc testnet, skip cross-chain entirely.
  // The session key EOA pays directly on Arc — no Circle Gateway, no bridge fees.
  const arcDirectChain = config.sourceChains.find((c) => c.isDirect);
  if (arcDirectChain) {
    const arcBalance = parseFloat(balances[arcDirectChain.key]?.usdc ?? "0");
    const arcRequired = r6(target + ARC_DIRECT_GAS_BUFFER_USDC);
    if (arcBalance >= arcRequired) {
      const breakdown = {
        swapFee: "0.000000",
        bridgeFee: "0.000000",
        arcGas: ARC_DIRECT_GAS_BUFFER_USDC.toFixed(6),
        totalFees: ARC_DIRECT_GAS_BUFFER_USDC.toFixed(6),
      };
      return {
        sourcePlan: [{
          chain: arcDirectChain.key,
          chainId: arcDirectChain.chainId,
          type: "usdc",
          amount: arcRequired.toFixed(6),
          isDirect: true,
        }],
        balances,
        breakdown,
        totalFees: ARC_DIRECT_GAS_BUFFER_USDC.toFixed(6),
        userAuthorizes: arcRequired.toFixed(6),
        merchantReceives: target.toFixed(6),
        sufficientFunds: true,
        isDirect: true,
      };
    }
  }

  // The user must provide target + fees from their wallet.
  //
  // Two-pass fee estimation: first, do a preliminary scan to count how many source
  // chains will be used (bridge fee scales per chain). Then compute the real fee and
  // build the final source plan. This ensures multi-chain scenarios (e.g. 1 USDC from
  // Base + 1 USDC from Ethereum) correctly account for two bridge operations.
  //
  // Pass 1 — count chains needed for just the target (no fees yet)
  const { sourcePlan: prelimPlan } = buildSourcePlan(balances, target);
  const estimatedBridgeCount = Math.max(1, prelimPlan.length);

  const fixedFeeEstimate = r6(
    (GATEWAY_BRIDGE_FEE_USDC * estimatedBridgeCount + ARC_GAS_FEE_USDC) * FEE_BUFFER
  );
  const amountToSource = r6(target + fixedFeeEstimate);

  // Pass 2 — build the final source plan against target + fees
  const { sourcePlan, shortfallUsdc } = buildSourcePlan(balances, amountToSource);

  if (shortfallUsdc > 0.01) {
    return {
      sourcePlan,
      balances,
      breakdown: null,
      totalFees: null,
      userAuthorizes: null,
      merchantReceives: targetAmount.toString(),
      sufficientFunds: false,
      shortfallUsdc: r6(shortfallUsdc).toString(),
    };
  }

  // Get swap quotes for any swap steps
  let totalSwapFeeUsdc = 0;
  const swapProvider = getSwapProvider();

  for (const step of sourcePlan) {
    if (step.type !== "swap") continue;

    try {
      const chain = config.sourceChains.find((c) => c.key === step.chain);
      const quote = await swapProvider.getQuote(
        step.fromToken,
        "USDC",
        step.fromAmount,
        chain.chainId
      );

      step.toUsdc = parseFloat(quote.expectedOutputUsdc).toFixed(6);
      totalSwapFeeUsdc += parseFloat(quote.fee);
    } catch (err) {
      console.error(`[quoteEngine] Swap quote failed for ${step.chain}:`, err.message);
      step.toUsdc = "0";
      step.quoteError = err.message;
    }
  }

  const finalBridgeCount = Math.max(1, sourcePlan.length);
  const breakdown = calcFees(totalSwapFeeUsdc, finalBridgeCount);
  const userAuthorizes = r6(target + parseFloat(breakdown.totalFees));

  return {
    sourcePlan,
    balances,
    breakdown,
    totalFees: breakdown.totalFees,
    userAuthorizes: userAuthorizes.toFixed(6),
    merchantReceives: target.toFixed(6),
    sufficientFunds: true,
  };
}
