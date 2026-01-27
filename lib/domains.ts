import { ethers } from "ethers"
import { getProvider, getProviderWithFallback } from "./rpc"
import { getPrivateKey, getSessionPassword, type Wallet } from "./wallet"

// UnchainedDomains contract address on PEPU chain
const UNCHAINED_DOMAINS_CONTRACT = "0x59b040636186afC0851e5891A7b94C3Ca7680128"

// USDC address on PEPU chain
const USDC_ADDRESS = "0x20fB684Bfc1aBAaD3AceC5712f2Aa30bd494dF74"

// Contract ABI for domain operations
const DOMAIN_ABI = [
  "function resolveName(string calldata name, string calldata tld) external view returns (address walletAddress)",
  "function getDomainByWallet(address wallet) external view returns (string memory name, string memory tld)",
  "function isDomainAvailable(string calldata name, string calldata tld) external view returns (bool)",
  "function registerDomain(string calldata name, string calldata tld, uint256 duration) external",
  "function getRegistrationFee(string calldata name, uint256 duration) external view returns (uint256)",
  "function getDomainInfo(string calldata name, string calldata tld) external view returns (address walletAddress, address owner, uint256 registrationTimestamp, uint256 expiryTimestamp, string memory tldInfo)",
  "function getDomainStatus(string calldata name, string calldata tld) external view returns (bool exists, bool expired, uint256 remainingDays, uint256 fee)",
  "function validateDomainName(string calldata name) external pure returns (bool)",
]

// USDC ABI for approvals and transfers
const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
]

/**
 * Resolve a domain name to a wallet address (only resolves the exact TLD user provides)
 * @param domainName - Domain name without TLD (e.g., "teck" for "teck.pepu")
 * @param tld - TLD (required - user must specify .pepu or .uchain)
 * @returns Wallet address or null if domain doesn't exist or expired
 */
export async function resolvePepuDomain(
  domainName: string,
  tld: string
): Promise<string | null> {
  try {
    // Only resolve on PEPU chain
    const chainId = 97741
    const provider = getProvider(chainId)
    const contract = new ethers.Contract(UNCHAINED_DOMAINS_CONTRACT, DOMAIN_ABI, provider)

    // Normalize domain name (lowercase)
    const normalizedName = domainName.toLowerCase().trim()

    // Only resolve the exact TLD the user provided (no auto-fallback)
    const address = await contract.resolveName(normalizedName, tld)
    if (address && address !== ethers.ZeroAddress) {
      return address
    }

    return null
  } catch (error) {
    console.error("Error resolving domain:", error)
    return null
  }
}

/**
 * Get domain name for a wallet address (reverse lookup)
 * @param walletAddress - Wallet address to lookup
 * @returns Domain name with TLD (e.g., "teck.pepu") or null if not found
 */
export async function getDomainByWallet(walletAddress: string): Promise<string | null> {
  try {
    // Only lookup on PEPU chain
    const chainId = 97741
    const provider = getProvider(chainId)
    const contract = new ethers.Contract(UNCHAINED_DOMAINS_CONTRACT, DOMAIN_ABI, provider)

    const [name, tld] = await contract.getDomainByWallet(walletAddress)

    if (!name || name === "" || !tld || tld === "") {
      return null
    }

    return `${name}${tld}`
  } catch (error) {
    console.error("Error getting domain by wallet:", error)
    return null
  }
}

/**
 * Check if a string is a domain name (.pepu or .uchain)
 * @param input - String to check
 * @returns true if it looks like a domain name with TLD
 */
export function isPepuDomain(input: string): boolean {
  if (!input || typeof input !== "string") return false
  
  const trimmed = input.trim().toLowerCase()
  
  // Only return true if it explicitly ends with .pepu or .uchain
  if (trimmed.endsWith(".pepu") || trimmed.endsWith(".uchain")) {
    return true
  }
  
  // No auto-detection for names without TLD
  return false
}

/**
 * Extract domain name from input (only handles "name.pepu" or "name.uchain" formats)
 * @param input - Domain input string
 * @returns Object with name and tld, or null if no TLD is present
 */
