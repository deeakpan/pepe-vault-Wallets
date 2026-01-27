// Etherscan API for Ethereum token details
const ETHERSCAN_API_KEY = "SMNBBJKFQHAI9BR1V19RF82ZEA7HZVB8CT"
const ETHERSCAN_API_BASE = "https://api.etherscan.io/api"

/**
 * Get token balance from Etherscan API
 * This is more reliable than RPC calls for ETH tokens
 */
export async function getEtherscanTokenBalance(
  walletAddress: string,
  tokenAddress: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      `${ETHERSCAN_API_BASE}?module=account&action=tokenbalance&contractaddress=${tokenAddress}&address=${walletAddress}&tag=latest&apikey=${ETHERSCAN_API_KEY}`,
    )

    if (!response.ok) {
      throw new Error(`Etherscan API error: ${response.status}`)
    }

    const data = await response.json()

    if (data.status === "1" && data.result) {
      // Result is in wei (smallest unit), return as string
      return data.result
    }

    return null
  } catch (error) {
    console.error(`Error fetching Etherscan token balance for ${tokenAddress}:`, error)
    return null
  }
}

/**
 * Get ETH native balance from Etherscan API
 */
export async function getEtherscanEthBalance(walletAddress: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${ETHERSCAN_API_BASE}?module=account&action=balance&address=${walletAddress}&tag=latest&apikey=${ETHERSCAN_API_KEY}`,
    )

    if (!response.ok) {
      throw new Error(`Etherscan API error: ${response.status}`)
    }

    const data = await response.json()

    if (data.status === "1" && data.result) {
      // Result is in wei (smallest unit), return as string
      return data.result
    }

    return null
  } catch (error) {
    console.error(`Error fetching Etherscan ETH balance:`, error)
    return null
  }
}

/**
 * Get multiple token balances in a single call (more efficient)
 */
export async function getEtherscanTokenBalances(
  walletAddress: string,
  tokenAddresses: string[],
): Promise<Record<string, string>> {
  const balances: Record<string, string> = {}
  
  // Etherscan allows multiple tokens in one call
  const addresses = tokenAddresses.join(",")
  
  try {
    const response = await fetch(
      `${ETHERSCAN_API_BASE}?module=account&action=tokenbalance&contractaddress=${addresses}&address=${walletAddress}&tag=latest&apikey=${ETHERSCAN_API_KEY}`,
    )

    if (!response.ok) {
      throw new Error(`Etherscan API error: ${response.status}`)
    }

    const data = await response.json()

    if (data.status === "1" && Array.isArray(data.result)) {
      // Result is an array of balances in the same order as tokenAddresses
      data.result.forEach((balance: string, index: number) => {
        if (index < tokenAddresses.length) {
          balances[tokenAddresses[index].toLowerCase()] = balance
        }
      })
    }

    return balances
  } catch (error) {
    console.error(`Error fetching Etherscan token balances:`, error)
    // Fallback to individual calls
    for (const tokenAddress of tokenAddresses) {
      const balance = await getEtherscanTokenBalance(walletAddress, tokenAddress)
      if (balance) {
        balances[tokenAddress.toLowerCase()] = balance
      }
    }
    return balances
  }
}

