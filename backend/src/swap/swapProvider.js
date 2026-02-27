import { config } from "../config/networks.js";
import { UniswapV2Provider } from "./uniswapV2Provider.js";
import { OneInchProvider } from "./oneInchProvider.js";

/**
 * Factory — returns the correct swap provider for the active network.
 *
 * Always call this function. Never import UniswapV2Provider or OneInchProvider
 * directly outside of this file.
 *
 * @returns {UniswapV2Provider|OneInchProvider}
 */
export function getSwapProvider() {
  return config.swapProvider === "oneInch"
    ? new OneInchProvider()
    : new UniswapV2Provider();
}
