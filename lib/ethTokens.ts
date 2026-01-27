import { ethers } from "ethers"
import { getProvider, getProviderWithFallback } from "./rpc"
import { getEtherscanTokenBalance } from "./etherscan"
import { getPepuPriceByContract } from "./coingecko"
import { PEPU_TOKEN_ADDRESS_ETH } from "./config"

// ERC20 ABI for token operations
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
]

// Uniswap V2 Pair ABI (for price calculation)
const UNISWAP_V2_PAIR_ABI = [
  {
    constant: true,
    inputs: [],
    name: "token0",
    outputs: [{ name: "", type: "address" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "token1",
    outputs: [{ name: "", type: "address" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "getReserves",
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
    type: "function",
  },
]

// WETH address on Ethereum mainnet
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
// Uniswap V2 Factory address
const UNISWAP_V2_FACTORY_ADDRESS = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"

// Popular tokens to check via RPC (matching bot code)
const KNOWN_TOKENS = [
  // Stablecoins
  { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether USD" },
  { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin" },
  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", name: "Dai Stablecoin" },
  { address: "0x4Fabb145d64652a948d72533023f6E7A623C7C53", symbol: "BUSD", name: "Binance USD" },
  { address: "0x8E870D67F660D95d5be530380D0eC0bd388289E1", symbol: "USDP", name: "Pax Dollar" },
  { address: "0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd", symbol: "GUSD", name: "Gemini Dollar" },
  { address: "0x853d955aCEf822Db058eb8505911ED77F175b99e", symbol: "FRAX", name: "Frax" },
  { address: "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0", symbol: "LUSD", name: "Liquity USD" },

  // DeFi Tokens
  { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", symbol: "UNI", name: "Uniswap" },
  { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", symbol: "LINK", name: "ChainLink Token" },
  { address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", symbol: "AAVE", name: "Aave Token" },
  { address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F", symbol: "SNX", name: "Synthetix Network Token" },
  { address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", symbol: "MKR", name: "Maker" },
  { address: "0xc00e94Cb662C3520282E6f5717214004A7f26888", symbol: "COMP", name: "Compound" },
  { address: "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2", symbol: "SUSHI", name: "SushiToken" },
  { address: "0xba100000625a3754423978a60c9317c58a424e3D", symbol: "BAL", name: "Balancer" },
  { address: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e", symbol: "YFI", name: "yearn.finance" },
  { address: "0xD533a949740bb3306d119CC777fa900bA034cd52", symbol: "CRV", name: "Curve DAO Token" },

  // Wrapped Tokens
  { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", name: "Wrapped BTC" },
  { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", name: "Wrapped Ether" },

  // Meme Coins
  { address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", symbol: "SHIB", name: "SHIBA INU" },
  { address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", symbol: "PEPE", name: "Pepe" },
  { address: "0x4d224452801ACEd8B2F0aebE155379bb5D594381", symbol: "APE", name: "ApeCoin" },
  { address: "0x3845badAde8e6dFF049820680d1F14bD3903a5d0", symbol: "SAND", name: "The Sandbox" },
  { address: "0xF629cBd94d3791C9250152BD8dfBDF380E2a3B9c", symbol: "ENJ", name: "Enjin Coin" },

  // Exchange Tokens
  { address: "0xB8c77482e45F1F44dE1745F52C74426C631bDD52", symbol: "BNB", name: "BNB" },
  { address: "0x75231F58b43240C9718Dd58B4967c5114342a86c", symbol: "OKB", name: "OKB" },
  { address: "0x4a220E6096B25EADb88358cb44068A3248254675", symbol: "QNT", name: "Quant" },

  // Layer 2 Tokens
  { address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", symbol: "MATIC", name: "Matic Token" },
  { address: "0x0F5D2fB29fb7d3CFeE444a200298f468908cC942", symbol: "MANA", name: "Decentraland" },
  { address: "0xE41d2489571d322189246DaFA5ebDe1F4699F498", symbol: "ZRX", name: "0x Protocol Token" },
  { address: "0x408e41876cCCDC0F92210600ef50372656052a38", symbol: "REN", name: "Republic Token" },

  // Other Popular Tokens
  { address: "0x1494CA1F11D487c2bBe4543E90080AeBa4BA3C2b", symbol: "DPI", name: "DefiPulse Index" },
  { address: "0xc944E90C64B2c07662A292be6244BDf05Cda44a7", symbol: "GRT", name: "Graph Token" },
  { address: "0x0D8775F648430679A709E98d2b0Cb6250d2887EF", symbol: "BAT", name: "Basic Attention Token" },
  { address: "0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF", symbol: "IMX", name: "Immutable X" },
  { address: "0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85", symbol: "FET", name: "Fetch.ai" },
  { address: "0x6f40d4A6237C257fff2dB00FA0510DeEECd303eb", symbol: "INST", name: "Instadapp" },
  { address: "0x111111111117dC0aa78b770fA6A738034120C302", symbol: "1INCH", name: "1inch" },
  { address: "0x0f2D719407FdBeFF09D87557AbB7232601FD9F29", symbol: "SYN", name: "Synapse" },
  { address: PEPU_TOKEN_ADDRESS_ETH, symbol: "PEPU", name: "Pepe Unchained" },
  { address: "0xEA1ea0972fa092dd463f2968F9bB51Cc4c981D71", symbol: "MOG", name: "Mog Coin" },
  { address: "0x0C10bF8FcB7Bf5412187A595ab97a3609160b5c6", symbol: "USDD", name: "Decentralized USD" },
  { address: "0xD31a59c85aE9D8edEFeC411D448f90841571b89c", symbol: "SOL", name: "Wrapped SOL" },
  { address: "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0", symbol: "FXS", name: "Frax Share" },
  { address: "0x6810e776880C02933D47DB1b9fc05908e5386b96", symbol: "GNO", name: "Gnosis" },
  { address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", symbol: "stETH", name: "Lido Staked Ether" },
  { address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", symbol: "LDO", name: "Lido DAO Token" },
]

const ETHERSCAN_API_KEY = "SMNBBJKFQHAI9BR1V19RF82ZEA7HZVB8CT"

export interface TokenBalance {
  address: string
  symbol: string
  name: string
  decimals: number
  balance: bigint
  balanceFormatted: string
  priceUsd?: number
  usdValue?: string
}

/**
 * Format token amount with decimals
 */
function formatTokenAmount(amount: bigint, decimals: number): string {
  const num = Number(ethers.formatUnits(amount, decimals))
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

/**
 * Get ETH price in USD from CoinGecko
 */
async function getEthPriceInUSD(): Promise<number | null> {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
    const data = await response.json()
    return data.ethereum?.usd || null
  } catch (error) {
    console.warn("[ETH Tokens] Could not fetch ETH price from CoinGecko")
    return null
  }
}

/**
 * Find Uniswap V2 pair address for a token
 */
async function findUniswapV2Pair(tokenAddress: string, provider: ethers.JsonRpcProvider): Promise<string | null> {
  try {
    const FACTORY_ABI = [
      {
        constant: true,
        inputs: [
          { name: "tokenA", type: "address" },
          { name: "tokenB", type: "address" },
        ],
        name: "getPair",
        outputs: [{ name: "pair", type: "address" }],
        type: "function",
      },
    ]

    const factory = new ethers.Contract(UNISWAP_V2_FACTORY_ADDRESS, FACTORY_ABI, provider)
    const pairAddress = await factory.getPair(tokenAddress, WETH_ADDRESS)

    if (pairAddress === ethers.ZeroAddress) {
      return null
    }

    return pairAddress
  } catch (error) {
    return null
  }
}

/**
 * Get token price from Uniswap V2 DEX
 */
async function getTokenPriceFromDex(
  tokenAddress: string,
  tokenDecimals: number,
  provider: ethers.JsonRpcProvider,
): Promise<{ priceInUsd: number | null; source: string } | null> {
  try {
    const pairAddress = await findUniswapV2Pair(tokenAddress, provider)

    if (!pairAddress) {
      return null
    }

    const pairContract = new ethers.Contract(pairAddress, UNISWAP_V2_PAIR_ABI, provider)

    const [token0, token1, reserves] = await Promise.all([
      pairContract.token0(),
      pairContract.token1(),
      pairContract.getReserves(),
    ])

    const reserve0 = reserves[0]
    const reserve1 = reserves[1]

    // Determine which reserve is the token and which is WETH
    const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase()

    const tokenReserve = isToken0 ? reserve0 : reserve1
    const wethReserve = isToken0 ? reserve1 : reserve0

    // Calculate price in ETH
    const tokenAmount = Number(ethers.formatUnits(tokenReserve, tokenDecimals))
    const wethAmount = Number(ethers.formatEther(wethReserve))

    if (tokenAmount === 0) {
      return null
    }

    const priceInEth = wethAmount / tokenAmount

    // Get ETH price in USD
    const ethPriceUsd = await getEthPriceInUSD()

    if (!ethPriceUsd) {
      return {
        priceInUsd: null,
        source: "Uniswap V2 (no ETH price)",
      }
    }

    const priceInUsd = priceInEth * ethPriceUsd

    return {
      priceInUsd,
      source: "Uniswap V2",
    }
  } catch (error) {
    console.warn(`[ETH Tokens] Error fetching DEX price for ${tokenAddress}:`, error)
    return null
  }
}

/**
 * Get token price from CoinGecko API
 */
async function getTokenPriceFromAPI(tokenAddress: string): Promise<{ priceInUsd: number; source: string } | null> {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=usd`,
    )

    const data = await response.json()
    const price = data[tokenAddress.toLowerCase()]?.usd

    if (price) {
      return {
        priceInUsd: price,
        source: "CoinGecko API",
      }
    }

    return null
  } catch (error) {
    return null
  }
}

/**
 * Get token price for ETH ERC20 tokens
 * Tries CoinGecko API first, then Uniswap V2 DEX as fallback
 */
async function getEthTokenPrice(
  tokenAddress: string,
  tokenDecimals: number,
  provider: ethers.JsonRpcProvider,
): Promise<{ priceInUsd: number | null; source: string } | null> {
  // Try CoinGecko API first (faster)
  const apiPrice = await getTokenPriceFromAPI(tokenAddress)
  if (apiPrice) {
    return apiPrice
  }

  // Try DEX price as fallback
  const dexPrice = await getTokenPriceFromDex(tokenAddress, tokenDecimals, provider)
  return dexPrice
}

/**
 * Get all token balances using dual-method approach:
 * 1. Scan known tokens via RPC (fast and reliable)
 * 2. Check Etherscan for additional tokens (supplementary)
 */
export async function getAllEthTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
  const tokens: TokenBalance[] = []
  
  try {
    console.log("[ETH Tokens] Fetching token balances via RPC for address:", walletAddress)
    
    // Use getProviderWithFallback for better reliability
    const provider = await getProviderWithFallback(1) // Ethereum mainnet
    console.log("[ETH Tokens] Provider initialized successfully")

    // Method 1: Check known tokens via RPC (FAST and RELIABLE)
    for (const knownToken of KNOWN_TOKENS) {
      try {
        const tokenContract = new ethers.Contract(knownToken.address, ERC20_ABI, provider)

        // Get balance only (faster)
        const balance = await tokenContract.balanceOf(walletAddress)

        // Only fetch details if balance > 0
        if (balance > 0n) {
          const [decimals, symbol, name] = await Promise.all([
            tokenContract.decimals(),
            tokenContract.symbol(),
            tokenContract.name(),
          ])

          const balanceFormatted = formatTokenAmount(balance, Number(decimals))

          tokens.push({
            address: knownToken.address.toLowerCase(),
            symbol: symbol,
            name: name,
            decimals: Number(decimals),
            balance: balance,
            balanceFormatted: balanceFormatted,
          })

          console.log(`[ETH Tokens] Found ${symbol}: ${balanceFormatted}`)
        }
      } catch (error: any) {
        // Skip tokens that error out, but log for debugging
        console.warn(`[ETH Tokens] Error checking token ${knownToken.symbol} (${knownToken.address}):`, error?.message || error)
        continue
      }
    }

    console.log(`[ETH Tokens] Found ${tokens.length} tokens via RPC scanning`)

    // Method 2: Try Etherscan API as supplementary (might find tokens not in our list)
    try {
      const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${walletAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`

      const response = await fetch(url, { timeout: 10000 } as any)

      if (response.ok) {
        const data = await response.json()

        if (data.status === "1" && data.result) {
          const tokenAddresses = [...new Set(data.result.map((tx: any) => tx.contractAddress))]

          console.log(`[ETH Tokens] Etherscan found ${tokenAddresses.length} token contracts`)

          // Check tokens from Etherscan that we haven't already found
          for (const tokenAddress of tokenAddresses) {
            // Skip if we already have this token
            if (tokens.find((t) => t.address.toLowerCase() === tokenAddress.toLowerCase())) {
              continue
            }

            try {
              const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)

              const balance = await tokenContract.balanceOf(walletAddress)

              if (balance > 0n) {
                const [decimals, symbol, name] = await Promise.all([
                  tokenContract.decimals(),
                  tokenContract.symbol(),
                  tokenContract.name(),
                ])

                const balanceFormatted = formatTokenAmount(balance, Number(decimals))

                tokens.push({
                  address: tokenAddress.toLowerCase(),
                  symbol: symbol,
                  name: name,
                  decimals: Number(decimals),
                  balance: balance,
                  balanceFormatted: balanceFormatted,
                })

                console.log(`[ETH Tokens] Found additional token ${symbol}: ${balanceFormatted}`)
              }
            } catch (error: any) {
              console.warn(`[ETH Tokens] Error checking Etherscan token ${tokenAddress}:`, error?.message || error)
              continue
            }
          }
        }
      }
    } catch (etherscanError: any) {
      console.log(
        "[ETH Tokens] Etherscan API supplementary check failed (non-critical):",
        etherscanError.message,
      )
    }

    // Fetch prices for tokens
    for (const token of tokens) {
      try {
        // If it's PEPU, use CoinGecko
        if (token.address.toLowerCase() === PEPU_TOKEN_ADDRESS_ETH.toLowerCase()) {
          console.log(`[ETH Tokens] Fetching PEPU price from CoinGecko for ${token.symbol}...`)
          const price = await getPepuPriceByContract()
          if (price > 0) {
            token.priceUsd = price
            const balanceNum = Number(ethers.formatUnits(token.balance, token.decimals))
            token.usdValue = (balanceNum * token.priceUsd).toFixed(2)
            console.log(`[ETH Tokens] PEPU price set: $${price}, USD value: $${token.usdValue}`)
          } else {
            console.warn(`[ETH Tokens] PEPU price returned 0, token may not be listed on CoinGecko`)
          }
        } else {
          // For other ERC20 tokens, use CoinGecko API + Uniswap V2 fallback
          const priceInfo = await getEthTokenPrice(token.address, token.decimals, provider)
          if (priceInfo?.priceInUsd) {
            token.priceUsd = priceInfo.priceInUsd
            const balanceNum = Number(ethers.formatUnits(token.balance, token.decimals))
            token.usdValue = (balanceNum * token.priceUsd).toFixed(2)
          }
        }
      } catch (error) {
        // Price fetching is optional, continue without it
        console.warn(`[ETH Tokens] Could not fetch price for ${token.symbol}:`, error)
      }
    }

    // Sort by balance value (USD if available, otherwise by token amount)
    tokens.sort((a, b) => {
      if (a.usdValue && b.usdValue) {
        return parseFloat(b.usdValue) - parseFloat(a.usdValue)
      }
      const aNum = Number(ethers.formatUnits(a.balance, a.decimals))
      const bNum = Number(ethers.formatUnits(b.balance, b.decimals))
      return bNum - aNum
    })

    return tokens
  } catch (error: any) {
    console.error("[ETH Tokens] Error getting token balances:", error?.message || error)
    console.error("[ETH Tokens] Stack trace:", error?.stack)
    return tokens // Return whatever we found
  }
}

/**
 * Get token info for a specific token address
 */
export async function getEthTokenInfo(
  walletAddress: string,
  tokenAddress: string,
): Promise<TokenBalance | null> {
  try {
    const provider = getProvider(1)
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)

    const [balance, decimals, symbol, name] = await Promise.all([
      tokenContract.balanceOf(walletAddress),
      tokenContract.decimals(),
      tokenContract.symbol(),
      tokenContract.name(),
    ])

    const balanceFormatted = formatTokenAmount(balance, Number(decimals))

    const tokenInfo: TokenBalance = {
      address: tokenAddress.toLowerCase(),
      symbol: symbol,
      name: name,
      decimals: Number(decimals),
      balance: balance,
      balanceFormatted: balanceFormatted,
    }

    // Try to fetch price
    try {
      // If it's PEPU, use CoinGecko
      if (tokenAddress.toLowerCase() === PEPU_TOKEN_ADDRESS_ETH.toLowerCase()) {
        const price = await getPepuPriceByContract()
        if (price > 0) {
          tokenInfo.priceUsd = price
          const balanceNum = Number(ethers.formatUnits(balance, Number(decimals)))
          tokenInfo.usdValue = (balanceNum * tokenInfo.priceUsd).toFixed(2)
        }
      } else {
        // For other ERC20 tokens, use CoinGecko API + Uniswap V2 fallback
        const priceInfo = await getEthTokenPrice(tokenAddress, Number(decimals), provider)
        if (priceInfo?.priceInUsd) {
          tokenInfo.priceUsd = priceInfo.priceInUsd
          const balanceNum = Number(ethers.formatUnits(balance, Number(decimals)))
          tokenInfo.usdValue = (balanceNum * tokenInfo.priceUsd).toFixed(2)
        }
      }
    } catch (error) {
      // Price fetching is optional
      console.warn(`[ETH Tokens] Could not fetch price for ${tokenAddress}:`, error)
    }

    return tokenInfo
  } catch (error) {
    console.error(`[ETH Tokens] Error getting token info for ${tokenAddress}:`, error)
    return null
  }
}

