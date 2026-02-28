"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
import {
  Send,
  Download,
  Network,
  ArrowLeftRight,
  ChevronDown,
  Copy,
  Check,
  RefreshCw,
  Plus,
  MoreHorizontal,
  Loader2,
  X,
  Wallet,
  Image,
} from "lucide-react"
import Link from "next/link"
import BottomNav from "@/components/BottomNav"
import RpcConnectionNotification from "@/components/RpcConnectionNotification"
import { ethers } from "ethers"

const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000"
const PEPU_NATIVE_LOGO_URL =
  "https://image2url.com/r2/default/images/1772259918647-f246f7c7-68cb-4498-8e96-7122e6f3fbd8.jpg"

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]

// Token avatar gradient colors based on symbol
function getTokenGradient(symbol: string) {
  const colors = [
    ["#00ff88", "#00cc6a"],
    ["#3b82f6", "#2563eb"],
    ["#8b5cf6", "#7c3aed"],
    ["#f59e0b", "#d97706"],
    ["#ec4899", "#db2777"],
    ["#14b8a6", "#0d9488"],
    ["#f97316", "#ea580c"],
  ]
  const idx = symbol.charCodeAt(0) % colors.length
  return colors[idx]
}

function TokenAvatar({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const [from, to] = getTokenGradient(symbol)
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        fontSize: size * 0.35,
      }}
    >
      {symbol[0]?.toUpperCase()}
    </div>
  )
}

function TokenIcon({
  symbol,
  size = 40,
  logoUrl,
}: {
  symbol: string
  size?: number
  logoUrl?: string | null
}) {
  const [from, to] = getTokenGradient(symbol)
  return (
    <div
      className="relative rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        fontSize: size * 0.35,
      }}
    >
      {symbol[0]?.toUpperCase()}
      {logoUrl && (
        <img
          src={logoUrl}
          alt={symbol}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none"
          }}
        />
      )}
    </div>
  )
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = items.slice()
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length) {
      const item = queue.shift()
      if (item === undefined) return
      await fn(item)
    }
  })
  await Promise.all(workers)
}

