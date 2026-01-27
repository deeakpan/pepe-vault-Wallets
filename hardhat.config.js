require("@nomicfoundation/hardhat-toolbox");

// ============================================
// CONFIGURATION
// ============================================
// Private key for deployment - MUST be set via environment variable
// WARNING: Never commit private keys to version control!
// Set ADMIN_PRIVATE_KEY environment variable: export ADMIN_PRIVATE_KEY=your_private_key_here
const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || ""; // Get from environment variable

// PEPU Chain RPC URL
const PEPU_RPC_URL = "https://rpc-pepu-v2-mainnet-0.t.conduit.xyz";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
    },
    // PEPU Chain (Pepe Unchained V2)
    pepu: {
      url: PEPU_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 97741,
      // Note: If PRIVATE_KEY is not set, accounts array will be empty
      // Set ADMIN_PRIVATE_KEY environment variable to use this network
    },
  },
  etherscan: {
    apiKey: {
      pepu: "NO_API_KEY_NEEDED", // PEPU block explorer may not require API key
    },
    customChains: [
      {
        network: "pepu",
        chainId: 97741,
        urls: {
          apiURL: "https://api.pepuscan.com/api", // PEPU block explorer API
          browserURL: "https://pepuscan.com", // PEPU block explorer
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

