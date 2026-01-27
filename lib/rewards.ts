import { ethers } from "ethers"
import { getTokenBalance, getProvider } from "./rpc"
import { fetchPepuPrice } from "./coingecko"
import { fetchGeckoTerminalData } from "./gecko"
import {
  UCHAIN_TOKEN_ADDRESS,
  UCHAIN_DECIMALS,
  PEPU_CHAIN_ID,
  MIN_UCHAIN_REQUIRED,
  TRANSFER_REWARD_USD,
  SWAP_REWARD_PERCENTAGE,
  REWARDS_PAYOUT_KEY,
} from "./config"

// Quoter contract constants (from swap.ts)
const QUOTER_ADDRESS = "0xd647b2D80b48e93613Aa6982b85f8909578b4829"
const WPEPU_ADDRESS = "0xf9cf4a16d26979b929be7176bac4e7084975fcb8"
const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000"
const FEE_TIERS = [100, 500, 3000, 10000]

const QUOTER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn", type: "address" },
          { internalType: "address", name: "tokenOut", type: "address" },
          { internalType: "uint256", name: "amountIn", type: "uint256" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        internalType: "struct IQuoterV2.QuoteExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "quoteExactInputSingle",
    outputs: [
      { internalType: "uint256", name: "amountOut", type: "uint256" },
      { internalType: "uint160", name: "sqrtPriceX96After", type: "uint160" },
      { internalType: "uint32", name: "initializedTicksCrossed", type: "uint32" },
      { internalType: "uint256", name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes", name: "path", type: "bytes" },
      { internalType: "uint256", name: "amountIn", type: "uint256" },
    ],
    name: "quoteExactInput",
    outputs: [
      { internalType: "uint256", name: "amountOut", type: "uint256" },
      { internalType: "uint160[]", name: "sqrtPriceX96AfterList", type: "uint160[]" },
      { internalType: "uint32[]", name: "initializedTicksCrossedList", type: "uint32[]" },
      { internalType: "uint256", name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
]

/**
 * Helper function to encode path for multihop swaps
 */
function encodePath(path: string[], fees: number[]): string {
  if (path.length !== fees.length + 1) {
    throw new Error("Invalid path/fee lengths")
  }

  let encoded = "0x"
  for (let i = 0; i < fees.length; i++) {
    encoded += path[i].slice(2).toLowerCase().padStart(40, "0")
    encoded += fees[i].toString(16).padStart(6, "0")
  }
  encoded += path[path.length - 1].slice(2).toLowerCase().padStart(40, "0")
  return encoded
}

/**
 * Use Quoter contract to get UCHAIN token amount for a given fee amount in another token
 */
async function getUchainAmountFromQuoter(
  tokenAddress: string,
  feeAmount: string,
  tokenDecimals: number,
): Promise<string> {
  try {
    const provider = getProvider(PEPU_CHAIN_ID)
    const quoter = new ethers.Contract(QUOTER_ADDRESS, QUOTER_ABI, provider)
    
    const feeAmountWei = ethers.parseUnits(feeAmount, tokenDecimals)
    const actualTokenIn = tokenAddress === NATIVE_TOKEN ? WPEPU_ADDRESS : tokenAddress.toLowerCase()
    const tokenOut = UCHAIN_TOKEN_ADDRESS.toLowerCase()

    // Try direct route first (token -> UCHAIN)
    let bestQuote: bigint | null = null
    
    for (const fee of FEE_TIERS) {
      try {
        const result = await quoter.quoteExactInputSingle.staticCall({
          tokenIn: actualTokenIn,
          tokenOut,
          amountIn: feeAmountWei,
          fee,
          sqrtPriceLimitX96: 0,
        })
        
        const amountOut = result[0] // First element is amountOut
        if (!bestQuote || amountOut > bestQuote) {
          bestQuote = amountOut
        }
      } catch {
        continue
      }
    }

    // If direct route found, return it
    if (bestQuote && bestQuote > 0n) {
      return ethers.formatUnits(bestQuote, UCHAIN_DECIMALS)
    }

    // Try multi-hop route through WPEPU (token -> WPEPU -> UCHAIN)
    const commonBases = [WPEPU_ADDRESS]
    for (const base of commonBases) {
      if (base.toLowerCase() === actualTokenIn || base.toLowerCase() === tokenOut) continue

      for (const fee1 of FEE_TIERS) {
        for (const fee2 of FEE_TIERS) {
          try {
            // First hop: token -> base
            const result1 = await quoter.quoteExactInputSingle.staticCall({
              tokenIn: actualTokenIn,
              tokenOut: base.toLowerCase(),
              amountIn: feeAmountWei,
              fee: fee1,
              sqrtPriceLimitX96: 0,
            })
            const intermediateAmount = result1[0]

            // Second hop: base -> UCHAIN
            const result2 = await quoter.quoteExactInputSingle.staticCall({
              tokenIn: base.toLowerCase(),
              tokenOut,
              amountIn: intermediateAmount,
              fee: fee2,
              sqrtPriceLimitX96: 0,
            })
            const finalAmount = result2[0]

            if (!bestQuote || finalAmount > bestQuote) {
              bestQuote = finalAmount
            }
          } catch {
            continue
          }
        }
      }
    }

    if (bestQuote && bestQuote > 0n) {
      return ethers.formatUnits(bestQuote, UCHAIN_DECIMALS)
    }

    // If no route found, return 0
    console.warn(`[Rewards] No route found from token ${tokenAddress} to UCHAIN via Quoter`)
    return "0"
  } catch (error: any) {
    console.error("[Rewards] Error getting UCHAIN amount from Quoter:", error)
    return "0"
  }
}

const REWARDS_STORAGE_KEY_PREFIX = "unchained_rewards_"

interface RewardsData {
  totalEarned: string // Total rewards earned (in UCHAIN tokens)
  lastUpdated: number // Timestamp of last update
}

/**
 * Get storage key for a specific wallet
 */
function getRewardsStorageKey(walletAddress: string): string {
  return `${REWARDS_STORAGE_KEY_PREFIX}${walletAddress.toLowerCase()}`
}

/**
 * Get current rewards balance for a specific wallet
 */
export function getRewardsBalance(walletAddress: string): string {
  if (typeof window === "undefined") return "0"
  
  const storageKey = getRewardsStorageKey(walletAddress)
  const data = localStorage.getItem(storageKey)
  if (!data) return "0"
  
  try {
    const rewards: RewardsData = JSON.parse(data)
    return rewards.totalEarned || "0"
  } catch {
    return "0"
  }
}

/**
 * Add transfer reward for ERC20 tokens
 * - If transfer value < $1 USD: Give 10 UCHAIN tokens
 * - If transfer value >= $1 USD: Use Quoter to get UCHAIN equivalent of fee, then give 10% of that
 */
export async function addERC20TransferReward(
  walletAddress: string,
  tokenAddress: string,
  amount: string,
  feeAmount: string,
  decimals: number,
): Promise<void> {
  try {
    if (!walletAddress) {
      console.error("[Rewards] No wallet address provided")
      return
    }

    console.log(`[Rewards] Recording ERC20 transfer reward for wallet: ${walletAddress}`)

    // Get token price in USD from GeckoTerminal to check transfer value
    let tokenPrice = 0
    let transferValueUsd = 0
    try {
      const { fetchGeckoTerminalTokenDetails } = await import("./gecko")
      const tokenDetails = await fetchGeckoTerminalTokenDetails(tokenAddress, "pepe-unchained")
      
      if (tokenDetails && tokenDetails.price_usd !== null && tokenDetails.price_usd !== undefined) {
        tokenPrice = tokenDetails.price_usd
        transferValueUsd = Number.parseFloat(amount) * tokenPrice
        console.log(`[Rewards] Token price: $${tokenPrice}, Transfer value: $${transferValueUsd.toFixed(4)}`)
      } else {
        console.warn("[Rewards] Token not found on GeckoTerminal, cannot calculate transfer value")
        transferValueUsd = 0
      }
    } catch (error) {
      console.warn("[Rewards] Error fetching token price:", error)
      transferValueUsd = 0
    }

    let rewardInUchain = 0

    // Calculate reward based on transfer value
    if (transferValueUsd < 1) {
      // If transfer value < $1: Give 10 UCHAIN tokens
      rewardInUchain = 10
      console.log(`[Rewards] Transfer value $${transferValueUsd.toFixed(4)} < $1, giving minimum reward: 10 UCHAIN`)
    } else {
      // If transfer value >= $1: Use Quoter to get UCHAIN equivalent of fee, then give 10% of that
      const uchainEquivalent = await getUchainAmountFromQuoter(tokenAddress, feeAmount, decimals)
      
      if (Number.parseFloat(uchainEquivalent) > 0) {
        // Calculate 10% of the UCHAIN equivalent
        rewardInUchain = Number.parseFloat(uchainEquivalent) * 0.1
        console.log(`[Rewards] Transfer value $${transferValueUsd.toFixed(4)} >= $1`)
        console.log(`[Rewards] Fee amount: ${feeAmount} tokens = ${uchainEquivalent} UCHAIN`)
        console.log(`[Rewards] Giving 10% of fee: ${rewardInUchain.toFixed(6)} UCHAIN`)
      } else {
        // If Quoter fails, fallback to minimum reward
        console.warn("[Rewards] Quoter returned 0, using minimum reward")
        rewardInUchain = 10
      }
    }

    // Add to rewards (per-wallet)
    const currentBalance = getRewardsBalance(walletAddress)
    const newBalance = (Number.parseFloat(currentBalance) + rewardInUchain).toFixed(18)

    const rewardsData: RewardsData = {
      totalEarned: newBalance,
      lastUpdated: Date.now(),
    }

    const storageKey = getRewardsStorageKey(walletAddress)
    localStorage.setItem(storageKey, JSON.stringify(rewardsData))
    
    console.log(`[Rewards] ✅ Added ERC20 transfer reward: ${rewardInUchain.toFixed(6)} UCHAIN. New balance: ${newBalance} UCHAIN`)
  } catch (error: any) {
    console.error("[Rewards] ❌ Error adding ERC20 transfer reward:", error)
    console.error("[Rewards] Error details:", error.message, error.stack)
  }
}

/**
 * Add transfer reward for native PEPU transfers ($0.005 worth of UCHAIN)
 */
export async function addTransferReward(walletAddress: string): Promise<void> {
  try {
    if (!walletAddress) {
      console.error("[Rewards] No wallet address provided")
      return
    }

    console.log(`[Rewards] Recording native transfer reward for wallet: ${walletAddress}`)
    
    // Get UCHAIN price in USD
    const uchainPrice = await getUchainPrice()
    if (uchainPrice <= 0) {
      console.warn("[Rewards] Could not fetch UCHAIN price, skipping reward")
      return
    }

    console.log(`[Rewards] UCHAIN price: $${uchainPrice}`)

    // Calculate reward in UCHAIN tokens
    const rewardInUchain = TRANSFER_REWARD_USD / uchainPrice
    console.log(`[Rewards] Calculated reward: ${rewardInUchain.toFixed(6)} UCHAIN`)

    // Add to rewards (per-wallet)
    const currentBalance = getRewardsBalance(walletAddress)
    const newBalance = (Number.parseFloat(currentBalance) + rewardInUchain).toFixed(18)

    const rewardsData: RewardsData = {
      totalEarned: newBalance,
      lastUpdated: Date.now(),
    }

    const storageKey = getRewardsStorageKey(walletAddress)
    localStorage.setItem(storageKey, JSON.stringify(rewardsData))
    
    console.log(`[Rewards] ✅ Added transfer reward: ${rewardInUchain.toFixed(6)} UCHAIN. New balance: ${newBalance} UCHAIN`)
  } catch (error: any) {
    console.error("[Rewards] ❌ Error adding transfer reward:", error)
    console.error("[Rewards] Error details:", error.message, error.stack)
  }
}

/**
 * Add swap reward for native PEPU (uses CoinGecko for price)
 */
export async function addNativePepuSwapReward(
  walletAddress: string,
  feeAmount: string,
): Promise<void> {
  try {
    if (!walletAddress) {
      console.error("[Rewards] No wallet address provided")
      return
    }

    console.log(`[Rewards] Recording native PEPU swap reward for wallet: ${walletAddress}`)

    // Get PEPU and UCHAIN prices from CoinGecko
    const { fetchPepuPrice } = await import("./coingecko")
    const pepuPrice = await fetchPepuPrice()
    const uchainPrice = await getUchainPrice()
    
    if (pepuPrice <= 0 || uchainPrice <= 0) {
      console.warn("[Rewards] Could not fetch prices, skipping reward")
      return
    }

    // Calculate fee value in USD, then convert to UCHAIN
    const feeValueUsd = Number.parseFloat(feeAmount) * pepuPrice
    const rewardValueUsd = feeValueUsd * 0.1 // 10% of fee
    const rewardInUchain = rewardValueUsd / uchainPrice

    console.log(`[Rewards] Fee amount: ${feeAmount} PEPU, Fee value: $${feeValueUsd.toFixed(4)}`)
    console.log(`[Rewards] Giving 10% of fee: ${rewardInUchain.toFixed(6)} UCHAIN`)

    // Add to rewards (per-wallet)
    const currentBalance = getRewardsBalance(walletAddress)
    const newBalance = (Number.parseFloat(currentBalance) + rewardInUchain).toFixed(18)

    const rewardsData: RewardsData = {
      totalEarned: newBalance,
      lastUpdated: Date.now(),
    }

    const storageKey = getRewardsStorageKey(walletAddress)
    localStorage.setItem(storageKey, JSON.stringify(rewardsData))
    
    console.log(`[Rewards] ✅ Added native PEPU swap reward: ${rewardInUchain.toFixed(6)} UCHAIN. New balance: ${newBalance} UCHAIN`)
  } catch (error: any) {
    console.error("[Rewards] ❌ Error adding native PEPU swap reward:", error)
    console.error("[Rewards] Error details:", error.message, error.stack)
  }
}

/**
 * Add swap reward for ERC20 tokens (uses Quoter contract to get UCHAIN equivalent)
 */
export async function addSwapReward(
  walletAddress: string,
  tokenAddress: string,
  feeAmount: string,
  tokenDecimals: number,
): Promise<void> {
  try {
    if (!walletAddress) {
      console.error("[Rewards] No wallet address provided")
      return
    }

    console.log(`[Rewards] Recording ERC20 swap reward for wallet: ${walletAddress}`)

    // Use Quoter contract to get UCHAIN equivalent of fee amount
    const uchainEquivalent = await getUchainAmountFromQuoter(tokenAddress, feeAmount, tokenDecimals)
    
    if (Number.parseFloat(uchainEquivalent) <= 0) {
      console.warn("[Rewards] Quoter returned 0 or failed, skipping reward")
      return
    }

    // Calculate reward: 10% of the UCHAIN equivalent
    const rewardInUchain = Number.parseFloat(uchainEquivalent) * 0.1

    console.log(`[Rewards] Fee amount: ${feeAmount} tokens = ${uchainEquivalent} UCHAIN`)
    console.log(`[Rewards] Giving 10% of fee: ${rewardInUchain.toFixed(6)} UCHAIN`)

    // Add to rewards (per-wallet)
    const currentBalance = getRewardsBalance(walletAddress)
    const newBalance = (Number.parseFloat(currentBalance) + rewardInUchain).toFixed(18)

    const rewardsData: RewardsData = {
      totalEarned: newBalance,
      lastUpdated: Date.now(),
    }

    const storageKey = getRewardsStorageKey(walletAddress)
    localStorage.setItem(storageKey, JSON.stringify(rewardsData))
    
    console.log(`[Rewards] ✅ Added ERC20 swap reward: ${rewardInUchain.toFixed(6)} UCHAIN. New balance: ${newBalance} UCHAIN`)
  } catch (error: any) {
    console.error("[Rewards] ❌ Error adding ERC20 swap reward:", error)
    console.error("[Rewards] Error details:", error.message, error.stack)
  }
}

/**
 * Check if user has enough UCHAIN tokens to access rewards
 */
export async function checkRewardsEligibility(walletAddress: string): Promise<{
  eligible: boolean
  balance: string
  required: number
}> {
  try {
    const balance = await getTokenBalance(UCHAIN_TOKEN_ADDRESS, walletAddress, PEPU_CHAIN_ID)
    const balanceNum = Number.parseFloat(balance)
    const required = MIN_UCHAIN_REQUIRED

    return {
      eligible: balanceNum >= required,
      balance,
      required,
    }
  } catch (error) {
    console.error("Error checking rewards eligibility:", error)
    return {
      eligible: false,
      balance: "0",
      required: MIN_UCHAIN_REQUIRED,
    }
  }
}

/**
 * Reset rewards after claiming (per-wallet)
 */
export function resetRewards(walletAddress: string): void {
  const storageKey = getRewardsStorageKey(walletAddress)
  const rewardsData: RewardsData = {
    totalEarned: "0",
    lastUpdated: Date.now(),
  }
  localStorage.setItem(storageKey, JSON.stringify(rewardsData))
}

/**
 * Get UCHAIN token price in USD
 * Uses GeckoTerminal API for PEPU chain tokens
 */
export async function getUchainPrice(): Promise<number> {
  try {
    // Try to get UCHAIN price from GeckoTerminal (PEPU chain)
    const geckoData = await fetchGeckoTerminalData(UCHAIN_TOKEN_ADDRESS, "pepe-unchained")
    
    if (geckoData && geckoData.price_usd) {
      const price = parseFloat(geckoData.price_usd)
      if (price > 0) {
        console.log(`[Rewards] UCHAIN price from GeckoTerminal: $${price}`)
        return price
      }
    }

    // Fallback to PEPU price if UCHAIN price not available
    console.warn("[Rewards] UCHAIN price not found on GeckoTerminal, using PEPU price as fallback")
    return await fetchPepuPrice()
  } catch (error) {
    console.error("Error fetching UCHAIN price:", error)
    // Fallback to PEPU price
    return await fetchPepuPrice()
  }
}

/**
 * Check if admin wallet has enough UCHAIN tokens for rewards
 * Returns true if admin wallet has sufficient balance, false otherwise
 */
export async function checkAdminWalletBalance(requiredAmount: string): Promise<{
  hasBalance: boolean
  adminBalance: string
  required: string
  message?: string
}> {
  try {
    if (!REWARDS_PAYOUT_KEY || REWARDS_PAYOUT_KEY.trim() === "") {
      return {
        hasBalance: false,
        adminBalance: "0",
        required: requiredAmount,
        message: "Rewards payout key not configured. Please set NEXT_PUBLIC_REWARDS_PAYOUT_KEY in your environment variables.",
      }
    }

    // Validate and clean private key format
    let cleanedKey = REWARDS_PAYOUT_KEY.trim()
    
    // Auto-add 0x prefix if missing
    if (!cleanedKey.startsWith("0x")) {
      cleanedKey = "0x" + cleanedKey
    }

    // Validate length (should be 66 with 0x, or 64 without)
    if (cleanedKey.length !== 66) {
      return {
        hasBalance: false,
        adminBalance: "0",
        required: requiredAmount,
        message: `Invalid rewards payout key length. Expected 66 characters (with 0x) or 64 characters (without 0x), got ${cleanedKey.length}.`,
      }
    }

    // Validate hex format
    if (!/^0x[0-9a-fA-F]{64}$/.test(cleanedKey)) {
      return {
        hasBalance: false,
        adminBalance: "0",
        required: requiredAmount,
        message: "Invalid rewards payout key format. Must be a valid hexadecimal private key (64 hex characters).",
      }
    }

    const provider = getProvider(PEPU_CHAIN_ID)
    let payoutWallet: ethers.Wallet
    try {
      payoutWallet = new ethers.Wallet(cleanedKey, provider)
    } catch (error: any) {
      return {
        hasBalance: false,
        adminBalance: "0",
        required: requiredAmount,
        message: `Invalid rewards payout key: ${error.message || "Invalid private key format"}`,
      }
    }

    // ERC20 ABI for balance check
    const erc20Abi = [
      "function balanceOf(address) view returns (uint256)",
    ]

    const uchainContract = new ethers.Contract(UCHAIN_TOKEN_ADDRESS, erc20Abi, provider)
    const adminBalance = await uchainContract.balanceOf(payoutWallet.address)
    const adminBalanceFormatted = ethers.formatUnits(adminBalance, UCHAIN_DECIMALS)
    const requiredAmountWei = ethers.parseUnits(requiredAmount, UCHAIN_DECIMALS)

    const hasBalance = adminBalance >= requiredAmountWei

    return {
      hasBalance,
      adminBalance: adminBalanceFormatted,
      required: requiredAmount,
      message: hasBalance ? undefined : "Admin wallet does not have sufficient Unchained tokens",
    }
  } catch (error: any) {
    console.error("[Rewards] Error checking admin wallet balance:", error)
    return {
      hasBalance: false,
      adminBalance: "0",
      required: requiredAmount,
      message: `Error checking admin wallet: ${error.message}`,
    }
  }
}

/**
 * Send UCHAIN rewards to user wallet
 * Uses payout private key from environment variable
 * CRITICAL: Admin wallet must ONLY send Unchained token (UCHAIN)
 * If admin wallet doesn't have Unchained token, no claim is available
 */
export async function claimRewards(userAddress: string): Promise<string> {
  try {
    const rewardsBalance = getRewardsBalance(userAddress)
    if (Number.parseFloat(rewardsBalance) <= 0) {
      throw new Error("No rewards to claim")
    }

    // Get payout private key from config
    if (!REWARDS_PAYOUT_KEY || REWARDS_PAYOUT_KEY.trim() === "") {
      throw new Error("Rewards payout key not configured. Please set NEXT_PUBLIC_REWARDS_PAYOUT_KEY environment variable.")
    }

    // Validate and clean private key format
    let cleanedKey = REWARDS_PAYOUT_KEY.trim()
    
    // Auto-add 0x prefix if missing
    if (!cleanedKey.startsWith("0x")) {
      cleanedKey = "0x" + cleanedKey
    }

    // Validate length (should be 66 with 0x)
    if (cleanedKey.length !== 66) {
      throw new Error(`Invalid rewards payout key length. Expected 66 characters (with 0x) or 64 characters (without 0x), got ${cleanedKey.length}.`)
    }

    // Validate hex format
    if (!/^0x[0-9a-fA-F]{64}$/.test(cleanedKey)) {
      throw new Error("Invalid rewards payout key format. Must be a valid hexadecimal private key (64 hex characters).")
    }

    const provider = getProvider(PEPU_CHAIN_ID)
    let payoutWallet: ethers.Wallet
    try {
      payoutWallet = new ethers.Wallet(cleanedKey, provider)
    } catch (error: any) {
      throw new Error(`Invalid rewards payout key: ${error.message || "Invalid private key format"}`)
    }

    // ERC20 ABI for transfer
    const erc20Abi = [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function balanceOf(address) view returns (uint256)",
    ]

    const uchainContract = new ethers.Contract(UCHAIN_TOKEN_ADDRESS, erc20Abi, payoutWallet)

    // CRITICAL: Check payout wallet balance - admin wallet must have VAULT token
    // If admin wallet doesn't have VAULT token, no claim is available
    const payoutBalance = await uchainContract.balanceOf(payoutWallet.address)
    const rewardAmountWei = ethers.parseUnits(rewardsBalance, UCHAIN_DECIMALS)

    if (payoutBalance < rewardAmountWei) {
      throw new Error("Rewards are temporarily unavailable. Admin wallet does not have sufficient VAULT tokens.")
    }
    
    // Additional check: Ensure we're only sending VAULT tokens (safety check)
    if (payoutBalance === 0n) {
      throw new Error("Rewards are temporarily unavailable. Admin wallet has no VAULT tokens.")
    }

    // Send rewards
    const tx = await uchainContract.transfer(userAddress, rewardAmountWei, { gasLimit: 100000 })
    const receipt = await tx.wait()

    if (!receipt) {
      throw new Error("Rewards claim transaction failed")
    }

    // Reset rewards after successful claim (per-wallet)
    resetRewards(userAddress)

    return receipt.hash
  } catch (error: any) {
    throw new Error(`Failed to claim rewards: ${error.message}`)
  }
}

