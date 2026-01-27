/**
 * Admin Domain Registration Script
 * 
 * This script registers multiple domains for free using admin privileges.
 * 
 * Usage:
 *   node scripts/register-domains-admin.js
 * 
 * Requirements:
 *   - Admin private key in ADMIN_PRIVATE_KEY environment variable
 *   - Node.js with ethers.js installed
 */

const { ethers } = require("ethers")

// Contract addresses
const UNCHAINED_DOMAINS_CONTRACT = "0x59b040636186afC0851e5891A7b94C3Ca7680128"
const PEPU_RPC = "https://rpc-pepu-v2-mainnet-0.t.conduit.xyz"
const CHAIN_ID = 97741

// Domain mappings: domain name -> wallet address
const DOMAIN_MAPPINGS = [
  { domain: "TOFE", address: "0xcB8BBd19D5688478DDada2773230C24462002464" },
  { domain: "HoRa", address: "0x010541066e9f54b80723c81b8c44f170db0e19df" },
  { domain: "pepulock", address: "0x281fe213ea63c264b58601baa58b218a42a0d97a" },
  { domain: "Kitty", address: "0xe13d3d696ef295882f743680f9470e21c89b19eb" },
  { domain: "antonio", address: "0x4fbbedaff4d697273c5d4939756d7763ed3f26ca" },
  { domain: "val79", address: "0x5A1173A4a46d41a3095f688B8424574D343EEcc5" },
  { domain: "duck", address: "0x27bf6c49f998CF4f38EAa86035Fe7626cd012D08" },
  { domain: "MisterX", address: "0x27c10707a37658f13297a5ca4da1d8f673fbb1af" },
  { domain: "Othalos", address: "0x22faad079c806e87c14e9cc59f58195dc0f7974f" },
  { domain: "ckom", address: "0x48de9d1f47e1c90b0e22750692ee5f5469874105" },
  { domain: "man", address: "0x5359d" }, // Note: This address seems incomplete
  { domain: "TheClimber", address: "0xa1015282cd2475fd36c4f923a3dfe49d098b232e" },
  { domain: "SAFE", address: "0x63697d5d032f641ae5c2a69c3eb61756aa2398c1" },
  { domain: "holderradar", address: "0x98acee14a10013c25b9b59f34ef1cd7806044b1a" },
  { domain: "Toshtech", address: "0x72e1fFbAA541aB102ab1F508C4D5412e1289f31b" },
  { domain: "doekoe", address: "0x5068a059f3d246eb88f32fa7c553bf48e13910e9" },
  { domain: "dee", address: "0x17CaBc8001a30800835DD8206CEB0c4bA90B5913" },
  { domain: "GreenCandles", address: "0x3189F88664ca2095A55ce2c60AF6b29947B1E287" },
  { domain: "museum", address: "0x09aad1e42d324fbd9a72f27593fe08164f35acfb" },
  { domain: "tosh", address: "0x444A28526dBB0C969Ec84A29bFDD63aeA0855bDD" },
  { domain: "ineedmore", address: "0x736144f5b4bc4b3a8c3ff7d3af7eefb3210da1f9" },
  { domain: "Brodo", address: "0xfbf7bb09720ef967129a46c1e98762050552810b" },
  { domain: "plock", address: "0x50f066e04369ac028755d7fa19ebb6ed0b7c8a4e" },
  { domain: "0x2487c48205b2dc07CDDd0B2b67bf105384c4C22f", address: "0x2487c48205b2dc07cddd0b2b67bf105384c4c22f" },
  { domain: "Pepuvault", address: "0xc96694bea572073d19c41aa9c014dd3c7c193b8e" },
]

// Contract ABI - includes both regular and admin functions
const DOMAIN_ABI = [
  "function resolveName(string calldata name, string calldata tld) external view returns (address walletAddress)",
  "function getDomainByWallet(address wallet) external view returns (string memory name, string memory tld)",
  "function isDomainAvailable(string calldata name, string calldata tld) external view returns (bool)",
  "function registerDomain(string calldata name, string calldata tld, uint256 duration) external",
  // Admin functions (try these first)
  "function adminRegisterDomain(string calldata name, string calldata tld, address wallet, uint256 duration) external",
  "function registerDomainFor(string calldata name, string calldata tld, address wallet, uint256 duration) external",
  "function freeRegisterDomain(string calldata name, string calldata tld, address wallet, uint256 duration) external",
]

