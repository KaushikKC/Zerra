import "dotenv/config";
import { createPublicClient, http, formatUnits } from "viem";

const client = createPublicClient({
  chain: {
    id: 11155111,
    name: "sepolia",
    nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
    rpcUrls: { default: { http: [process.env.RPC_URL_ETHEREUM_SEPOLIA] } },
  },
  transport: http(process.env.RPC_URL_ETHEREUM_SEPOLIA),
});

const result = await client.readContract({
  address: "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008",
  abi: [
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
  ],
  functionName: "getAmountsOut",
  args: [
    BigInt("20000000000000000"), // 0.02 ETH
    [
      "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
      "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    ],
  ],
});
console.log("0.02 ETH →", formatUnits(result[1], 6), "USDC");
