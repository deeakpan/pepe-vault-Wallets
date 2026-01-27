"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  getWallets,
  getWalletState,
  updateActivity,
  getCurrentWallet,
  getCurrentWalletId,
  setCurrentWalletId,
  importWalletFromMnemonic,
  importWalletFromPrivateKey,
  addWallet,
  createWallet,
  unlockWallet,
} from "@/lib/wallet"
import { getSavedEthCustomTokens, addEthCustomToken } from "@/lib/customTokens"
import { getNativeBalance, getProviderWithFallback } from "@/lib/rpc"
import { reportRpcError, reportRpcSuccess, getRpcHealthStatus, subscribeToRpcHealth } from "@/lib/rpcHealth"
import { isTokenBlacklisted } from "@/lib/blacklist"
import { fetchPepuPrice, fetchEthPrice } from "@/lib/coingecko"
import { getSavedCurrency, getDefaultCurrency, type Currency } from "@/lib/currencies"
import { fetchGeckoTerminalData, getPepuTokenPriceFromQuoter } from "@/lib/gecko"
import { getAllEthTokenBalances } from "@/lib/ethTokens"
import { UCHAIN_TOKEN_ADDRESS } from "@/lib/config"
import { getDomainByWallet } from "@/lib/domains"
import { getUnchainedProvider } from "@/lib/provider"
import { Send, Download, Network, ArrowLeftRight, Menu, Globe, ImageIcon, Coins, History, Gift } from "lucide-react"
import Link from "next/link"
import BottomNav from "@/components/BottomNav"
import RpcConnectionNotification from "@/components/RpcConnectionNotification"
import { ethers } from "ethers"

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]