function ActionBtn({
  icon,
  label,
  href,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  href?: string
  onClick?: () => void
}) {
  const inner = (
    <div className="flex flex-col items-center gap-2">
      <div className="w-12 h-12 rounded-full bg-[#1a2a1a] border border-green-500/40 flex items-center justify-center text-[#00ff88] hover:bg-green-500/20 hover:border-green-400/60 transition-all active:scale-95 shadow-[0_2px_8px_rgba(0,0,0,0.25),0_1px_3px_rgba(0,255,136,0.08)]">
        {icon}
      </div>
      <span className="text-[11px] font-medium" style={{ color: "#d1d5db" }}>{label}</span>
    </div>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return <button onClick={onClick}>{inner}</button>
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0" />
      <div className="flex-1">
        <div className="h-3.5 bg-white/10 rounded w-24 mb-2" />
        <div className="h-2.5 bg-white/10 rounded w-16" />
      </div>
      <div className="text-right">
        <div className="h-3.5 bg-white/10 rounded w-16 mb-2" />
        <div className="h-2.5 bg-white/10 rounded w-12 ml-auto" />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [portfolioValue, setPortfolioValue] = useState("0.00")
  const [pepuPrice, setPepuPrice] = useState<number>(0)
  const [ethPrice, setEthPrice] = useState<number>(0)
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(getSavedCurrency())
  const [balances, setBalances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tokenLogos, setTokenLogos] = useState<Record<string, string>>({})
  const tokenLogosRef = useRef<Record<string, string>>({})
  const [walletDomains, setWalletDomains] = useState<Record<string, string>>({})
  const [chainId, setChainId] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selected_chain")
      const savedChainId = saved ? Number(saved) : 97741
      const validChainId = savedChainId === 1 || savedChainId === 97741 ? savedChainId : 97741
      if (validChainId !== 97741 || !saved) {
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
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<"tokens" | "nfts">("tokens")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showNetworkMenu, setShowNetworkMenu] = useState(false)

  useEffect(() => {
    tokenLogosRef.current = tokenLogos
  }, [tokenLogos])

  const hydrateTokenLogos = useCallback(async (tokens: any[], currentChainId: number) => {
    const network: "ethereum" | "pepe-unchained" = currentChainId === 1 ? "ethereum" : "pepe-unchained"
    const addresses = Array.from(
      new Set(
        tokens
          .filter((t) => !t?.isNative && typeof t?.address === "string" && ethers.isAddress(t.address))
          .map((t) => t.address.toLowerCase()),
      ),
    )

    const missing = addresses.filter((a) => !tokenLogosRef.current[a])
    if (missing.length === 0) return

    const updates: Record<string, string> = {}
    await mapLimit(missing, 6, async (addr) => {
      const data = await fetchGeckoTerminalData(addr, network)
      const url = data?.image_url || null
      if (url) updates[addr] = url
    })

    if (Object.keys(updates).length > 0) {
      setTokenLogos((prev) => ({ ...prev, ...updates }))
    }
  }, [])

  // Load VAULT Domains
  useEffect(() => {
    let isMounted = true
    const loadDomains = async () => {
      if (wallets.length === 0) return
      const domainMap: Record<string, string> = {}
      for (const wallet of wallets) {
        try {
          const domain = await getDomainByWallet(wallet.address)
          if (domain) domainMap[wallet.id] = domain
        } catch {}
      }
      if (isMounted) setWalletDomains(domainMap)
    }
    void loadDomains()
    return () => { isMounted = false }
  }, [wallets])

  useEffect(() => {
    const walletList = getWallets()
    if (walletList.length === 0) {
      router.push("/setup")
      return
    }

    const provider = getUnchainedProvider()
    const providerChainId = provider.getChainId()
    const validChainId = chainId === 1 || chainId === 97741 ? chainId : 97741
    const isInitialMount = !(window as any).__unchained_dashboard_mounted
    ;(window as any).__unchained_dashboard_mounted = true

    if (providerChainId !== 1 && providerChainId !== 97741) {
      provider.setChainId(97741)
      if (validChainId !== 97741) {
        setChainId(97741)
        localStorage.setItem("selected_chain", "97741")
        localStorage.setItem("unchained_chain_id", "97741")
      }
    } else if (isInitialMount && providerChainId !== validChainId) {
      provider.setChainId(validChainId)
    }

    updateActivity()
    setWallets(walletList)
    setCurrentWalletIdState(getCurrentWalletId())
    if (typeof window !== "undefined") setDisplayCurrency(getSavedCurrency())

    fetchBalances()

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "display_currency") {
        setDisplayCurrency(getSavedCurrency())
        fetchBalances()
      }
    }
    window.addEventListener("storage", handleStorageChange)

    let retryInterval: NodeJS.Timeout | null = null
    let healthCheckInterval: NodeJS.Timeout | null = null

    const setupRetryInterval = () => {
      if (retryInterval) clearInterval(retryInterval)
      const healthStatus = getRpcHealthStatus(chainId)
      const retryDelay = healthStatus.isHealthy ? 30000 : 5000
      retryInterval = setInterval(() => { fetchBalances() }, retryDelay)
    }

    setupRetryInterval()

    const unsubscribe = subscribeToRpcHealth((updatedChainId) => {
      if (updatedChainId === chainId) setupRetryInterval()
    })

    healthCheckInterval = setInterval(() => { setupRetryInterval() }, 10000)

    return () => {
      if (retryInterval) clearInterval(retryInterval)
      if (healthCheckInterval) clearInterval(healthCheckInterval)
      unsubscribe()
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [router, chainId, displayCurrency])

  useEffect(() => {
    if (typeof window !== "undefined") {
      const validChainId = chainId === 1 || chainId === 97741 ? chainId : 97741
      localStorage.setItem("selected_chain", validChainId.toString())
      localStorage.setItem("unchained_chain_id", validChainId.toString())
      const provider = getUnchainedProvider()
      if (provider.getChainId() !== validChainId) provider.setChainId(validChainId)
      if (validChainId !== chainId) setChainId(validChainId)
    }
  }, [chainId])

  const fetchBalances = async (isManualRefresh = false) => {
    // Always fetch fresh from blockchain — no cache
    setLoading(true)
    if (isManualRefresh) setIsRefreshing(true)

    try {
      const walletList = getWallets()
      if (walletList.length === 0) { setLoading(false); return }

      const wallet = getCurrentWallet() || walletList[0]
      const allBalances: any[] = []

      const currentChainId = chainId === 1 ? 1 : 97741
      if (currentChainId !== chainId) {
        setChainId(currentChainId)
        return
      }

      // Always fetch live balance from chain
      const balance = await getNativeBalance(wallet.address, currentChainId)
      const nativeSymbol = currentChainId === 1 ? "ETH" : "PEPU"

      let nativePrice = 0
      let nativeUsdValue = "0.00"
      const currencyCode = displayCurrency.code

      if (currentChainId === 1) {
        const price = await fetchEthPrice(currencyCode)
        setEthPrice(price)
        nativePrice = price
        nativeUsdValue = (Number.parseFloat(balance) * price).toFixed(2)
      } else {
        const price = await fetchPepuPrice(currencyCode)
        setPepuPrice(price)
        nativePrice = price
        nativeUsdValue = (Number.parseFloat(balance) * price).toFixed(2)
      }

      allBalances.push({
        address: NATIVE_TOKEN_ADDRESS,
        symbol: nativeSymbol,
        name: currentChainId === 1 ? "Ethereum" : "Pepe Unchained",
        balance,
        usdValue: nativeUsdValue,
        isNative: true,
        isBonded: nativePrice > 0,
      })

      if (currentChainId === 97741 || currentChainId === 1) {
        try {
          if (currentChainId === 1) {
            try {
              const ethTokens = await getAllEthTokenBalances(wallet.address)
              const filteredTokens = ethTokens.filter(
                (token) => !isTokenBlacklisted(token.address, chainId)
              )
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
                }
              }
            } catch (ethTokenError) {
              console.error("[Dashboard] Error fetching ETH tokens:", ethTokenError)
            }
          } else if (currentChainId === 97741) {
            const provider = await getProviderWithFallback(currentChainId)

            const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
            let currentBlock = 0
            try {
              currentBlock = await provider.getBlockNumber()
              reportRpcSuccess(currentChainId)
            } catch (error: any) {
              const errorMsg = error?.message || String(error) || "RPC connection failed"
              reportRpcError(currentChainId, errorMsg)
            }

            const lookback = 10000
            const fromBlock = Math.max(0, currentBlock - lookback)
            let tokenAddresses: string[] = []

            try {
              const addressTopic = ethers.zeroPadValue(wallet.address, 32)
              const [logsFrom, logsTo] = await Promise.all([
                provider.getLogs({ fromBlock, toBlock: "latest", topics: [transferTopic, addressTopic] }).catch(() => []),
                provider.getLogs({ fromBlock, toBlock: "latest", topics: [transferTopic, null, addressTopic] }).catch(() => []),
              ])
              const allLogs = [...logsFrom, ...logsTo]
              tokenAddresses = [...new Set(allLogs.map((log) => log.address.toLowerCase()))]
            } catch (error) {
              console.error("Error fetching transfer logs:", error)
            }

            const filteredTokenAddresses = tokenAddresses.filter(
              (addr) => !isTokenBlacklisted(addr, currentChainId)
            )

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

                try {
                  const quoterPrice = await getPepuTokenPriceFromQuoter(tokenAddress, dec)
                  if (quoterPrice !== null && quoterPrice > 0) {
                    priceUsd = quoterPrice
                    isBonded = true
                  }
                } catch {}

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
              } catch {
                return null
              }
            })

            const tokenResults = await Promise.all(tokenPromises)
            const validTokens = tokenResults.filter((token) => token !== null)
            allBalances.push(...validTokens)
          }
        } catch (error: any) {
          console.error("Error scanning for tokens:", error)
          const errorMessage = error?.message || String(error) || "Unknown error"
          if (errorMessage.includes("RPC") || errorMessage.includes("connection") || errorMessage.includes("fetch") || errorMessage.includes("network")) {
            reportRpcError(chainId, errorMessage)
          }
        }
      }

      const totalValue = allBalances.reduce((sum, token) => {
        if (token.isNative) return sum + (nativePrice > 0 ? Number.parseFloat(token.usdValue) : 0)
        else return sum + (token.isBonded ? Number.parseFloat(token.usdValue) : 0)
      }, 0)

      setBalances(allBalances)
      setPortfolioValue(totalValue.toFixed(2))
      void hydrateTokenLogos(allBalances, currentChainId)
      reportRpcSuccess(chainId)
    } catch (error: any) {
      console.error("Error fetching balances:", error)
      const errorMessage = error?.message || String(error) || "Unknown error"
      if (errorMessage.includes("RPC") || errorMessage.includes("connection") || errorMessage.includes("fetch") || errorMessage.includes("network")) {
        reportRpcError(chainId, errorMessage)
      }
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  const copyAddress = () => {
    const wallet = wallets.find((w) => w.id === currentWalletId) || wallets[0]
    if (!wallet) return
    navigator.clipboard.writeText(wallet.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const activeWallet = wallets.find((w) => w.id === currentWalletId) || wallets[0]
  const activeWalletName = walletDomains[activeWallet?.id || ""] || activeWallet?.name || "My Wallet"
  const activeAddress = activeWallet?.address || ""

  return (
    <div
      className="min-h-screen text-white pb-24 relative flex flex-col"
      style={{ background: "#13141a" }}
      onClick={() => {
        if (showWalletMenu) setShowWalletMenu(false)
        if (showNetworkMenu) setShowNetworkMenu(false)
      }}
    >
      <RpcConnectionNotification chainId={chainId} />

      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-5 pb-3">
        {/* Network selector */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowNetworkMenu((p) => !p) }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all"
            style={{ background: "#1e2130", borderColor: "rgba(255,255,255,0.12)", color: "#d1d5db" }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: chainId === 1 ? "#627eea" : "#00ff88" }}
            />
            {chainId === 1 ? "Ethereum" : "PEPU"}
            <ChevronDown className="w-3 h-3" />
          </button>

          {showNetworkMenu && (
            <div
              className="absolute top-full mt-1.5 left-0 w-44 rounded-2xl border overflow-hidden z-50 shadow-2xl"
              style={{ background: "#1a1d2e", borderColor: "rgba(255,255,255,0.1)" }}
            >
              {[{ id: 97741, label: "PEPU Chain", color: "#00ff88" }, { id: 1, label: "Ethereum", color: "#627eea" }].map(
                (net) => (
                  <button
                    key={net.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowNetworkMenu(false)
                      if (net.id !== chainId) {
                        setChainId(net.id)
                        setBalances([])
                        setPortfolioValue("0.00")
                        setLoading(true)
                        localStorage.setItem("selected_chain", net.id.toString())
                        localStorage.setItem("unchained_chain_id", net.id.toString())
                        const provider = getUnchainedProvider()
                        provider.setChainId(net.id)
                      }
                    }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left hover:bg-white/5 transition-colors"
                    style={{ color: net.id === chainId ? net.color : "#9ca3af" }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: net.color }} />
                    {net.label}
                    {net.id === chainId && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* Wallet avatar + switcher */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowWalletMenu((p) => !p) }}
            className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-white/5 transition-colors"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-[#13141a] flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #00ff88, #00cc6a)" }}
            >
              {activeWalletName[0]?.toUpperCase() || "W"}
            </div>
            <span className="text-xs font-medium text-gray-300 max-w-[80px] truncate hidden sm:block">
              {activeWalletName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {showWalletMenu && (
            <div
              className="absolute top-full right-0 mt-1.5 w-60 rounded-2xl border overflow-hidden z-50 shadow-2xl"
              style={{ background: "#1a1d2e", borderColor: "rgba(255,255,255,0.1)" }}
            >
              <div className="px-4 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider">My Wallets</p>
              </div>
              {wallets.map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCurrentWalletId(wallet.id)
                    setCurrentWalletIdState(wallet.id)
                    setShowWalletMenu(false)
                    fetchBalances()
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-[#13141a] flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #00ff88, #00cc6a)" }}
                  >
                    {(walletDomains[wallet.id] || wallet.name || "W")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {walletDomains[wallet.id] || wallet.name || "Wallet"}
                    </p>
                    <p className="text-[11px] font-mono text-gray-500">
                      {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                    </p>
                  </div>
                  {wallet.id === currentWalletId && (
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  )}
                </button>
              ))}
              <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowAddWallet(true)
                    setAddWalletMode("menu")
                    setAddWalletError("")
                    setShowWalletMenu(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-green-400 hover:bg-green-500/5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add / Import Wallet
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ACCOUNT IDENTITY ── */}
      <div className="flex flex-col items-center px-4 pt-2 pb-0">
        {/* Address pill */}
        <button
          onClick={copyAddress}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-mono transition-all hover:bg-white/10 active:scale-95"
          style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#d1d5db", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}
        >
          {activeAddress
            ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}`
            : "No wallet"}
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* ── PORTFOLIO VALUE ── */}
      <div className="flex flex-col items-center px-4 py-8">
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-7 h-7 text-green-400 animate-spin" />
            <p className="text-sm text-gray-500">Fetching from blockchain…</p>
          </div>
        ) : (
          <>
            <h1 className="text-5xl font-bold tracking-tight text-white">
              {displayCurrency.symbol}
              {portfolioValue}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              {chainId === 97741 && pepuPrice > 0 && (
                <p className="text-xs text-gray-500">
                  PEPU {displayCurrency.symbol}{pepuPrice.toFixed(8)}
                </p>
              )}
              {chainId === 1 && ethPrice > 0 && (
                <p className="text-xs text-gray-500">
                  ETH {displayCurrency.symbol}{ethPrice.toFixed(2)}
                </p>
              )}
              <button
                onClick={() => fetchBalances(true)}
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-green-400 transition-colors"
                disabled={loading}
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
                Live
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── ACTION BUTTONS (no nav-bar items: Send, Tokens, Rewards, Settings) ── */}
      <div className="flex items-center justify-around px-6 pb-6">
        <ActionBtn icon={<Download className="w-5 h-5" />} label="Receive" href="/receive" />
        {chainId === 97741 && (
          <>
            <ActionBtn icon={<ArrowLeftRight className="w-5 h-5" />} label="Swap" href="/trade" />
            <ActionBtn icon={<Network className="w-5 h-5" />} label="History" href="/transactions" />
          </>
        )}
        {chainId === 1 && (
          <ActionBtn
            icon={<Plus className="w-5 h-5" />}
            label="Token"
            onClick={() => {
              setShowAddToken(true)
              setCustomTokenAddress("")
              setCustomTokenError("")
            }}
          />
        )}
      </div>

      {/* ── DIVIDER ── */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

      {/* ── TABS ── */}
      <div className="flex" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {(["tokens", "nfts"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-3.5 text-sm font-semibold capitalize transition-colors relative"
            style={{ color: activeTab === tab ? "#00ff88" : "#6b7280" }}
          >
            {tab === "tokens" ? "Tokens" : "NFTs"}
            {activeTab === tab && (
              <span
                className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full"
                style={{ background: "#00ff88" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── TOKEN LIST ── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "tokens" && (
          <>
            {loading ? (
              <div className="space-y-0.5 pt-2">
                {[1, 2, 3].map((i) => <SkeletonRow key={i} />)}
              </div>
            ) : balances.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <Wallet className="w-8 h-8" style={{ color: "#6b7280" }} />
                </div>
                <p className="text-gray-400 text-sm">No tokens found</p>
                <p className="text-gray-600 text-xs mt-1">Your balances will appear here</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                {balances.map((token, i) => (
                  <div
                    key={`${token.symbol}-${i}`}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/3 transition-colors cursor-pointer active:bg-white/5"
                  >
                    <TokenIcon
                      symbol={token.symbol}
                      size={42}
                      logoUrl={
                        token?.address?.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase() && token?.symbol === "PEPU"
                          ? PEPU_NATIVE_LOGO_URL
                          : token?.address
                            ? tokenLogos[String(token.address).toLowerCase()] || null
                            : null
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{token.name}</p>
                      <p className="text-xs text-gray-500">{token.symbol}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-white">
                        {Number.parseFloat(token.balance).toFixed(4)}
                      </p>
                      {!token.isNative && !token.isBonded ? (
                        <p className="text-xs" style={{ color: "#4b5563" }}>
                          No price
                        </p>
                      ) : (
                        <p className="text-xs" style={{ color: "#00ff88" }}>
                          {displayCurrency.symbol}{token.usdValue}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "nfts" && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <Image className="w-8 h-8" style={{ color: "#6b7280" }} />
            </div>
            <p className="text-gray-400 text-sm">NFT Gallery</p>
            <Link
              href="/nfts"
              className="mt-3 text-xs font-semibold px-4 py-2 rounded-full transition-colors"
              style={{ background: "rgba(0,255,136,0.12)", color: "#00ff88" }}
            >
              View NFTs
            </Link>
          </div>
        )}
      </div>

      {/* ── ADD CUSTOM TOKEN MODAL (ETH) ── */}
      {showAddToken && chainId === 1 && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div
            className="w-full max-w-lg rounded-3xl p-6 space-y-4 animate-modal-center"
            style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Add Custom Token</h2>
              <button
                onClick={() => { setShowAddToken(false); setCustomTokenAddress(""); setCustomTokenError(""); setCustomTokenInfo(null) }}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Contract Address</label>
              <input
                type="text"
                value={customTokenAddress}
                onChange={(e) => { setCustomTokenAddress(e.target.value); setCustomTokenError(""); setCustomTokenInfo(null) }}
                placeholder="0x..."
                className="input-field text-sm"
              />
            </div>

            {customTokenError && <p className="text-xs text-red-400">{customTokenError}</p>}

            {customTokenInfo && (
              <div
                className="rounded-xl p-3 text-xs space-y-1.5"
                style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.15)" }}
              >
                <p className="text-gray-300"><span className="font-semibold text-white">Symbol:</span> {customTokenInfo.symbol}</p>
                <p className="text-gray-300"><span className="font-semibold text-white">Name:</span> {customTokenInfo.name}</p>
                <p className="text-gray-300"><span className="font-semibold text-white">Decimals:</span> {customTokenInfo.decimals}</p>
              </div>
            )}

            <button
              onClick={async () => {
                try {
                  setCustomTokenError("")
                  if (!customTokenAddress.trim()) { setCustomTokenError("Enter a contract address"); return }
                  const normalized = customTokenAddress.trim()
                  if (!customTokenInfo) {
                    const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com")
                    const contract = new ethers.Contract(normalized, ERC20_ABI, provider)
                    const [symbol, name, decimals] = await Promise.all([
                      contract.symbol().catch(() => "???"),
                      contract.name().catch(() => "Unknown Token"),
                      contract.decimals(),
                    ])
                    setCustomTokenInfo({ address: normalized, symbol, name, decimals: Number(decimals) })
                    return
                  }
                  addEthCustomToken(customTokenInfo.address)
                  setShowAddToken(false)
                  setCustomTokenAddress("")
                  setCustomTokenInfo(null)
                  await fetchBalances()
                } catch (err: any) {
                  setCustomTokenError(err.message || "Failed to add token")
                }
              }}
              className="w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
              style={{ background: "#00ff88", color: "#13141a" }}
            >
              {customTokenInfo ? "Confirm & Save Token" : "Look Up Token"}
            </button>
          </div>
        </div>
      )}

      {/* ── ADD WALLET MODAL ── */}
      {showAddWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div
            className="w-full max-w-lg rounded-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto animate-modal-center"
            style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold">
                {addWalletMode === "menu" ? "Add Wallet" : addWalletMode === "from-seed" ? "Create New Wallet" : addWalletMode === "import-seed" ? "Import Seed Phrase" : "Import Private Key"}
              </h2>
              <button
                onClick={() => { setShowAddWallet(false); setAddWalletMode("menu"); setAddWalletError(""); setAddPassword(""); setAddSeedPhrase(""); setAddPrivateKey(""); setNewWalletName("") }}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addWalletMode === "menu" && (
              <div className="space-y-2.5">
                {[
                  { mode: "from-seed" as const, label: "Create New Wallet", sub: "Generate a brand-new wallet", primary: true },
                  { mode: "import-seed" as const, label: "Import Seed Phrase", sub: "Restore with 12/24-word phrase", primary: false },
                  { mode: "import-key" as const, label: "Import Private Key", sub: "Use an existing private key", primary: false },
                ].map((opt) => (
                  <button
                    key={opt.mode}
                    onClick={() => setAddWalletMode(opt.mode)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all"
                    style={opt.primary
                      ? { background: "rgba(0,255,136,0.12)", border: "1px solid rgba(0,255,136,0.25)", color: "#00ff88" }
                      : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#d1d5db" }}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-xs opacity-60 mt-0.5">{opt.sub}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 rotate-[-90deg] opacity-50" />
                  </button>
                ))}
                <p className="text-xs text-gray-500 pt-1">All wallets share the same 4-digit PIN.</p>
              </div>
            )}

            {addWalletMode === "from-seed" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium">Wallet Name (Optional)</label>
                  <input type="text" value={newWalletName} onChange={(e) => setNewWalletName(e.target.value)} placeholder="My New Wallet" className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium">4-Digit PIN</label>
                  <input type="password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} maxLength={4} placeholder="Enter PIN" className="input-field text-sm" />
                </div>
                {addWalletError && <p className="text-xs text-red-400">{addWalletError}</p>}
                <button
                  disabled={addWalletLoading}
                  onClick={async () => {
                    try {
                      setAddWalletError("")
                      if (!addPassword || addPassword.length !== 4) { setAddWalletError("Please enter your 4-digit PIN"); return }
                      setAddWalletLoading(true)
                      const newWallet = await createWallet(addPassword, newWalletName || undefined, chainId)
                      addWallet(newWallet)
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
                      setAddWalletError(err.message || "Failed to create wallet")
                    } finally {
                      setAddWalletLoading(false)
                    }
                  }}
                  className="w-full py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-all active:scale-95"
                  style={{ background: "#00ff88", color: "#13141a" }}
                >
                  {addWalletLoading ? "Creating…" : "Create Wallet"}
                </button>
              </div>
            )}

            {addWalletMode === "import-seed" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium">Wallet Name (Optional)</label>
                  <input type="text" value={newWalletName} onChange={(e) => setNewWalletName(e.target.value)} placeholder="My Imported Wallet" className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium">Seed Phrase</label>
                  <textarea value={addSeedPhrase} onChange={(e) => setAddSeedPhrase(e.target.value)} placeholder="Enter 12 or 24 word seed phrase…" className="input-field min-h-[90px] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium">4-Digit PIN</label>
                  <input type="password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} maxLength={4} placeholder="Enter PIN" className="input-field text-sm" />
                </div>
                {addWalletError && <p className="text-xs text-red-400">{addWalletError}</p>}
                <button
                  disabled={addWalletLoading}
                  onClick={async () => {
                    try {
                      setAddWalletError("")
                      if (!addSeedPhrase || !addPassword || addPassword.length !== 4) { setAddWalletError("Enter seed phrase and PIN"); return }
                      setAddWalletLoading(true)
                      const newWallet = await importWalletFromMnemonic(addSeedPhrase.trim(), addPassword, newWalletName || "Imported Wallet", chainId)
                      addWallet(newWallet)
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
                  className="w-full py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-all active:scale-95"
                  style={{ background: "#00ff88", color: "#13141a" }}
                >
                  {addWalletLoading ? "Importing…" : "Import Seed Phrase"}
                </button>
              </div>
            )}

            {addWalletMode === "import-key" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium">Wallet Name (Optional)</label>
                  <input type="text" value={newWalletName} onChange={(e) => setNewWalletName(e.target.value)} placeholder="My Imported Wallet" className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium">Private Key</label>
                  <textarea value={addPrivateKey} onChange={(e) => setAddPrivateKey(e.target.value)} placeholder="Enter private key…" className="input-field min-h-[80px] text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 font-medium">4-Digit PIN</label>
                  <input type="password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} maxLength={4} placeholder="Enter PIN" className="input-field text-sm" />
                </div>
                {addWalletError && <p className="text-xs text-red-400">{addWalletError}</p>}
                <button
                  disabled={addWalletLoading}
                  onClick={async () => {
                    try {
                      setAddWalletError("")
                      if (!addPrivateKey || !addPassword || addPassword.length !== 4) { setAddWalletError("Enter private key and PIN"); return }
                      setAddWalletLoading(true)
                      const newWallet = await importWalletFromPrivateKey(addPrivateKey.trim(), addPassword, newWalletName || "Imported Wallet", chainId)
                      addWallet(newWallet)
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
                  className="w-full py-3 rounded-2xl font-bold text-sm disabled:opacity-50 transition-all active:scale-95"
                  style={{ background: "#00ff88", color: "#13141a" }}
                >
                  {addWalletLoading ? "Importing…" : "Import Private Key"}
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
