const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Registering domain using admin account...\n");

  // Contract address (already deployed)
  const contractAddress = "0x59b040636186afC0851e5891A7b94C3Ca7680128";
  
  // Domain registration details
  const domainName = "Teck";
  const tld = ".pepu";
  const walletAddress = "0x28b7d8a4d41a848f8bbd685aa2bb4570fb79d930";
  const duration = 60; // 60 years

  // Get the deployer account (admin)
  const [deployer] = await ethers.getSigners();
  console.log("📝 Using admin account:", deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "PEPU\n");

  // Get network info
  const network = await ethers.provider.getNetwork();
  console.log("🌐 Network:", network.name, "| Chain ID:", network.chainId.toString(), "\n");

  // Get contract instance
  const UnchainedDomains = await ethers.getContractFactory("UnchainedDomains");
  const contract = UnchainedDomains.attach(contractAddress);

  // Verify we're the owner
  const owner = await contract.owner();
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("❌ Current account is not the contract owner!");
  }
  console.log("✅ Verified: You are the contract owner\n");

  // Check if domain is available
  console.log(`🔍 Checking if domain ${domainName}${tld} is available...`);
  const isAvailable = await contract.isDomainAvailable(domainName, tld);
  if (!isAvailable) {
    console.log("⚠️  Domain is not available. Checking current owner...");
    const domainInfo = await contract.getDomainInfo(domainName, tld);
    console.log("   Current owner:", domainInfo.owner);
    throw new Error("Domain is already registered!");
  }
  console.log("✅ Domain is available\n");

  // Register the domain
  console.log(`📝 Registering domain: ${domainName}${tld}`);
  console.log(`   Wallet address: ${walletAddress}`);
  console.log(`   Duration: ${duration} years\n`);

  const tx = await contract.adminRegister(domainName, tld, walletAddress, duration);
  console.log("⏳ Transaction hash:", tx.hash);
  console.log("⏳ Waiting for confirmation...");

  await tx.wait();
  console.log("✅ Domain registered successfully!\n");

  // Verify registration
  const domainInfo = await contract.getDomainInfo(domainName, tld);
  console.log("📊 Domain Information:");
  console.log("   Name:", domainName + tld);
  console.log("   Wallet Address:", domainInfo.walletAddress);
  console.log("   Owner:", domainInfo.owner);
  console.log("   Registration Date:", new Date(Number(domainInfo.registrationTimestamp) * 1000).toLocaleString());
  console.log("   Expiry Date:", new Date(Number(domainInfo.expiryTimestamp) * 1000).toLocaleString());
  console.log("\n🌐 View on block explorer:");
  console.log(`   https://pepuscan.com/address/${contractAddress}`);
  console.log(`   Transaction: https://pepuscan.com/tx/${tx.hash}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error.message);
    process.exit(1);
  });

