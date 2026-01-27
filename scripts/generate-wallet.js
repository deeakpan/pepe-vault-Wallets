const { ethers } = require("ethers");

function generateWallet() {
  // Generate a random wallet
  const wallet = ethers.Wallet.createRandom();
  
  // Get the address and private key
  const address = wallet.address;
  const privateKey = wallet.privateKey;
  
  console.log("=".repeat(60));
  console.log("🔑 GENERATED WALLET");
  console.log("=".repeat(60));
  console.log("");
  console.log("📍 Wallet Address:");
  console.log(`   ${address}`);
  console.log("");
  console.log("🔐 Private Key:");
  console.log(`   ${privateKey}`);
  console.log("");
  console.log("=".repeat(60));
  console.log("📋 ENV VARIABLE");
  console.log("=".repeat(60));
  console.log("");
  console.log("Add this to your .env.local file:");
  console.log(`NEXT_PUBLIC_REWARDS_PAYOUT_KEY=${privateKey}`);
  console.log("");
  console.log("⚠️  WARNING: Keep this private key secure!");
  console.log("⚠️  This key will be exposed to the browser.");
  console.log("⚠️  Only use a dedicated rewards wallet with limited funds.");
  console.log("");
  console.log("=".repeat(60));
}

// Run the script
generateWallet();