export default function DashboardPage() {
  const router = useRouter()
  const [portfolioValue, setPortfolioValue] = useState("0.00")
  const [pepuPrice, setPepuPrice] = useState<number>(0)
  const [ethPrice, setEthPrice] = useState<number>(0)
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(getSavedCurrency())
  const [balances, setBalances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [cachedBalances, setCachedBalances] = useState<any[]>([])
  const [cachedPortfolioValue, setCachedPortfolioValue] = useState("0.00")
  const [walletDomains, setWalletDomains] = useState<Record<string, string>>({})
  const [chainId, setChainId] = useState(() => {
    // Initialize from localStorage or default to PEPU
    // CRITICAL: For extension iframe, ensure we default to PEPU and sync with provider
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selected_chain")
      const savedChainId = saved ? Number(saved) : 97741
      // Ensure it's a valid chainId (1 for ETH, 97741 for PEPU), default to PEPU if invalid
      const validChainId = (savedChainId === 1 || savedChainId === 97741) ? savedChainId : 97741
      
      // Sync with provider immediately on initialization (especially important for extension)
      if (validChainId !== 97741 || !saved) {
        // If not PEPU or no saved value, ensure both localStorage keys are set
        localStorage.setItem("selected_chain", validChainId.toString())
        localStorage.setItem("unchained_chain_id", validChainId.toString())
      }
      
      return validChainId
    }
    return 97741
  })
  const [wallets, setWallets] = useState<any[]>([])
  const [currentWalletId, setCurrentWalletIdState] = useState<string | null>(null)
  const [showAddWallet, setShowAddWallet] = useState(false)
  const [addWalletMode, setAddWalletMode] = useState<"menu" | "from-seed" | "import-seed" | "import-key">("menu")
  const [newWalletName, setNewWalletName] = useState("")
  const [addPassword, setAddPassword] = useState("")
  const [addSeedPhrase, setAddSeedPhrase] = useState("")
  const [addPrivateKey, setAddPrivateKey] = useState("")
  const [addWalletError, setAddWalletError] = useState("")
  const [addWalletLoading, setAddWalletLoading] = useState(false)
  const [showWalletMenu, setShowWalletMenu] = useState(false)
  const [showAddToken, setShowAddToken] = useState(false)
  const [customTokenAddress, setCustomTokenAddress] = useState("")
  const [customTokenError, setCustomTokenError] = useState("")
  const [customTokenInfo, setCustomTokenInfo] = useState<{
    address: string
    symbol: string
    name: string
    decimals: number
  } | null>(null)

  // Load VAULT Domains for all wallets so we can show domain names instead of raw wallet labels
  useEffect(() => {
    let isMounted = true

    const loadDomains = async () => {
      if (wallets.length === 0) return

      const domainMap: Record<string, string> = {}

      for (const wallet of wallets) {
        try {
          const domain = await getDomainByWallet(wallet.address)
          if (domain) {
            domainMap[wallet.id] = domain
          }
        } catch (error) {
          console.error("[Dashboard] Error loading domain for wallet", wallet.address, error)
        }
      }

      if (isMounted) {
        setWalletDomains(domainMap)
      }
    }

    void loadDomains()

    return () => {
      isMounted = false
    }
  }, [wallets])

  useEffect(() => {
    // Check if wallet exists
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    // CRITICAL: Sync provider chainId with UI chainId
    // Only sync on mount, don't override user's explicit chain switches
    const provider = getUnchainedProvider()
    const providerChainId = provider.getChainId()
    
    // Ensure chainId is valid (1 or 97741), default to PEPU if invalid
    const validChainId = (chainId === 1 || chainId === 97741) ? chainId : 97741
    
    // Only sync if provider has invalid chainId OR if this is the first mount (not a chain switch)
    // Use a ref to track if this is the initial mount
    const isInitialMount = !(window as any).__unchained_dashboard_mounted
    ;(window as any).__unchained_dashboard_mounted = true
    
    if (providerChainId !== 1 && providerChainId !== 97741) {
      // Provider has invalid chainId, default to PEPU
      console.log(`[Dashboard] Provider has invalid chainId ${providerChainId}, defaulting to PEPU`)
      provider.setChainId(97741)
      if (validChainId !== 97741) {
        setChainId(97741)
        localStorage.setItem("selected_chain", "97741")
        localStorage.setItem("unchained_chain_id", "97741")
      }
    } else if (isInitialMount && providerChainId !== validChainId) {
      // Only sync on initial mount if they're out of sync
      // This prevents overriding user's explicit chain switches
      console.log(`[Dashboard] Initial mount - syncing provider chainId from ${providerChainId} to ${validChainId}`)
      provider.setChainId(validChainId)
    }
    // Don't sync on subsequent renders - respect user's choice

    // No password required for viewing dashboard
    updateActivity()
    setWallets(wallets)
    setCurrentWalletIdState(getCurrentWalletId())
    
    // Load display currency
    if (typeof window !== "undefined") {
      setDisplayCurrency(getSavedCurrency())
    }
    
    const wallet = getCurrentWallet() || wallets[0]
    
    // Try to load from cache first if available
    const cacheKey = `balance_cache_${wallet.address}_${chainId}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const cachedData = JSON.parse(cached)
        setBalances(cachedData.balances || [])
        setPortfolioValue(cachedData.portfolioValue || "0.00")
        setCachedBalances(cachedData.balances || [])
        setCachedPortfolioValue(cachedData.portfolioValue || "0.00")
      } catch (error) {
        console.error("Error loading cached balances:", error)
      }
    }
    
    // Only show loading if we don't have cached data (initial load)
    // If we have cache, show it immediately and fetch in background
    const hasCachedData = !!cached
    setIsInitialLoad(!hasCachedData)
    setLoading(!hasCachedData)
    
    fetchBalances()
    
    // Listen for currency changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "display_currency") {
        setDisplayCurrency(getSavedCurrency())
        fetchBalances()
      }
    }
    window.addEventListener("storage", handleStorageChange)
    
    // Set up retry mechanism: retry more frequently when RPC is unhealthy
    let retryInterval: NodeJS.Timeout | null = null
    let healthCheckInterval: NodeJS.Timeout | null = null
    
    const setupRetryInterval = () => {
      // Clear existing interval
      if (retryInterval) {
        clearInterval(retryInterval)
      }
      
      // Check health status
      const healthStatus = getRpcHealthStatus(chainId)
      
      // If unhealthy, retry every 5 seconds; otherwise every 30 seconds
      const retryDelay = healthStatus.isHealthy ? 30000 : 5000
      
      retryInterval = setInterval(() => {
    fetchBalances()
      }, retryDelay)
    }
    
    // Initial setup
    setupRetryInterval()
    
    // Subscribe to health status changes to adjust retry interval
    const unsubscribe = subscribeToRpcHealth((updatedChainId, status) => {
      if (updatedChainId === chainId) {
        setupRetryInterval()
      }
    })
    
    // Also check health status periodically to catch any missed updates
    healthCheckInterval = setInterval(() => {
      setupRetryInterval()
    }, 10000) // Check every 10 seconds
    
    return () => {
      if (retryInterval) clearInterval(retryInterval)
      if (healthCheckInterval) clearInterval(healthCheckInterval)
      unsubscribe()
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [router, chainId, displayCurrency])

  // Save chainId to localStorage and sync with provider when it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Only sync if chainId is valid (1 or 97741)
      const validChainId = (chainId === 1 || chainId === 97741) ? chainId : 97741
      
      // Sync both localStorage keys
      localStorage.setItem("selected_chain", validChainId.toString())
      localStorage.setItem("unchained_chain_id", validChainId.toString())
      
      // Sync provider chainId - respect user's choice
      const provider = getUnchainedProvider()
      if (provider.getChainId() !== validChainId) {
        console.log(`[Dashboard] Updating provider chainId to ${validChainId}`)
        provider.setChainId(validChainId)
      }
      
      // Update state if chainId was invalid
      if (validChainId !== chainId) {
        setChainId(validChainId)
      }
    }
  }, [chainId])

  const fetchBalances = async () => {
    // Only show loading on initial load
    if (isInitialLoad) {
    setLoading(true)
    }
    
    try {
      const wallets = getWallets()
      if (wallets.length === 0) {
        setLoading(false)
        setIsInitialLoad(false)
        return
      }

      const wallet = getCurrentWallet() || wallets[0]
      const allBalances: any[] = []

      // CRITICAL: Ensure we're on the correct chain - never show ETH when on PEPU
      // Default to PEPU (97741) if chainId is not explicitly 1
      const currentChainId = chainId === 1 ? 1 : 97741
      if (currentChainId !== chainId) {
        console.warn(`[Dashboard] ChainId mismatch detected: ${chainId} -> correcting to ${currentChainId}`)
        setChainId(currentChainId)
        return // Exit early to prevent showing wrong chain data
      }

      // Get native balance - use currentChainId to ensure correct chain
      const balance = await getNativeBalance(wallet.address, currentChainId)
      const nativeSymbol = currentChainId === 1 ? "ETH" : "PEPU"

      let nativePrice = 0
      let nativeUsdValue = "0.00"

      // CRITICAL: Only fetch ETH price if explicitly on chain 1, otherwise use PEPU
      // Use selected currency for price fetching
      const currencyCode = displayCurrency.code
      if (currentChainId === 1) {
        // Ethereum - fetch from CoinGecko in selected currency
        const price = await fetchEthPrice(currencyCode)
        setEthPrice(price)
        nativePrice = price
        nativeUsdValue = (Number.parseFloat(balance) * price).toFixed(2)
      } else {
        // PEPU (default) - fetch from CoinGecko in selected currency
        const price = await fetchPepuPrice(currencyCode)
        setPepuPrice(price)
        nativePrice = price
        nativeUsdValue = (Number.parseFloat(balance) * price).toFixed(2)
      }

      allBalances.push({
          symbol: nativeSymbol,
          name: currentChainId === 1 ? "Ethereum" : "Pepe Unchained",
          balance,
        usdValue: nativeUsdValue,
        isNative: true,
        isBonded: nativePrice > 0, // Native token is bonded if price > 0
      })

      // Get ERC-20 tokens
      // CRITICAL: Only fetch tokens for the current chain
      if (currentChainId === 97741 || currentChainId === 1) {
        try {
          if (currentChainId === 1) {
            // For ETH: Use the new dual-method approach (RPC + Etherscan)
            try {
              console.log("[Dashboard] Fetching ETH tokens for:", wallet.address)
              const ethTokens = await getAllEthTokenBalances(wallet.address)
              console.log("[Dashboard] Found ETH tokens:", ethTokens.length)
              
              // Filter out blacklisted tokens
              const filteredTokens = ethTokens.filter(
                (token) => !isTokenBlacklisted(token.address, chainId)
              )
              console.log("[Dashboard] After blacklist filter:", filteredTokens.length)

              // Convert to dashboard format
              for (const token of filteredTokens) {
                const balanceFormatted = token.balanceFormatted
                const balanceNum = Number.parseFloat(balanceFormatted)
                
                if (balanceNum > 0) {
                  allBalances.push({
                    symbol: token.symbol,
                    name: token.name,
                    balance: balanceFormatted,
                    address: token.address,
                    decimals: token.decimals,
                    usdValue: token.usdValue || "0.00",
                    isNative: false,
                    isBonded: token.priceUsd !== undefined && token.priceUsd > 0,
                  })
                  console.log("[Dashboard] Added token:", token.symbol, balanceFormatted)
                }
              }
              console.log("[Dashboard] Total ETH tokens added to balances:", allBalances.filter(b => !b.isNative).length)
            } catch (ethTokenError) {
              console.error("[Dashboard] Error fetching ETH tokens:", ethTokenError)
              // Continue even if ETH token fetching fails
            }
          } else if (currentChainId === 97741) {
            // For PEPU: Use existing logic with contract calls and GeckoTerminal
            const provider = await getProviderWithFallback(currentChainId)
            const network = "pepe-unchained"

            const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
            let currentBlock = 0
            try {
              currentBlock = await provider.getBlockNumber()
              reportRpcSuccess(currentChainId)
            } catch (error: any) {
              console.error("Error getting block number:", error)
              const errorMsg = error?.message || String(error) || "RPC connection failed"
              reportRpcError(currentChainId, errorMsg)
            }

            const lookback = 10000
            const fromBlock = Math.max(0, currentBlock - lookback)

            let tokenAddresses: string[] = []

            // Try to get token addresses from transfer logs
            try {
              const addressTopic = ethers.zeroPadValue(wallet.address, 32)

              const [logsFrom, logsTo] = await Promise.all([
                provider.getLogs({
                  fromBlock,
                  toBlock: "latest",
                  topics: [transferTopic, addressTopic],
                }).catch(() => []),
                provider.getLogs({
                  fromBlock,
                  toBlock: "latest",
                  topics: [transferTopic, null, addressTopic],
                }).catch(() => []),
              ])

              const allLogs = [...logsFrom, ...logsTo]
              tokenAddresses = [...new Set(allLogs.map((log) => log.address.toLowerCase()))]
            } catch (error) {
              console.error("Error fetching transfer logs:", error)
            }

            // Filter out blacklisted tokens
            const filteredTokenAddresses = tokenAddresses.filter(
              (addr) => !isTokenBlacklisted(addr, currentChainId)
            )

            // Fetch token details for PEPU
            const tokenPromises = filteredTokenAddresses.map(async (tokenAddress) => {
              try {
                const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
                const [balance, dec, sym, nm] = await Promise.all([
                  contract.balanceOf(wallet.address).catch(() => ethers.parseUnits("0", 18)),
                  contract.decimals().catch(() => 18),
                  contract.symbol().catch(() => "???"),
                  contract.name().catch(() => "Unknown Token"),
                ])

                const balanceFormatted = ethers.formatUnits(balance, dec)
                const hasBalance = Number.parseFloat(balanceFormatted) > 0

                if (!hasBalance) return null

                let priceUsd = 0
                let isBonded = false

                // For PEPU chain ERC20 tokens, use Quoter + CoinGecko for price
                // Still use GeckoTerminal for token details (name, symbol, etc.) if needed
                try {
                  // Get price from Quoter + CoinGecko (not GeckoTerminal)
                  const quoterPrice = await getPepuTokenPriceFromQuoter(tokenAddress, dec)
                  
                  if (quoterPrice !== null && quoterPrice > 0) {
                    priceUsd = quoterPrice
                    isBonded = true
                    console.log(`[Dashboard] Token ${tokenAddress} price from Quoter: $${priceUsd}`)
                  } else {
                    // Fallback: if Quoter fails, price will be 0 (not bonded)
                    priceUsd = 0
                    isBonded = false
                    console.warn(`[Dashboard] Could not get price from Quoter for ${tokenAddress}`)
                  }
                } catch (error) {
                  console.error(`Error fetching price for ${tokenAddress}:`, error)
                  priceUsd = 0
                  isBonded = false
                }
                const usdValue = isBonded && hasBalance
                  ? (Number.parseFloat(balanceFormatted) * priceUsd).toFixed(2)
                  : "0.00"

                return {
                  address: tokenAddress,
                  symbol: sym,
                  name: nm,
                  balance: balanceFormatted,
                  decimals: dec,
                  usdValue,
                  isNative: false,
                  isBonded,
                  priceUsd: isBonded ? priceUsd : null,
                }
    } catch (error) {
                console.error(`Error fetching token ${tokenAddress}:`, error)
                return null
              }
            })

            const tokenResults = await Promise.all(tokenPromises)
            const validTokens = tokenResults.filter((token) => token !== null)
            allBalances.push(...validTokens)
          }
        } catch (error: any) {
          console.error("Error scanning for tokens:", error)
          // Report RPC error if it's RPC-related
          const errorMessage = error?.message || String(error) || "Unknown error"
          if (errorMessage.includes("RPC") || errorMessage.includes("connection") || errorMessage.includes("fetch") || errorMessage.includes("network")) {
            reportRpcError(chainId, errorMessage)
          }
          // Don't throw - still show native balance even if token scanning fails
        }
      }

      // Calculate total portfolio value
      // Only include bonded tokens (tokens with valid USD price)
      const totalValue = allBalances.reduce((sum, token) => {
        if (token.isNative) {
          // Native token (ETH or PEPU) - add if price > 0
          return sum + (nativePrice > 0 ? Number.parseFloat(token.usdValue) : 0)
        } else {
          // ERC20 tokens - only add if bonded
          return sum + (token.isBonded ? Number.parseFloat(token.usdValue) : 0)
        }
      }, 0)

      const portfolioValueStr = totalValue.toFixed(2)
      
      // Update state
      setBalances(allBalances)
      setPortfolioValue(portfolioValueStr)
      
      // Update cache
      setCachedBalances(allBalances)
      setCachedPortfolioValue(portfolioValueStr)
      
      // Save to localStorage
      // CRITICAL: Convert BigInt values to strings before serialization
      const sanitizedBalances = allBalances.map(balance => {
        const sanitized: any = { ...balance }
        // Convert any BigInt values to strings
        Object.keys(sanitized).forEach(key => {
          if (typeof sanitized[key] === 'bigint') {
            sanitized[key] = sanitized[key].toString()
          }
        })
        return sanitized
      })
      
      const cacheKey = `balance_cache_${wallet.address}_${chainId}`
      localStorage.setItem(cacheKey, JSON.stringify({
        balances: sanitizedBalances,
        portfolioValue: portfolioValueStr,
        timestamp: Date.now(),
      }))
      
      // Report success if we got here (balance fetch succeeded)
      reportRpcSuccess(chainId)
      
    } catch (error: any) {
      console.error("Error fetching balances:", error)
      
      // Report RPC error if it's an RPC-related error
      const errorMessage = error?.message || String(error) || "Unknown error"
      if (errorMessage.includes("RPC") || errorMessage.includes("connection") || errorMessage.includes("fetch") || errorMessage.includes("network")) {
        reportRpcError(chainId, errorMessage)
      }
      
      // On error, use cached data if available (only if not initial load)
      if (!isInitialLoad && cachedBalances.length > 0) {
        console.log("[Dashboard] Using cached balances due to fetch error")
        setBalances(cachedBalances)
        setPortfolioValue(cachedPortfolioValue)
      } else if (isInitialLoad) {
        // On initial load error, show empty state
        setBalances([])
        setPortfolioValue("0.00")
      }
      // If not initial load and no cache, keep previous state (don't clear)
    } finally {
      setLoading(false)
      setIsInitialLoad(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24 relative">
      {/* RPC Connection Notification */}
      <RpcConnectionNotification chainId={chainId} />
      
      {/* Header */}
      <div className="glass-card rounded-none p-6 border-b border-white/10 relative z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Chain Toggle Switch - Top Left */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium transition-colors ${chainId === 1 ? 'text-white' : 'text-gray-500'}`}>
              ETH
            </span>
            <button
              onClick={() => {
                const newChainId = chainId === 1 ? 97741 : 1
                setChainId(newChainId)
                setBalances([])
                setPortfolioValue("0.00")
                setLoading(true)
                // Sync both localStorage keys and provider
                localStorage.setItem("selected_chain", newChainId.toString())
                localStorage.setItem("unchained_chain_id", newChainId.toString())
                const provider = getUnchainedProvider()
                provider.setChainId(newChainId)
                console.log(`[Dashboard] Chain switched to ${newChainId === 97741 ? 'PEPU' : 'ETH'}`)
              }}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                chainId === 97741 ? 'bg-green-500' : 'bg-gray-600'
              }`}
              role="switch"
              aria-checked={chainId === 97741}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  chainId === 97741 ? 'translate-x-8' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-xs font-medium transition-colors ${chainId === 97741 ? 'text-white' : 'text-gray-500'}`}>
              PEPU
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Wallet selector */}
            {wallets.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowWalletMenu((prev) => !prev)}
                  className="glass-card px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-white/10 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-green-400">
                      {(() => {
                        const activeWallet = wallets.find((w) => w.id === currentWalletId) || wallets[0]
                        const displayName = walletDomains[activeWallet?.id || ""] || activeWallet?.name || "W"
                        return displayName[0]?.toUpperCase() || "W"
                      })()}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-gray-400">Active PEPU VAULT WALLET</p>
                    <p className="text-sm font-semibold">
                      {(() => {
                        const activeWallet = wallets.find((w) => w.id === currentWalletId) || wallets[0]
                        return walletDomains[activeWallet?.id || ""] || activeWallet?.name || "My PEPU VAULT WALLET"
                      })()}
                    </p>
          </div>
                </button>
                {/* Simple dropdown list, toggled by button */}
                {showWalletMenu && (
                  <div className="absolute right-0 mt-2 w-64 glass-card border border-white/10 max-h-64 overflow-y-auto z-[200]">
                    {wallets.map((wallet) => (
                      <button
                        key={wallet.id}
                        onClick={() => {
                          setCurrentWalletId(wallet.id)
                          setCurrentWalletIdState(wallet.id)
                          setShowWalletMenu(false)
                          fetchBalances()
                        }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-white/10 flex flex-col ${
                          wallet.id === currentWalletId ? "bg-green-500/10" : ""
                        }`}
                      >
                        <span className="font-semibold">
                          {walletDomains[wallet.id] || wallet.name || "Wallet"}
                        </span>
                        <span className="font-mono text-[10px] text-gray-400">
                          {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                        </span>
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setShowAddWallet(true)
                        setAddWalletMode("menu")
                        setAddWalletError("")
                        setShowWalletMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-green-400 hover:bg-green-500/10 border-t border-white/10"
                    >
                      + Add Wallet
          </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Portfolio */}
      <div className="max-w-6xl mx-auto px-4 mt-8">
        <div className="glass-card p-8 mb-8">
          <div className="text-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Portfolio Value</p>
            <h2 className="text-6xl font-bold gradient-text mb-3 tracking-tight">
              {displayCurrency.symbol}{portfolioValue}
            </h2>
            {chainId === 97741 && pepuPrice > 0 && (
              <p className="text-xs text-gray-500 mb-2">
                PEPU Price: {displayCurrency.symbol}{pepuPrice.toFixed(8)}
              </p>
            )}
            {chainId === 1 && ethPrice > 0 && (
              <p className="text-xs text-gray-500 mb-2">
                ETH Price: {displayCurrency.symbol}{ethPrice.toFixed(2)}
              </p>
            )}
          </div>

          {/* Active wallet display inside portfolio */}
          {wallets.length > 0 && (
            <div className="mb-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Active PEPU VAULT WALLET</p>
              <p className="text-xs font-mono text-gray-400">
                {(wallets.find((w) => w.id === currentWalletId) || wallets[0]).address.slice(0, 6)}...
                {(wallets.find((w) => w.id === currentWalletId) || wallets[0]).address.slice(-4)}
              </p>
            </div>
          )}


          {/* Quick Actions */}
          {chainId === 1 ? (
            // Ethereum: Send + Receive + Add Custom Token (+)
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Link href="/send" className="glass-card p-4 text-center hover:bg-white/10 transition-all">
              <div className="flex justify-center mb-2">
                <Send className="w-6 h-6 text-green-500" />
              </div>
              <p className="text-sm font-semibold">Send</p>
            </Link>

            <Link href="/receive" className="glass-card p-4 text-center hover:bg-white/10 transition-all">
              <div className="flex justify-center mb-2">
                <Download className="w-6 h-6 text-green-500" />
              </div>
              <p className="text-sm font-semibold">Receive</p>
            </Link>
              </div>

              {/* ETH Add Custom Token "+" button under Send/Receive */}
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    setShowAddToken(true)
                    setCustomTokenAddress("")
                    setCustomTokenError("")
                  }}
                  className="w-10 h-10 rounded-full bg-green-500 text-black flex items-center justify-center text-xl font-bold hover:bg-green-400 transition-colors"
                  aria-label="Add custom token"
                >
                  +
                </button>
                  </div>
                </div>
          ) : (
            // PEPU: Swap + Tokens + Transactions - All on one line, compact size (Bridge hidden)
            <div className="flex items-center justify-between gap-1 flex-nowrap">
              <Link href="/trade" className="glass-card p-1.5 text-center hover:bg-white/10 transition-all flex-shrink-0 flex-1 min-w-0">
                <div className="flex justify-center mb-0.5">
                  <ArrowLeftRight className="w-2.5 h-2.5 text-green-500" />
                  </div>
                <p className="text-[8px] font-semibold leading-tight">Trade</p>
              </Link>

              <Link href="/tokens" className="glass-card p-1.5 text-center hover:bg-white/10 transition-all flex-shrink-0 flex-1 min-w-0">
                <div className="flex justify-center mb-0.5">
                  <Coins className="w-2.5 h-2.5 text-green-500" />
                </div>
                <p className="text-[8px] font-semibold leading-tight">Tokens</p>
              </Link>

              <Link href="/transactions" className="glass-card p-1.5 text-center hover:bg-white/10 transition-all flex-shrink-0 flex-1 min-w-0">
                <div className="flex justify-center mb-0.5">
                  <History className="w-2.5 h-2.5 text-green-500" />
                  </div>
                <p className="text-[8px] font-semibold leading-tight">Txs</p>
              </Link>

              <Link href="/rewards" className="glass-card p-1.5 text-center hover:bg-white/10 transition-all flex-shrink-0 flex-1 min-w-0">
                <div className="flex justify-center mb-0.5">
                  <Gift className="w-2.5 h-2.5 text-green-500" />
                  </div>
                <p className="text-[8px] font-semibold leading-tight">Rewards</p>
              </Link>
                </div>
            )}
        </div>

        {/* Token List */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="spinner"></div>
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400">Your Tokens</h3>
            {balances.map((token) => (
              <div key={token.symbol} className="glass-card p-4 flex items-center justify-between hover:bg-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <span className="text-green-500 font-bold text-sm">{token.symbol[0]}</span>
                  </div>
                  <div>
                    <p className="font-semibold">{token.name}</p>
                    <p className="text-xs text-gray-400">{token.symbol}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{Number.parseFloat(token.balance).toFixed(4)}</p>
                  {!token.isNative && !token.isBonded ? (
                    <p className="text-xs text-gray-500">Not Bonded</p>
                  ) : (
                  <p className="text-xs text-green-400">{displayCurrency.symbol}{token.usdValue}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Custom Token Modal (Dashboard, ETH) */}
      {showAddToken && chainId === 1 && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[999]">
          <div className="glass-card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Add Custom ETH Token</h2>
              <button
                onClick={() => {
                  setShowAddToken(false)
                  setCustomTokenAddress("")
                  setCustomTokenError("")
                  setCustomTokenInfo(null)
                }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Token Contract Address</label>
              <input
                type="text"
                value={customTokenAddress}
                onChange={(e) => {
                  setCustomTokenAddress(e.target.value)
                  setCustomTokenError("")
                  setCustomTokenInfo(null)
                }}
                placeholder="0x..."
                className="input-field"
              />
            </div>

            {customTokenError && <p className="text-xs text-red-400">{customTokenError}</p>}

            {customTokenInfo && (
              <div className="glass-card p-3 border border-white/10 text-xs space-y-1">
                <p className="text-gray-300">
                  <span className="font-semibold">Symbol:</span> {customTokenInfo.symbol}
                </p>
                <p className="text-gray-300">
                  <span className="font-semibold">Name:</span> {customTokenInfo.name}
                </p>
                <p className="text-gray-300">
                  <span className="font-semibold">Decimals:</span> {customTokenInfo.decimals}
                </p>
                <p className="text-[11px] text-gray-500">
                  Confirm this matches the token details on your explorer before saving.
                </p>
              </div>
            )}

            <button
              onClick={async () => {
                try {
                  setCustomTokenError("")
                  if (!customTokenAddress.trim()) {
                    setCustomTokenError("Enter a token contract address")
                    return
                  }

                  const normalized = customTokenAddress.trim()

                  // Step 1: lookup token details via public RPC
                  if (!customTokenInfo) {
                    const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com")
                    const contract = new ethers.Contract(normalized, ERC20_ABI, provider)
                    const [symbol, name, decimals] = await Promise.all([
                      contract.symbol().catch(() => "???"),
                      contract.name().catch(() => "Unknown Token"),
                      contract.decimals(),
                    ])
                    setCustomTokenInfo({
                      address: normalized,
                      symbol,
                      name,
                      decimals: Number(decimals),
                    })
                    return
                  }

                  // Step 2: user confirms, so save token
                  addEthCustomToken(customTokenInfo.address)
                  setShowAddToken(false)
                  setCustomTokenAddress("")
                  setCustomTokenInfo(null)
                  await fetchBalances()
                } catch (err: any) {
                  setCustomTokenError(err.message || "Failed to add token")
                }
              }}
              className="w-full px-4 py-3 rounded-lg bg-green-500 text-black hover:bg-green-600 font-semibold transition-all text-sm"
            >
              {customTokenInfo ? "Confirm & Save Token" : "Lookup Token"}
            </button>

            <p className="text-[11px] text-gray-500">
              This token will be remembered locally and included in your ETH portfolio, tokens list and send list using
              only public RPC.
            </p>
          </div>
        </div>
      )}

      {/* Add Wallet Modal */}
      {showAddWallet && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">Add Wallet</h2>
              <button
                onClick={() => {
                  setShowAddWallet(false)
                  setAddWalletMode("menu")
                  setAddWalletError("")
                  setAddPassword("")
                  setAddSeedPhrase("")
                  setAddPrivateKey("")
                  setNewWalletName("")
                }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {addWalletMode === "menu" && (
              <div className="space-y-3">
                <button
                  onClick={() => setAddWalletMode("from-seed")}
                  className="w-full px-4 py-3 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 font-semibold transition-all text-sm"
                >
                  Create New PEPU VAULT WALLET (New Seed)
                </button>
                <button
                  onClick={() => setAddWalletMode("import-seed")}
                  className="w-full px-4 py-3 rounded-lg bg-white/10 text-gray-200 hover:bg-white/20 font-semibold transition-all text-sm"
                >
                  Import Seed Phrase
                </button>
                <button
                  onClick={() => setAddWalletMode("import-key")}
                  className="w-full px-4 py-3 rounded-lg bg-white/10 text-gray-200 hover:bg-white/20 font-semibold transition-all text-sm"
                >
                  Import Private Key
                </button>
                <p className="text-xs text-gray-400">
                  All wallets share the same 4-digit passcode. You&apos;ll be asked for it to add new wallets.
                </p>
              </div>
            )}

            {addWalletMode === "from-seed" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">PEPU VAULT WALLET Name (Optional)</label>
                  <input
                    type="text"
                    value={newWalletName}
                    onChange={(e) => setNewWalletName(e.target.value)}
                    placeholder="My New Wallet"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Existing 4-Digit PIN</label>
                  <input
                    type="password"
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                    maxLength={4}
                    placeholder="Enter your existing 4-digit PIN"
                    className="input-field"
                  />
                </div>
                {addWalletError && <p className="text-xs text-red-400">{addWalletError}</p>}
                <button
                  disabled={addWalletLoading}
                  onClick={async () => {
                    try {
                      setAddWalletError("")
                      if (!addPassword || addPassword.length !== 4) {
                        setAddWalletError("Please enter your 4-digit PIN")
                        return
                      }
                      setAddWalletLoading(true)
                      const newWallet = await createWallet(addPassword, newWalletName || undefined, chainId)
                      addWallet(newWallet)
                      // Auto-unlock so signing doesn't require /unlock
                      unlockWallet(addPassword)
                      setWallets(getWallets())
                      setCurrentWalletId(newWallet.id)
                      setCurrentWalletIdState(newWallet.id)
                      setShowAddWallet(false)
                      setAddWalletMode("menu")
                      setAddPassword("")
                      setNewWalletName("")
                      fetchBalances()
                    } catch (err: any) {
                      setAddWalletError(err.message || "Failed to create PEPU VAULT WALLET")
                    } finally {
                      setAddWalletLoading(false)
                    }
                  }}
                  className="w-full px-4 py-3 rounded-lg bg-green-500 text-black hover:bg-green-600 font-semibold transition-all disabled:opacity-50 text-sm"
                >
                  {addWalletLoading ? "Creating..." : "Create PEPU VAULT WALLET"}
                </button>
              </div>
            )}

            {addWalletMode === "import-seed" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">PEPU VAULT WALLET Name (Optional)</label>
                  <input
                    type="text"
                    value={newWalletName}
                    onChange={(e) => setNewWalletName(e.target.value)}
                    placeholder="My Imported PEPU VAULT WALLET"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Seed Phrase</label>
                  <textarea
                    value={addSeedPhrase}
                    onChange={(e) => setAddSeedPhrase(e.target.value)}
                    placeholder="Enter your 12 or 24 word seed phrase"
                    className="input-field min-h-[90px]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Existing 4-Digit PIN</label>
                  <input
                    type="password"
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                    maxLength={4}
                    placeholder="Enter your existing 4-digit PIN"
                    className="input-field"
                  />
                </div>
                {addWalletError && <p className="text-xs text-red-400">{addWalletError}</p>}
                <button
                  disabled={addWalletLoading}
                  onClick={async () => {
                    try {
                      setAddWalletError("")
                      if (!addSeedPhrase || !addPassword || addPassword.length !== 4) {
                        setAddWalletError("Enter seed phrase and your 4-digit PIN")
                        return
                      }
                      setAddWalletLoading(true)
                      const newWallet = await importWalletFromMnemonic(
                        addSeedPhrase.trim(),
                        addPassword,
                        newWalletName || "Imported PEPU VAULT WALLET",
                        chainId,
                      )
                      addWallet(newWallet)
                      // Auto-unlock so signing doesn't require /unlock
                      unlockWallet(addPassword)
                      setWallets(getWallets())
                      setCurrentWalletId(newWallet.id)
                      setCurrentWalletIdState(newWallet.id)
                      setShowAddWallet(false)
                      setAddWalletMode("menu")
                      setAddPassword("")
                      setAddSeedPhrase("")
                      setNewWalletName("")
                      fetchBalances()
                    } catch (err: any) {
                      setAddWalletError(err.message || "Failed to import seed phrase")
                    } finally {
                      setAddWalletLoading(false)
                    }
                  }}
                  className="w-full px-4 py-3 rounded-lg bg-green-500 text-black hover:bg-green-600 font-semibold transition-all disabled:opacity-50 text-sm"
                >
                  {addWalletLoading ? "Importing..." : "Import Seed Phrase"}
                </button>
              </div>
            )}

            {addWalletMode === "import-key" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">PEPU VAULT WALLET Name (Optional)</label>
                  <input
                    type="text"
                    value={newWalletName}
                    onChange={(e) => setNewWalletName(e.target.value)}
                    placeholder="My Imported PEPU VAULT WALLET"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Private Key</label>
                  <textarea
                    value={addPrivateKey}
                    onChange={(e) => setAddPrivateKey(e.target.value)}
                    placeholder="Enter your private key"
                    className="input-field min-h-[80px]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Existing 4-Digit PIN</label>
                  <input
                    type="password"
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                    maxLength={4}
                    placeholder="Enter your existing 4-digit PIN"
                    className="input-field"
                  />
                </div>
                {addWalletError && <p className="text-xs text-red-400">{addWalletError}</p>}
                <button
                  disabled={addWalletLoading}
                  onClick={async () => {
                    try {
                      setAddWalletError("")
                      if (!addPrivateKey || !addPassword || addPassword.length !== 4) {
                        setAddWalletError("Enter private key and your 4-digit PIN")
                        return
                      }
                      setAddWalletLoading(true)
                      const newWallet = await importWalletFromPrivateKey(
                        addPrivateKey.trim(),
                        addPassword,
                        newWalletName || "Imported PEPU VAULT WALLET",
                        chainId,
                      )
                      addWallet(newWallet)
                      // Auto-unlock so signing doesn't require /unlock
                      unlockWallet(addPassword)
                      setWallets(getWallets())
                      setCurrentWalletId(newWallet.id)
                      setCurrentWalletIdState(newWallet.id)
                      setShowAddWallet(false)
                      setAddWalletMode("menu")
                      setAddPassword("")
                      setAddPrivateKey("")
                      setNewWalletName("")
                      fetchBalances()
                    } catch (err: any) {
                      setAddWalletError(err.message || "Failed to import private key")
                    } finally {
                      setAddWalletLoading(false)
                    }
                  }}
                  className="w-full px-4 py-3 rounded-lg bg-green-500 text-black hover:bg-green-600 font-semibold transition-all disabled:opacity-50 text-sm"
                >
                  {addWalletLoading ? "Importing..." : "Import Private Key"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <BottomNav active="dashboard" />
    </div>
  )
}
