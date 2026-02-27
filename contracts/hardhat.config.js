require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../backend/.env" });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    hardhat: {},
    ethereum: {
      url: process.env.RPC_URL_ETHEREUM || "",
      accounts: process.env.PRIVATE_KEY_RELAYER
        ? [process.env.PRIVATE_KEY_RELAYER]
        : [],
    },
    base: {
      url: process.env.RPC_URL_BASE || "",
      accounts: process.env.PRIVATE_KEY_RELAYER
        ? [process.env.PRIVATE_KEY_RELAYER]
        : [],
    },
    polygon: {
      url: process.env.RPC_URL_POLYGON || "",
      accounts: process.env.PRIVATE_KEY_RELAYER
        ? [process.env.PRIVATE_KEY_RELAYER]
        : [],
    },
    "arc-testnet": {
      url: "https://rpc.testnet.arc.network",
      accounts: process.env.PRIVATE_KEY_RELAYER
        ? [process.env.PRIVATE_KEY_RELAYER]
        : [],
    },
    arc: {
      url: process.env.RPC_URL_ARC || "",
      accounts: process.env.PRIVATE_KEY_RELAYER
        ? [process.env.PRIVATE_KEY_RELAYER]
        : [],
    },
  },
};
