import { ethers } from "ethers"

/**
 * Token Blacklist
 * Add token addresses here to blacklist them from the wallet
 * Native tokens (PEPU, ETH) cannot be blacklisted and will always work
 */

// Blacklisted token addresses (lowercase)
const BLACKLISTED_TOKENS: string[] = [
  // Add token addresses here to blacklist them
  // Example: "0x1234567890123456789012345678901234567890",
]

/**
 * Check if a token is blacklisted
 * @param tokenAddress - Token contract address
 * @param chainId - Chain ID
 * @returns true if token is blacklisted, false otherwise
 */
export function isTokenBlacklisted(tokenAddress: string, chainId: number): boolean {
  // Native tokens can never be blacklisted
  if (tokenAddress === "0x0000000000000000000000000000000000000000" || 
      tokenAddress === ethers.ZeroAddress) {
    return false
  }

  const normalizedAddress = tokenAddress.toLowerCase()
  return BLACKLISTED_TOKENS.includes(normalizedAddress)
}

/**
 * Add a token to the blacklist
 * @param tokenAddress - Token contract address to blacklist
 */
export function addToBlacklist(tokenAddress: string): void {
  const normalizedAddress = tokenAddress.toLowerCase()
  
  // Cannot blacklist native tokens
  if (normalizedAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("Cannot blacklist native tokens")
  }

  if (!BLACKLISTED_TOKENS.includes(normalizedAddress)) {
    BLACKLISTED_TOKENS.push(normalizedAddress)
    // Save to localStorage for persistence
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("token_blacklist") || "[]"
      const blacklist: string[] = JSON.parse(saved)
      if (!blacklist.includes(normalizedAddress)) {
        blacklist.push(normalizedAddress)
        localStorage.setItem("token_blacklist", JSON.stringify(blacklist))
      }
    }
  }
}

/**
 * Remove a token from the blacklist
 * @param tokenAddress - Token contract address to remove from blacklist
 */
export function removeFromBlacklist(tokenAddress: string): void {
  const normalizedAddress = tokenAddress.toLowerCase()
  const index = BLACKLISTED_TOKENS.indexOf(normalizedAddress)
  
  if (index > -1) {
    BLACKLISTED_TOKENS.splice(index, 1)
    // Update localStorage
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("token_blacklist") || "[]"
      const blacklist: string[] = JSON.parse(saved)
      const filtered = blacklist.filter(addr => addr !== normalizedAddress)
      localStorage.setItem("token_blacklist", JSON.stringify(filtered))
    }
  }
}

/**
 * Get all blacklisted tokens
 * @returns Array of blacklisted token addresses
 */
export function getBlacklistedTokens(): string[] {
  // Load from localStorage if available
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("token_blacklist")
    if (saved) {
      try {
        const blacklist: string[] = JSON.parse(saved)
        // Merge with in-memory blacklist
        const merged = [...new Set([...BLACKLISTED_TOKENS, ...blacklist])]
        return merged
      } catch {
        return [...BLACKLISTED_TOKENS]
      }
    }
  }
  return [...BLACKLISTED_TOKENS]
}

// Initialize blacklist from localStorage on load
if (typeof window !== "undefined") {
  const saved = localStorage.getItem("token_blacklist")
  if (saved) {
    try {
      const blacklist: string[] = JSON.parse(saved)
      blacklist.forEach(addr => {
        if (!BLACKLISTED_TOKENS.includes(addr.toLowerCase())) {
          BLACKLISTED_TOKENS.push(addr.toLowerCase())
        }
      })
    } catch {
      // Ignore parse errors
    }
  }
}

