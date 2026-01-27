// CoinGecko API for PEPU price
const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price"

// PEPU contract address on Ethereum mainnet
const PEPU_ETH_CONTRACT = "0x93aA0ccD1e5628d3A841C4DbdF602D9eb04085d6"

// Get price by contract address (most reliable method)
export async function getPepuPriceByContract(currency: string = "usd"): Promise<number> {
  try {
    // Use the token_price endpoint for Ethereum tokens
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${PEPU_ETH_CONTRACT}&vs_currencies=${currency.toLowerCase()}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    )

    if (!response.ok) {
      console.error(`CoinGecko API error: ${response.status} - ${response.statusText}`)
      throw new Error(`CoinGecko API error: ${response.status}`)
    }

    const data = await response.json()
    const contractKey = PEPU_ETH_CONTRACT.toLowerCase()
    const currencyKey = currency.toLowerCase()

    if (data[contractKey] && data[contractKey][currencyKey]) {
      console.log(`[CoinGecko] PEPU price fetched: ${data[contractKey][currencyKey]} ${currency.toUpperCase()}`)
      return data[contractKey][currencyKey]
    }

    // If not found by contract, try by ID as fallback
    console.warn(`[CoinGecko] PEPU not found by contract address, trying by ID...`)
    return await getPepuPriceById(currency)
  } catch (error) {
    console.error("Error fetching PEPU price by contract:", error)
    // Try fallback by ID
    try {
      return await getPepuPriceById(currency)
    } catch (fallbackError) {
      console.error("Error fetching PEPU price by ID (fallback):", fallbackError)
      return 0
    }
  }
}

// Get price by token ID (fallback method)
export async function getPepuPriceById(currency: string = "usd"): Promise<number> {
  try {
    // Try common PEPU token IDs
    const possibleIds = ["pepe-unchained", "pepeunchained", "pepu"]
    const currencyKey = currency.toLowerCase()
    
    for (const id of possibleIds) {
      try {
        const response = await fetch(
          `${COINGECKO_API}?ids=${id}&vs_currencies=${currencyKey}`,
          {
            headers: {
              Accept: "application/json",
            },
          },
        )

        if (!response.ok) continue

        const data = await response.json()
        if (data[id] && data[id][currencyKey]) {
          return data[id][currencyKey]
        }
      } catch {
        continue
      }
    }

    return 0
  } catch (error) {
    console.error("Error fetching PEPU price by ID:", error)
    return 0
  }
}

// Main function to get PEPU price (tries both methods)
export async function fetchPepuPrice(currency: string = "usd"): Promise<number> {
  // Try by contract first (more reliable)
  const priceByContract = await getPepuPriceByContract(currency)
  if (priceByContract > 0) {
    return priceByContract
  }

  // Fallback to ID-based lookup
  const priceById = await getPepuPriceById(currency)
  if (priceById > 0) {
    return priceById
  }

  // If both fail, return 0 (will show as $0.00 in portfolio)
  console.warn("Could not fetch PEPU price from CoinGecko")
  return 0
}

// Get ETH price from CoinGecko
export async function fetchEthPrice(currency: string = "usd"): Promise<number> {
  try {
    const response = await fetch(
      `${COINGECKO_API}?ids=ethereum&vs_currencies=${currency.toLowerCase()}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    )

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`)
    }

    const data = await response.json()

    if (data.ethereum && data.ethereum[currency.toLowerCase()]) {
      return data.ethereum[currency.toLowerCase()]
    }

    return 0
  } catch (error) {
    console.error("Error fetching ETH price from CoinGecko:", error)
    return 0
  }
}

// Get PEPU price in a specific currency
export async function fetchPepuPriceInCurrency(currency: string = "usd"): Promise<number> {
  try {
    // First get USD price
    const usdPrice = await fetchPepuPrice()
    if (usdPrice === 0 || currency.toLowerCase() === "usd") {
      return usdPrice
    }

    // Get USD to currency conversion rate
    const response = await fetch(
      `${COINGECKO_API}?ids=ethereum&vs_currencies=usd,${currency.toLowerCase()}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    )

    if (!response.ok) {
      // If conversion fails, return USD price
      return usdPrice
    }

    const data = await response.json()
    if (data.ethereum && data.ethereum.usd && data.ethereum[currency.toLowerCase()]) {
      // Calculate conversion rate
      const ethUsd = data.ethereum.usd
      const ethCurrency = data.ethereum[currency.toLowerCase()]
      const conversionRate = ethCurrency / ethUsd
      return usdPrice * conversionRate
    }

    return usdPrice
  } catch (error) {
    console.error(`Error fetching PEPU price in ${currency}:`, error)
    // Fallback to USD price
    return await fetchPepuPrice()
  }
}