export function parseDomainInput(input: string): { name: string; tld: string } | null {
  if (!input || typeof input !== "string") return null
  
  const trimmed = input.trim().toLowerCase()
  
  if (trimmed.endsWith(".pepu")) {
    const name = trimmed.slice(0, -5) // Remove ".pepu"
    return { name, tld: ".pepu" }
  }
  
  if (trimmed.endsWith(".uchain")) {
    const name = trimmed.slice(0, -7) // Remove ".uchain"
    return { name, tld: ".uchain" }
  }
  
  // If no TLD is present, return null (don't auto-resolve)
  return null
}

/**
 * Check if a domain name is available for registration
 * @param domainName - Domain name without TLD (e.g., "teck")
 * @param tld - TLD (default: ".pepu")
 * @returns true if domain is available, false otherwise
 */
export async function checkDomainAvailability(
  domainName: string,
  tld: string = ".pepu"
): Promise<boolean> {
  try {
    const chainId = 97741
    const provider = getProvider(chainId)
    const contract = new ethers.Contract(UNCHAINED_DOMAINS_CONTRACT, DOMAIN_ABI, provider)

    const normalizedName = domainName.toLowerCase().trim()
    const isAvailable = await contract.isDomainAvailable(normalizedName, tld)

    return isAvailable
  } catch (error) {
    console.error("Error checking domain availability:", error)
    return false
  }
}

/**
 * Get registration fee for a domain
 * @param domainName - Domain name without TLD
 * @param years - Number of years to register
 * @param tld - TLD (default: ".pepu")
 * @returns Fee in USDC (6 decimals)
 */
export async function getDomainRegistrationFee(
  domainName: string,
  years: number,
  tld: string = ".pepu"
): Promise<string> {
  try {
    const chainId = 97741
    const provider = getProvider(chainId)
    const contract = new ethers.Contract(UNCHAINED_DOMAINS_CONTRACT, DOMAIN_ABI, provider)

    const normalizedName = domainName.toLowerCase().trim()
    const feeWei = await contract.getRegistrationFee(normalizedName, years)
    
    // USDC has 6 decimals
    return ethers.formatUnits(feeWei, 6)
  } catch (error) {
    console.error("Error getting registration fee:", error)
    throw error
  }
}

/**
 * Get registration fee for a domain by days
 * @param domainName - Domain name without TLD
 * @param days - Number of days to register (up to 60 years = 21,900 days)
 * @param tld - TLD (default: ".pepu")
 * @returns Fee in USDC (6 decimals)
 */
export async function getDomainRegistrationFeeByDays(
  domainName: string,
  days: number,
  tld: string = ".pepu"
): Promise<string> {
  try {
    const chainId = 97741
    const provider = getProvider(chainId)
    const contract = new ethers.Contract(UNCHAINED_DOMAINS_CONTRACT, DOMAIN_ABI, provider)

    const normalizedName = domainName.toLowerCase().trim()
    
    // Get base fee (1 year fee)
    const baseFeeWei = await contract.getRegistrationFee(normalizedName, 1)
    
    // Calculate fee for days: (baseFee * days) / 365
    // Use BigInt for precise calculation
    const daysBigInt = BigInt(Math.floor(days))
    const daysPerYear = BigInt(365)
    const feeWei = (baseFeeWei * daysBigInt) / daysPerYear
    
    // USDC has 6 decimals
    return ethers.formatUnits(feeWei, 6)
  } catch (error) {
    console.error("Error getting registration fee by days:", error)
    throw error
  }
}

/**
 * Get full domain information
 * @param domainName - Domain name without TLD
 * @param tld - TLD (default: ".pepu")
 * @returns Domain information object
 */
export async function getDomainInfo(
  domainName: string,
  tld: string = ".pepu"
): Promise<{
  walletAddress: string
  owner: string
  registrationTimestamp: number
  expiryTimestamp: number
  tld: string
} | null> {
  try {
    const chainId = 97741
    const provider = getProvider(chainId)
    const contract = new ethers.Contract(UNCHAINED_DOMAINS_CONTRACT, DOMAIN_ABI, provider)

    const normalizedName = domainName.toLowerCase().trim()
    const [walletAddress, owner, registrationTimestamp, expiryTimestamp, tldInfo] = 
      await contract.getDomainInfo(normalizedName, tld)

    if (owner === ethers.ZeroAddress || !owner) {
      return null
    }

    return {
      walletAddress,
      owner,
      registrationTimestamp: Number(registrationTimestamp),
      expiryTimestamp: Number(expiryTimestamp),
      tld: tldInfo,
    }
  } catch (error) {
    console.error("Error getting domain info:", error)
    return null
  }
}

