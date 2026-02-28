"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWallets, getWalletState, updateActivity, getCurrentWallet } from "@/lib/wallet"
import { getSavedEthCustomTokens, addEthCustomToken } from "@/lib/customTokens"
import { getNativeBalance, getProviderWithFallback } from "@/lib/rpc"
import { getAllEthTokenBalances } from "@/lib/ethTokens"
import { isTokenBlacklisted } from "@/lib/blacklist"
import { getUnchainedProvider } from "@/lib/provider"
import { Coins, Loader, ArrowLeft, Plus, X, RefreshCw } from "lucide-react"
import Link from "next/link"
import BottomNav from "@/components/BottomNav"
import TokenDetailsModal from "@/components/TokenDetailsModal"
import { ethers } from "ethers"

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]

/* ── gradient token avatar ── */
const TAvatar = ({ symbol, size = 44 }: { symbol: string; size?: number }) => {
  const palette = [
    ["#00ff88", "#00cc6a"],
    ["#3b82f6", "#2563eb"],
    ["#8b5cf6", "#7c3aed"],
    ["#f59e0b", "#d97706"],
    ["#ec4899", "#db2777"],
  ]
  const [a, b] = palette[(symbol.charCodeAt(0) || 0) % palette.length]
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg,${a},${b})`,
        fontSize: size * 0.38,
        color: "#fff",
      }}
    >
      {(symbol[0] || "?").toUpperCase()}
    </div>
  )
}

/* ── skeleton row ── */
const SkeletonRow = () => (
  <div className="flex items-center gap-3 px-4 py-3 rounded-2xl animate-pulse" style={{ background: "#1a1d2e" }}>
    <div className="w-11 h-11 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
    <div className="flex-1 space-y-2">
      <div className="h-3 rounded-full w-28" style={{ background: "rgba(255,255,255,0.08)" }} />
      <div className="h-2.5 rounded-full w-16" style={{ background: "rgba(255,255,255,0.05)" }} />
    </div>
    <div className="space-y-2 text-right">
      <div className="h-3 rounded-full w-16" style={{ background: "rgba(255,255,255,0.08)" }} />
      <div className="h-2.5 rounded-full w-10" style={{ background: "rgba(255,255,255,0.05)" }} />
    </div>
  </div>
)

export default function TokensPage() {
  const router = useRouter()
  const [tokens, setTokens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [chainId, setChainId] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selected_chain")
      return saved ? Number(saved) : 97741
    }
    return 97741
  })
  const [selectedToken, setSelectedToken] = useState<any>(null)
  const [showTokenModal, setShowTokenModal] = useState(false)
  const [showAddToken, setShowAddToken] = useState(false)
  const [customAddress, setCustomAddress] = useState("")
  const [customError, setCustomError] = useState("")

  useEffect(() => {
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }
    const saved = localStorage.getItem("selected_chain")
    if (saved && Number(saved) !== chainId) {
      setChainId(Number(saved))
    }
    const provider = getUnchainedProvider()
    provider.setChainId(chainId)
    updateActivity()
    fetchAllTokens()
  }, [router, chainId])

  const fetchAllTokens = async () => {
    setLoading(true)
    try {
      const wallets = getWallets()
      if (wallets.length === 0) { setLoading(false); return }
      const wallet = getCurrentWallet() || wallets[0]
      const allTokens: any[] = []
      const currentChainId = chainId === 1 ? 1 : 97741

      const nativeBalance = await getNativeBalance(wallet.address, currentChainId)
      const nativeSymbol = currentChainId === 1 ? "ETH" : "PEPU"
      allTokens.push({
        address: "0x0000000000000000000000000000000000000000",
        name: nativeSymbol,
        symbol: nativeSymbol,
        decimals: 18,
        balance: nativeBalance,
        isNative: true,
      })

      if (currentChainId === 1) {
        try {
          const ethTokens = await getAllEthTokenBalances(wallet.address)
          for (const ethToken of ethTokens) {
            if (!isTokenBlacklisted(ethToken.address, currentChainId)) {
              allTokens.push({
                address: ethToken.address,
                name: ethToken.name,
                symbol: ethToken.symbol,
                decimals: ethToken.decimals,
                balance: ethToken.balanceFormatted,
                isNative: false,
              })
            }
          }
        } catch (error) {
          console.error("Error loading ETH tokens:", error)
        }
      } else if (currentChainId === 97741) {
        const provider = await getProviderWithFallback(currentChainId)
        const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        const currentBlock = await provider.getBlockNumber()
        const lookback = 10000
        const fromBlock = Math.max(0, currentBlock - lookback)
        try {
          const addressTopic = ethers.zeroPadValue(wallet.address, 32)
          const [logsFrom, logsTo] = await Promise.all([
            provider.getLogs({ fromBlock, toBlock: "latest", topics: [transferTopic, addressTopic] }),
            provider.getLogs({ fromBlock, toBlock: "latest", topics: [transferTopic, null, addressTopic] }),
          ])
          const logs = [...logsFrom, ...logsTo]
          const tokenAddresses = [...new Set(logs.map((log) => log.address.toLowerCase()))].filter(
            (addr) => !isTokenBlacklisted(addr, currentChainId)
          )
          for (const tokenAddress of tokenAddresses) {
            try {
              const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
              const [balance, decimals, symbol, name] = await Promise.all([
                contract.balanceOf(wallet.address),
                contract.decimals(),
                contract.symbol().catch(() => "???"),
                contract.name().catch(() => "Unknown Token"),
              ])
              const balanceFormatted = ethers.formatUnits(balance, decimals)
              if (Number.parseFloat(balanceFormatted) > 0) {
                allTokens.push({
                  address: tokenAddress,
                  name,
                  symbol,
                  decimals: Number(decimals),
                  balance: balanceFormatted,
                  isNative: false,
                })
              }
            } catch (error) {
              console.error(`Error fetching token ${tokenAddress}:`, error)
            }
          }
        } catch (error) {
          console.error("Error scanning for tokens:", error)
        }
      }

      setTokens(allTokens)
    } catch (error) {
      console.error("Error fetching tokens:", error)
    } finally {
      setLoading(false)
    }
  }

  const switchChain = (id: number) => {
    setChainId(id)
    localStorage.setItem("selected_chain", id.toString())
    const provider = getUnchainedProvider()
    provider.setChainId(id)
  }

  return (
    <div className="min-h-screen pb-28 text-white" style={{ background: "#13141a" }}>

      {/* ── Header ── */}
      <div
        className="sticky top-0 z-40 flex items-center gap-3 px-5 py-4"
        style={{ background: "rgba(19,20,26,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Link
          href="/dashboard"
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 btn-icon"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-bold">Tokens</h1>
          <p className="text-xs" style={{ color: "#6b7280" }}>Your token portfolio</p>
        </div>
        <button
          onClick={fetchAllTokens}
          disabled={loading}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all btn-icon"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} style={{ color: "#9ca3af" }} />
        </button>
      </div>

      <div className="w-full px-4 sm:px-6 pt-5 space-y-4">

        {/* ── Network toggle ── */}
        <div
          className="flex rounded-2xl p-1 gap-1"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {[{ id: 1, label: "Ethereum", color: "#627eea" }, { id: 97741, label: "PEPU Chain", color: "#00ff88" }].map((n) => (
            <button
              key={n.id}
              onClick={() => switchChain(n.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={
                chainId === n.id
                  ? { background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.1)", color: n.color }
                  : { color: "#6b7280" }
              }
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: n.color }} />
              {n.label}
            </button>
          ))}
        </div>

        {/* ── Add custom token (ETH only) ── */}
        {chainId === 1 && (
          <button
            onClick={() => { setShowAddToken(true); setCustomAddress(""); setCustomError("") }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all"
            style={{ background: "rgba(0,255,136,0.12)", border: "1px solid rgba(0,255,136,0.25)", color: "#00ff88", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}
          >
            <Plus className="w-4 h-4" />
            Add Custom ETH Token
          </button>
        )}

        {/* ── Token list ── */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : tokens.length === 0 ? (
          <div
            className="flex flex-col items-center py-16 gap-3"
            style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 24 }}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
              <Coins className="w-7 h-7" style={{ color: "#374151" }} />
            </div>
            <p className="font-semibold" style={{ color: "#9ca3af" }}>No tokens found</p>
            <p className="text-sm text-center px-6" style={{ color: "#4b5563" }}>
              You don't have any tokens on this network yet
            </p>
          </div>
        ) : (
          <div
            className="rounded-3xl overflow-hidden"
            style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {tokens.map((token, idx) => (
              <button
                key={token.address}
                onClick={() => {
                  if (chainId === 97741) {
                    setSelectedToken(token)
                    setShowTokenModal(true)
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 transition-all text-left"
                style={{
                  borderBottom: idx < tokens.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  cursor: chainId === 97741 ? "pointer" : "default",
                }}
              >
                <TAvatar symbol={token.symbol} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{token.name}</p>
                  <p className="text-xs" style={{ color: "#6b7280" }}>{token.symbol}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold">{Number.parseFloat(token.balance).toFixed(4)}</p>
                  <p className="text-xs" style={{ color: "#6b7280" }}>{token.symbol}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="tokens" />

      {/* ── Token details modal (PEPU only) ── */}
      {selectedToken && chainId === 97741 && (
        <TokenDetailsModal
          tokenAddress={selectedToken.address}
          tokenSymbol={selectedToken.symbol}
          tokenName={selectedToken.name}
          tokenDecimals={selectedToken.decimals}
          isOpen={showTokenModal}
          onClose={() => { setShowTokenModal(false); setSelectedToken(null) }}
          chainId={chainId}
        />
      )}

      {/* ── Add custom token modal ── */}
      {showAddToken && chainId === 1 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => { setShowAddToken(false); setCustomAddress(""); setCustomError("") }}
        >
          <div
            className="w-full max-w-lg rounded-3xl p-6 space-y-5 animate-modal-center"
            style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Add Custom ETH Token</h2>
              <button
                onClick={() => { setShowAddToken(false); setCustomAddress(""); setCustomError("") }}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold" style={{ color: "#6b7280" }}>Contract Address</label>
              <input
                type="text"
                value={customAddress}
                onChange={(e) => { setCustomAddress(e.target.value); setCustomError("") }}
                placeholder="0x…"
                className="input-field text-sm"
              />
              {customError && (
                <p className="text-xs" style={{ color: "#ef4444" }}>{customError}</p>
              )}
            </div>

            <button
              onClick={async () => {
                try {
                  setCustomError("")
                  if (!customAddress.trim()) { setCustomError("Enter a token contract address"); return }
                  addEthCustomToken(customAddress)
                  setShowAddToken(false)
                  setCustomAddress("")
                  await fetchAllTokens()
                } catch (err: any) {
                  setCustomError(err.message || "Failed to add token")
                }
              }}
              className="w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-95"
              style={{ background: "#00ff88", color: "#13141a" }}
            >
              Save Token
            </button>

            <p className="text-xs text-center" style={{ color: "#4b5563" }}>
              Token will be stored locally and shown in your ETH balance and send list.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
