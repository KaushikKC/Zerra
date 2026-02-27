const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying PaymentRouter with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Arc Testnet USDC address
  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
  // Fee recipient = deployer for now; update after deploy
  const FEE_RECIPIENT = deployer.address;
  // 0.5% protocol fee
  const FEE_BPS = 50;

  const PaymentRouter = await ethers.getContractFactory("PaymentRouter");
  const router = await PaymentRouter.deploy(USDC_ADDRESS, FEE_RECIPIENT, FEE_BPS);
  await router.waitForDeployment();

  const address = await router.getAddress();
  console.log("PaymentRouter deployed to:", address);
  console.log("\nAdd to backend/.env:");
  console.log(`PAYMENT_ROUTER_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