/**
 * Get domain status (exists, expired, remaining days, fee)
 * @param domainName - Domain name without TLD
 * @param tld - TLD (default: ".pepu")
 * @returns Domain status object
 */
export async function getDomainStatus(
  domainName: string,
  tld: string = ".pepu"
): Promise<{
  exists: boolean
  expired: boolean
  remainingDays: number
  fee: string
}> {
  try {
    const chainId = 97741
    const provider = getProvider(chainId)
    const contract = new ethers.Contract(UNCHAINED_DOMAINS_CONTRACT, DOMAIN_ABI, provider)

    const normalizedName = domainName.toLowerCase().trim()
    const [exists, expired, remainingDays, feeWei] = await contract.getDomainStatus(normalizedName, tld)

    return {
      exists,
      expired,
      remainingDays: Number(remainingDays),
      fee: ethers.formatUnits(feeWei, 6), // USDC has 6 decimals
    }
  } catch (error) {
    console.error("Error getting domain status:", error)
    throw error
  }
}

/**
 * Validate a domain name
 * @param domainName - Domain name to validate
 * @returns true if valid, false otherwise
 */
export async function validateDomainName(domainName: string): Promise<boolean> {
  try {
    const chainId = 97741
    const provider = getProvider(chainId)
    const contract = new ethers.Contract(UNCHAINED_DOMAINS_CONTRACT, DOMAIN_ABI, provider)

    const normalizedName = domainName.toLowerCase().trim()
    const isValid = await contract.validateDomainName(normalizedName)

    return isValid
  } catch (error) {
    console.error("Error validating domain name:", error)
    return false
  }
}

/**
 * Register a domain
 * @param wallet - Wallet to use for registration
 * @param password - Wallet password
 * @param domainName - Domain name without TLD
 * @param tld - TLD (default: ".pepu")
 * @param years - Number of years to register (1-60, can be decimal for days)
 * @returns Transaction hash
 */
export async function registerDomain(
  wallet: Wallet,
  password: string | null,
  domainName: string,
  years: number,
  tld: string = ".pepu"
): Promise<string> {
  try {
    const chainId = 97741
    const sessionPassword = password || getSessionPassword()
    if (!sessionPassword) {
      throw new Error("Wallet is locked. Please unlock your wallet first.")
    }

    const privateKey = getPrivateKey(wallet, sessionPassword)
    const provider = await getProviderWithFallback(chainId)
    const walletInstance = new ethers.Wallet(privateKey, provider)
    const contract = new ethers.Contract(UNCHAINED_DOMAINS_CONTRACT, DOMAIN_ABI, walletInstance)

    const normalizedName = domainName.toLowerCase().trim()

    // Get registration fee (contract accepts whole years, so round up to ensure user gets at least what they paid for)
    // Note: years can be a decimal (from days conversion), so we round up
    const yearsRounded = Math.ceil(years)
    const feeWei = await contract.getRegistrationFee(normalizedName, yearsRounded)
    
    // Check USDC balance
    const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, walletInstance)
    const balance = await usdcContract.balanceOf(wallet.address)
    
    if (balance < feeWei) {
      const feeUsdc = ethers.formatUnits(feeWei, 6)
      const balanceUsdc = ethers.formatUnits(balance, 6)
      throw new Error(`Insufficient USDC balance. Required: ${feeUsdc} USDC, Available: ${balanceUsdc} USDC`)
    }

    // Check and approve USDC if needed
    const allowance = await usdcContract.allowance(wallet.address, UNCHAINED_DOMAINS_CONTRACT)
    if (allowance < feeWei) {
      // Approve a bit more than needed to avoid multiple approvals
      const approveAmount = feeWei * BigInt(2)
      const approveTx = await usdcContract.approve(UNCHAINED_DOMAINS_CONTRACT, approveAmount)
      await approveTx.wait()
    }

    // Register domain (contract requires whole years, round up to ensure user gets at least the duration they paid for)
    const tx = await contract.registerDomain(normalizedName, tld, yearsRounded)
    const receipt = await tx.wait()
    
    if (!receipt) {
      throw new Error("Transaction failed")
    }

    return receipt.hash
  } catch (error: any) {
    console.error("Error registering domain:", error)
    throw new Error(error.message || "Failed to register domain")
  }
}

