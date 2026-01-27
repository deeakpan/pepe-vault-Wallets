/**
 * Configuration file for PEPU VAULT WALLET
 * Update these values to change fees, rewards, and other settings
 */

// ============================================
// TRANSACTION FEES
// ============================================
export const TRANSACTION_FEE_USD = 0.05 // $0.05 worth of PEPU per transaction

// ============================================
// SWAP FEES
// ============================================
export const SWAP_FEE_PERCENTAGE = 0.8 // 0.8% of the token being received (output token)

// ============================================
// REWARDS SYSTEM
// ============================================
// Minimum VAULT tokens required to access rewards
export const MIN_UCHAIN_REQUIRED = 1000000 // 1 million VAULT tokens

// Cashback per transaction (in USD worth of VAULT)
export const TRANSFER_REWARD_USD = 0.005 // $0.005 worth of VAULT per transfer

// Cashback per swap (percentage of swap value)
export const SWAP_REWARD_PERCENTAGE = 0.085 // 0.085% of swap value in VAULT

// ============================================
// TOKEN ADDRESSES
// ============================================
// PEPU VAULT (VAULT) - Reward Token
export const UCHAIN_TOKEN_ADDRESS = "0x8746d6fc80708775461226657a6947497764bbe6"
export const UCHAIN_DECIMALS = 18

// ============================================
// CHAIN CONFIGURATION
// ============================================
export const PEPU_CHAIN_ID = 97741
export const ETH_CHAIN_ID = 1

// ============================================
// FEE WALLET (From Environment Variable)
// ============================================
// Set NEXT_PUBLIC_FEE_WALLET in your .env.local or hosting platform
// In Next.js, NEXT_PUBLIC_* variables are available at build time
export const FEE_WALLET = 
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_FEE_WALLET) ||
  "0x19fF8B9E88d232FbdC8b6BB4C214b9B5b815fE00" // Fallback fee wallet if env not set

// ============================================
// REWARDS PAYOUT KEY (From Environment Variable)
// ============================================
// Set NEXT_PUBLIC_REWARDS_PAYOUT_KEY in your .env.local or hosting platform
// WARNING: This is exposed to the browser. Use a dedicated rewards wallet.
// In Next.js, NEXT_PUBLIC_* variables are available at build time
export const REWARDS_PAYOUT_KEY = 
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_REWARDS_PAYOUT_KEY) ||
  "" // Empty string if not set

// ============================================
// BRIDGE CONFIGURATION (Hardcoded)
// ============================================
// L2 Bridge Contract (PEPU L2)
export const L2_BRIDGE_CONTRACT = "0x22CDF1eeb755C1b7567464Da3B5A1252A0a2a217"

// L1 Bridge Contract (Ethereum Mainnet)
export const L1_BRIDGE_CONTRACT = "0x36aFc4212178b2730f507919f82b946EE0592C10"

// PEPU Token Address on Ethereum Mainnet
export const PEPU_TOKEN_ADDRESS_ETH = "0x93aA0ccD1e5628d3A841C4DbdF602D9eb04085d6"

// Maximum Bridge Pool Size
export const MAX_BRIDGE_POOL = 35009000 // 35,009,000 tokens

// Bridge Decimals
export const BRIDGE_DECIMALS = 18

