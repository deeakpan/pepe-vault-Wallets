import { ethers } from "ethers"
import { getProvider } from "./rpc"
import { fetchPepuPrice } from "./coingecko"

const GECKO_TERMINAL_API_BASE = "https://api.geckoterminal.com/api/v2/networks"

// Quoter contract address and ABI for PEPU chain
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
]

// Special token that always has same price as PEPU
const WPEPU_TOKEN_ADDRESS = "0xF9Cf4A16d26979b929Be7176bAc4e7084975FCB8".toLowerCase()

export interface GeckoTokenData {
  price_usd: string | null
  fdv_usd: string | null
  market_cap_usd: string | null
  volume_usd: {
    h24: string | null
  } | null
  image_url: string | null
  name?: string | null
  symbol?: string | null
  decimals?: number | null
}

export interface GeckoTokenFullData {
  address: string
  symbol: string
  name: string
  decimals: number
  price_usd: number | null
  fdv_usd: string | null
  market_cap_usd: string | null
  volume_usd: {
    h24: string | null
  } | null
  image_url: string | null
}

export async function fetchGeckoTerminalData(
  tokenAddress: string,
  network: "pepe-unchained" | "ethereum" = "pepe-unchained",
): Promise<GeckoTokenData | null> {
  try {
    const response = await fetch(`${GECKO_TERMINAL_API_BASE}/${network}/tokens/${tokenAddress}`)
    const data = await response.json()

    if (data.data && data.data.attributes) {
      return data.data.attributes
    }
    return null
  } catch (error) {
    console.error(`Could not fetch GeckoTerminal data for ${network}:`, error)
    return null
  }
}

// Fetch full token details from GeckoTerminal (for ETH tokens or PEPU chain tokens)
export async function fetchGeckoTerminalTokenDetails(
  tokenAddress: string,
  network: "ethereum" | "pepe-unchained" = "ethereum",
): Promise<GeckoTokenFullData | null> {
  try {
    const response = await fetch(`${GECKO_TERMINAL_API_BASE}/${network}/tokens/${tokenAddress}`)
    const data = await response.json()

    if (data.data && data.data.attributes) {
      const attrs = data.data.attributes
      return {
        address: tokenAddress.toLowerCase(),
        symbol: attrs.symbol || attrs.name?.split(" ")[0] || "???",
        name: attrs.name || "Unknown Token",
        decimals: attrs.decimals || 18,
        price_usd: attrs.price_usd ? parseFloat(attrs.price_usd) : null,
        fdv_usd: attrs.fdv_usd,
        market_cap_usd: attrs.market_cap_usd,
        volume_usd: attrs.volume_usd,
        image_url: attrs.image_url,
      }
    }
    return null
  } catch (error) {
    console.error(`Could not fetch GeckoTerminal token details for ${network}:`, error)
    return null
  }
}

/**
 * Get ERC20 token price in USD for PEPU chain tokens using Quoter + CoinGecko
 * Uses Quoter to find how many tokens = 1 PEPU, then multiplies by PEPU price from CoinGecko
 * 
 * @param tokenAddress - ERC20 token address on PEPU chain
 * @param tokenDecimals - Token decimals (default: 18)
 * @returns Token price in USD, or null if unable to calculate
 */
export async function getPepuTokenPriceFromQuoter(
  tokenAddress: string,
  tokenDecimals: number = 18,
): Promise<number | null> {
  try {
    // Special case: WPEPU token always has same price as PEPU
    if (tokenAddress.toLowerCase() === WPEPU_TOKEN_ADDRESS) {
      const pepuPrice = await fetchPepuPrice()
      console.log(`[Price] WPEPU token (${tokenAddress}) using PEPU price: $${pepuPrice}`)
      return pepuPrice
    }

    const provider = getProvider(97741) // PEPU chain
    const quoter = new ethers.Contract(QUOTER_ADDRESS, QUOTER_ABI, provider)
    
    // We want to find: how many tokens = 1 PEPU (1e18 wei)
    const onePepuWei = ethers.parseUnits("1", 18)
    const actualTokenIn = WPEPU_ADDRESS.toLowerCase() // 1 PEPU (as WPEPU)
    const tokenOut = tokenAddress.toLowerCase()

    // Try direct route first (WPEPU -> token)
    let bestQuote: bigint | null = null
    
    for (const fee of FEE_TIERS) {
      try {
        const result = await quoter.quoteExactInputSingle.staticCall({
          tokenIn: actualTokenIn,
          tokenOut,
          amountIn: onePepuWei,
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

    // If no direct route, try reverse (token -> WPEPU) and invert
    if (!bestQuote || bestQuote === BigInt(0)) {
      // Try reverse route: 1 token -> how many PEPU
      const oneTokenWei = ethers.parseUnits("1", tokenDecimals)
      
      for (const fee of FEE_TIERS) {
        try {
          const result = await quoter.quoteExactInputSingle.staticCall({
            tokenIn: tokenOut,
            tokenOut: actualTokenIn,
            amountIn: oneTokenWei,
            fee,
            sqrtPriceLimitX96: 0,
          })
          
          const pepuAmountOut = result[0] // PEPU amount in wei
          if (pepuAmountOut > 0) {
            // If 1 token (in token wei) = X PEPU (in PEPU wei)
            // Then: 1 PEPU (1e18 wei) = (1e18 token wei) / X
            // So: tokensPerPepu (in token units) = (1e18) / X / (10^tokenDecimals)
            // But we need to work in wei, so: tokensPerPepuWei = (onePepuWei * oneTokenWei) / pepuAmountOut
            const tokensPerPepuWei = (onePepuWei * oneTokenWei) / pepuAmountOut
            if (!bestQuote || tokensPerPepuWei > bestQuote) {
              bestQuote = tokensPerPepuWei
            }
          }
        } catch {
          continue
        }
      }
    }

    if (!bestQuote || bestQuote === BigInt(0)) {
      console.warn(`[Price] Could not find route for token ${tokenAddress} via Quoter`)
      return null
    }

    // Calculate tokens per PEPU
    const tokensPerPepu = Number.parseFloat(ethers.formatUnits(bestQuote, tokenDecimals))
    
    if (tokensPerPepu <= 0) {
      console.warn(`[Price] Invalid tokens per PEPU: ${tokensPerPepu} for token ${tokenAddress}`)
      return null
    }

    // Get PEPU price from CoinGecko
    const pepuPrice = await fetchPepuPrice()
    
    if (pepuPrice <= 0) {
      console.warn(`[Price] PEPU price is 0 or invalid: ${pepuPrice}`)
      return null
    }

    // Calculate token price: PEPU price / tokens per PEPU
    // If 1 PEPU = X tokens, then 1 token = PEPU price / X
    const tokenPrice = pepuPrice / tokensPerPepu
    
    console.log(`[Price] Token ${tokenAddress}: ${tokensPerPepu} tokens = 1 PEPU, PEPU price = $${pepuPrice}, Token price = $${tokenPrice}`)
    
    return tokenPrice
  } catch (error) {
    console.error(`[Price] Error calculating token price for ${tokenAddress}:`, error)
    return null
  }
}

