const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Fetching domain details for Teck.pepu...\n");

  // Contract address (already deployed)
  const contractAddress = "0x59b040636186afC0851e5891A7b94C3Ca7680128";
  
  // Domain details
  const domainName = "Teck";
  const tld = ".pepu";

  // Get network info
  const network = await ethers.provider.getNetwork();
  console.log("🌐 Network:", network.name, "| Chain ID:", network.chainId.toString(), "\n");

  // Get contract instance
  const UnchainedDomains = await ethers.getContractFactory("UnchainedDomains");
  const contract = UnchainedDomains.attach(contractAddress);

  console.log("=".repeat(60));
  console.log("📋 DOMAIN INFORMATION");
  console.log("=".repeat(60));
  console.log(`Domain: ${domainName}${tld}\n`);

  // Check if domain exists
  const isAvailable = await contract.isDomainAvailable(domainName, tld);
  if (isAvailable) {
    console.log("❌ Domain is not registered or has expired.\n");
    process.exit(0);
  }

  // Get full domain info
  const domainInfo = await contract.getDomainInfo(domainName, tld);
  
  console.log("👤 Owner Information:");
  console.log("   Owner Address:", domainInfo.owner);
  console.log("   Wallet Address:", domainInfo.walletAddress);
  console.log("");

  // Get domain status
  const domainStatus = await contract.getDomainStatus(domainName, tld);
  
  console.log("📊 Domain Status:");
  console.log("   Exists:", domainStatus.exists ? "✅ Yes" : "❌ No");
  console.log("   Expired:", domainStatus.expired ? "⚠️  Yes" : "✅ No");
  console.log("   Remaining Days:", domainStatus.remainingDays, "days");
  console.log("");

  // Registration details
  const registrationDate = new Date(Number(domainInfo.registrationTimestamp) * 1000);
  const expiryDate = new Date(Number(domainInfo.expiryTimestamp) * 1000);
  const totalDays = Math.floor((expiryDate - registrationDate) / (1000 * 60 * 60 * 24));
  const yearsRegistered = Math.floor(totalDays / 365);

  console.log("📅 Registration Details:");
  console.log("   Registration Date:", registrationDate.toLocaleString());
  console.log("   Expiry Date:", expiryDate.toLocaleString());
  console.log("   Duration:", yearsRegistered, "years");
  console.log("   TLD:", domainInfo.tldInfo);
  console.log("");

  // Get registration fee info
  const registrationFee = await contract.getRegistrationFee(domainName, 1);
  console.log("💰 Pricing Information:");
  console.log("   Registration Fee (1 year):", ethers.formatUnits(registrationFee, 6), "USDC");
  console.log("   Total Fee Paid (60 years):", ethers.formatUnits(registrationFee * 60n, 6), "USDC");
  console.log("");

  // Get domain name info
  const nameInfo = await contract.getDomainNameInfo(domainName);
  console.log("📝 Domain Name Details:");
  console.log("   Character Count:", nameInfo.charCount.toString());
  console.log("   Byte Length:", nameInfo.byteLength.toString());
  console.log("   Valid:", nameInfo.isValid ? "✅ Yes" : "❌ No");
  console.log("");

  // Resolve domain to wallet
  const resolvedAddress = await contract.resolveName(domainName, tld);
  console.log("🔗 Resolution:");
  console.log("   Resolved Address:", resolvedAddress);
  console.log("   Status:", resolvedAddress !== ethers.ZeroAddress ? "✅ Active" : "❌ Not Resolvable");
  console.log("");

  // Get domain by wallet (reverse lookup)
  const reverseLookup = await contract.getDomainByWallet(domainInfo.walletAddress);
  console.log("🔄 Reverse Lookup:");
  console.log("   Wallet:", domainInfo.walletAddress);
  console.log("   Domain:", reverseLookup.name + reverseLookup.tld);
  console.log("");

  // Contract information
  const contractBalance = await contract.getContractBalance();
  const contractOwner = await contract.owner();
  const usdcAddress = await contract.usdcAddress();

  console.log("📦 Contract Information:");
  console.log("   Contract Address:", contractAddress);
  console.log("   Contract Owner:", contractOwner);
  console.log("   USDC Address:", usdcAddress);
  console.log("   Contract USDC Balance:", ethers.formatUnits(contractBalance, 6), "USDC");
  console.log("");

  // Check if TLD is supported
  const isTldSupported = await contract.supportedTlds(tld);
  console.log("🌐 TLD Information:");
  console.log("   TLD:", tld);
  console.log("   Supported:", isTldSupported ? "✅ Yes" : "❌ No");
  console.log("");

  console.log("=".repeat(60));
  console.log("🔗 Block Explorer Links:");
  console.log("=".repeat(60));
  console.log(`   Contract: https://pepuscan.com/address/${contractAddress}`);
  console.log(`   Owner: https://pepuscan.com/address/${domainInfo.owner}`);
  console.log(`   Wallet: https://pepuscan.com/address/${domainInfo.walletAddress}`);
  console.log("");

  // Calculate time until expiry
  const now = new Date();
  const timeUntilExpiry = expiryDate - now;
  const daysUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60 * 24));
  const yearsUntilExpiry = Math.floor(daysUntilExpiry / 365);

  if (timeUntilExpiry > 0) {
    console.log("⏰ Time Until Expiry:");
    console.log("   Years:", yearsUntilExpiry);
    console.log("   Days:", daysUntilExpiry);
    console.log("");
  } else {
    console.log("⚠️  Domain has expired!");
    console.log("");
  }

  console.log("✅ All domain details retrieved successfully!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error.message);
    process.exit(1);
  });