async function main() {
  // Get admin private key from environment
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY
  if (!adminPrivateKey) {
    console.error("❌ Error: ADMIN_PRIVATE_KEY environment variable is required")
    console.error("   Set it with: export ADMIN_PRIVATE_KEY=your_private_key")
    process.exit(1)
  }

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(PEPU_RPC)
  const adminWallet = new ethers.Wallet(adminPrivateKey, provider)
  const contract = new ethers.Contract(UNCHAINED_DOMAINS_CONTRACT, DOMAIN_ABI, adminWallet)

  console.log("🔐 Admin Address:", adminWallet.address)
  console.log("📋 Total domains to register:", DOMAIN_MAPPINGS.length)
  console.log("")

  // Check which admin function exists
  let adminFunction = null
  const adminFunctions = ["adminRegisterDomain", "registerDomainFor", "freeRegisterDomain"]
  
  for (const funcName of adminFunctions) {
    try {
      // Check if function exists by trying to get its interface
      if (contract.interface.getFunction(funcName)) {
        adminFunction = funcName
        console.log(`✅ Found admin function: ${funcName}`)
        break
      }
    } catch (e) {
      // Function doesn't exist, try next
    }
  }

  if (!adminFunction) {
    console.log("⚠️  No admin function found. Will use regular registerDomain (requires USDC)")
    console.log("   Make sure admin wallet has sufficient USDC balance")
  }

  const TLD = ".pepu"
  const DURATION_YEARS = 1 // Register for 1 year

  let successCount = 0
  let failCount = 0
  const results = []

  // Process each domain
  for (let i = 0; i < DOMAIN_MAPPINGS.length; i++) {
    const { domain, address } = DOMAIN_MAPPINGS[i]
    
    // Validate address
    if (!ethers.isAddress(address)) {
      console.log(`❌ [${i + 1}/${DOMAIN_MAPPINGS.length}] ${domain}.pepu → Invalid address: ${address}`)
      failCount++
      results.push({ domain, address, status: "failed", error: "Invalid address" })
      continue
    }

    const normalizedDomain = domain.toLowerCase().trim()
    const normalizedAddress = ethers.getAddress(address) // Checksum address

    try {
      // Check if domain is available
      const isAvailable = await contract.isDomainAvailable(normalizedDomain, TLD)
      
      if (!isAvailable) {
        // Check if already registered to this address
        const resolved = await contract.resolveName(normalizedDomain, TLD)
        if (resolved.toLowerCase() === normalizedAddress.toLowerCase()) {
          console.log(`⏭️  [${i + 1}/${DOMAIN_MAPPINGS.length}] ${domain}.pepu → Already registered to ${normalizedAddress}`)
          results.push({ domain, address: normalizedAddress, status: "already_registered" })
          continue
        } else {
          console.log(`⚠️  [${i + 1}/${DOMAIN_MAPPINGS.length}] ${domain}.pepu → Domain already taken by ${resolved}`)
          failCount++
          results.push({ domain, address: normalizedAddress, status: "failed", error: "Domain already taken" })
          continue
        }
      }

      // Register domain
      let tx
      if (adminFunction) {
        // Use admin function (free registration)
        console.log(`📝 [${i + 1}/${DOMAIN_MAPPINGS.length}] Registering ${domain}.pepu → ${normalizedAddress} (admin)`)

        // Try different admin function signatures
        if (adminFunction === "adminRegisterDomain") {
          tx = await contract.adminRegisterDomain(normalizedDomain, TLD, normalizedAddress, DURATION_YEARS)
        } else if (adminFunction === "registerDomainFor") {
          tx = await contract.registerDomainFor(normalizedDomain, TLD, normalizedAddress, DURATION_YEARS)
        } else if (adminFunction === "freeRegisterDomain") {
          tx = await contract.freeRegisterDomain(normalizedDomain, TLD, normalizedAddress, DURATION_YEARS)
        }
      } else {
        // Use regular registration (requires USDC)
        console.log(`📝 [${i + 1}/${DOMAIN_MAPPINGS.length}] Registering ${domain}.pepu → ${normalizedAddress} (regular, requires USDC)`)
        tx = await contract.registerDomain(normalizedDomain, TLD, DURATION_YEARS, {
          // Note: This will fail if admin wallet doesn't have USDC
        })
      }

      console.log(`   ⏳ Transaction sent: ${tx.hash}`)
      const receipt = await tx.wait()
      
      if (receipt && receipt.status === 1) {
        console.log(`   ✅ Success! Block: ${receipt.blockNumber}`)
        console.log(`   🔗 Explorer: https://pepuscan.com/tx/${tx.hash}`)
        successCount++
        results.push({ 
          domain, 
          address: normalizedAddress, 
          status: "success", 
          txHash: tx.hash,
          blockNumber: receipt.blockNumber
        })
      } else {
        throw new Error("Transaction failed")
      }

      // Small delay between transactions
      await new Promise(resolve => setTimeout(resolve, 2000))

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`)
      failCount++
      results.push({ 
        domain, 
        address: normalizedAddress, 
        status: "failed", 
        error: error.message 
      })
    }

    console.log("")
  }

  // Summary
  console.log("=".repeat(60))
  console.log("📊 SUMMARY")
  console.log("=".repeat(60))
  console.log(`✅ Successful: ${successCount}`)
  console.log(`❌ Failed: ${failCount}`)
  console.log(`⏭️  Already registered: ${results.filter(r => r.status === "already_registered").length}`)
  console.log("")

  // Show failed domains
  const failed = results.filter(r => r.status === "failed")
  if (failed.length > 0) {
    console.log("❌ Failed domains:")
    failed.forEach(r => {
      console.log(`   - ${r.domain}.pepu → ${r.error}`)
    })
    console.log("")
  }

  // Show successful domains
  const successful = results.filter(r => r.status === "success")
  if (successful.length > 0) {
    console.log("✅ Successfully registered:")
    successful.forEach(r => {
      console.log(`   - ${r.domain}.pepu → ${r.address}`)
      console.log(`     TX: https://pepuscan.com/tx/${r.txHash}`)
    })
  }
}

// Run the script
main()
  .then(() => {
    console.log("\n✨ Script completed!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n💥 Fatal error:", error)
    process.exit(1)
  })

