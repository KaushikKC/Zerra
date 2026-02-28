import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { entryPoint07Address } from "viem/account-abstraction";
import { config, getPimlicoUrl } from "../config/networks.js";
import { decryptKey } from "./sessionKeys.js";

/**
 * Build a viem chain object from our network config shape.
 */
function toViemChain(chainConfig) {
  return {
    id: chainConfig.chainId,
    name: chainConfig.name,
    nativeCurrency: { decimals: 18, name: "ETH", symbol: chainConfig.gasIsUsdc ? "USDC" : "ETH" },
    rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
  };
}

/**
 * Get the counterfactual SimpleSmartAccount address owned by a given session private key.
 * Uses the session keypair as the smart account owner — this is the account
 * the backend will operate autonomously (no further user interaction needed).
 *
 * @param {string} sessionPrivateKey - Plaintext hex private key (0x...)
 * @param {object} chainConfig       - Chain config from networks.js
 * @returns {Promise<string>}        Smart account address (0x...)
 */
export async function getSmartAccountAddressForKey(sessionPrivateKey, chainConfig) {
  const chain = toViemChain(chainConfig);
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);
  const publicClient = createPublicClient({
    chain,
    transport: http(chainConfig.rpcUrl),
  });
  const smartAccount = await toSimpleSmartAccount({
    client: publicClient,
    owner: sessionAccount,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });
  return smartAccount.address;
}

/**
 * Build a SmartAccountClient that uses a session key as its signer.
 * This client can submit UserOperations via Pimlico without MetaMask interaction.
 *
 * @param {string} ownerAddress            - The original wallet owner's EOA address
 * @param {object} chainConfig             - Chain config from networks.js
 * @param {string} encryptedSessionPrivKey - AES-256 encrypted session private key from DB
 * @returns {Promise<object>}              permissionless SmartAccountClient
 */
export async function buildSmartAccountClient(ownerAddress, chainConfig, encryptedSessionPrivKey) {
  const chain = toViemChain(chainConfig);

  // Decrypt session key in memory (never persisted after this call)
  const sessionPrivateKey = decryptKey(encryptedSessionPrivKey);
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);

  const publicClient = createPublicClient({
    chain,
    transport: http(chainConfig.rpcUrl),
  });

  const pimlicoUrl = getPimlicoUrl(chainConfig.pimlicoChainName);

  const pimlicoClient = createPimlicoClient({
    chain,
    transport: http(pimlicoUrl),
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });

  const smartAccount = await toSimpleSmartAccount({
    client: publicClient,
    owner: sessionAccount,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });

  const smartAccountClient = createSmartAccountClient({
    account: smartAccount,
    chain,
    bundlerTransport: http(pimlicoUrl),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  });

  return smartAccountClient;
}

/**
 * Send multiple transactions as sequential UserOperations.
 * Each tx is sent as its own UserOp and awaited before the next one starts.
 * This avoids executeBatch encoding issues and ensures strict on-chain ordering
 * (important for deposit-before-addDelegate).
 *
 * @param {object} smartAccountClient - From buildSmartAccountClient()
 * @param {Array<{ to: string, data: string, value?: bigint }>} transactions
 * @returns {Promise<{ txHash: string }>} Hash of the last transaction
 */
export async function sendBatchUserOp(smartAccountClient, transactions) {
  let txHash;
  for (const tx of transactions) {
    // sendTransaction sends a single-call UserOp and waits for on-chain receipt
    txHash = await smartAccountClient.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value ?? 0n,
    });
    console.log(`[smartAccount] tx confirmed: ${txHash} (to: ${tx.to})`);
  }
  return { txHash };
}
