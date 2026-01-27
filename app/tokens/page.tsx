"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWallets, getWalletState, updateActivity, getCurrentWallet } from "@/lib/wallet"
import { getSavedEthCustomTokens, addEthCustomToken } from "@/lib/customTokens"
import { getNativeBalance, getProviderWithFallback } from "@/lib/rpc"
import { getAllEthTokenBalances } from "@/lib/ethTokens"
import { isTokenBlacklisted } from "@/lib/blacklist"
import { getUnchainedProvider } from "@/lib/provider"
import { Coins, Loader } from "lucide-react"
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

export default function TokensPage() {
  const router = useRouter()
  const [tokens, setTokens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [chainId, setChainId] = useState(() => {
    // Initialize from localStorage or default to PEPU
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
    // Check if wallet exists
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    // Sync chainId from localStorage (in case it changed on another page)
    const saved = localStorage.getItem("selected_chain")
    if (saved && Number(saved) !== chainId) {
      setChainId(Number(saved))
    }

    // Update provider chainId
    const provider = getUnchainedProvider()
    provider.setChainId(chainId)

    // No password required for viewing tokens
    updateActivity()
    fetchAllTokens()
  }, [router, chainId])

  const fetchAllTokens = async () => {
    setLoading(true)
    try {
      const wallets = getWallets()
      if (wallets.length === 0) {
        setLoading(false)
        return
      }

      const wallet = getCurrentWallet() || wallets[0]
      const allTokens: any[] = []

      // CRITICAL: Ensure correct chain - default to PEPU if not explicitly 1
      const currentChainId = chainId === 1 ? 1 : 97741
      
      // Get native balance
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
        // For ETH chain, use getAllEthTokenBalances to get all ERC20 tokens
        try {
          const ethTokens = await getAllEthTokenBalances(wallet.address)
        
          // Filter out blacklisted tokens and convert to Token format
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
        // For PEPU chain, scan for ERC20 tokens via transfer logs
        const provider = await getProviderWithFallback(currentChainId)

        const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        const currentBlock = await provider.getBlockNumber()
        const lookback = 10000
        const fromBlock = Math.max(0, currentBlock - lookback)

        try {
          const addressTopic = ethers.zeroPadValue(wallet.address, 32)

          const [logsFrom, logsTo] = await Promise.all([
            provider.getLogs({
              fromBlock,
              toBlock: "latest",
              topics: [transferTopic, addressTopic],
            }),
            provider.getLogs({
              fromBlock,
              toBlock: "latest",
              topics: [transferTopic, null, addressTopic],
            }),
          ])

          const logs = [...logsFrom, ...logsTo]
          let tokenAddresses = [...new Set(logs.map((log) => log.address.toLowerCase()))]

          // Filter out blacklisted tokens
          const filteredTokenAddresses = tokenAddresses.filter(
            (addr) => !isTokenBlacklisted(addr, currentChainId)
          )

          for (const tokenAddress of filteredTokenAddresses) {
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

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Header */}
      <div className="glass-card rounded-none p-6 border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <Coins className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Tokens</h1>
              <p className="text-sm text-gray-400">Your token portfolio</p>
            </div>
          </div>
          <Link href="/dashboard" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            ✕
          </Link>
        </div>
      </div>

      {/* Chain Selector */}
      <div className="max-w-6xl mx-auto px-4 mt-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <p className="text-sm text-gray-400 mb-3">Network</p>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => {
                  const newChainId = 1
                  setChainId(newChainId)
                  localStorage.setItem("selected_chain", newChainId.toString())
                  const provider = getUnchainedProvider()
                  provider.setChainId(newChainId)
                }}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  chainId === 1 ? "bg-green-500 text-black" : "bg-white/10 text-gray-400 hover:bg-white/20"
                }`}
              >
                Ethereum
              </button>
              <button
                onClick={() => {
                  const newChainId = 97741
                  setChainId(newChainId)
                  localStorage.setItem("selected_chain", newChainId.toString())
                  const provider = getUnchainedProvider()
                  provider.setChainId(newChainId)
                }}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  chainId === 97741 ? "bg-green-500 text-black" : "bg-white/10 text-gray-400 hover:bg-white/20"
                }`}
              >
                PEPU
              </button>
            </div>
          </div>

          {chainId === 1 && (
            <button
              onClick={() => {
                setShowAddToken(true)
                setCustomAddress("")
                setCustomError("")
              }}
              className="self-start px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 text-sm font-semibold transition-all"
            >
              + Add Custom ETH Token
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader className="w-8 h-8 animate-spin text-green-500" />
              <p className="text-gray-400">Loading tokens...</p>
            </div>
          </div>
        ) : tokens.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Coins className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Tokens Found</h3>
            <p className="text-gray-400">You don't have any tokens on this network yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map((token) => (
              <div
                key={token.address}
                onClick={() => {
                  if (chainId === 97741) {
                    setSelectedToken(token)
                    setShowTokenModal(true)
                  }
                }}
                className={`glass-card p-4 flex items-center justify-between transition-all w-full ${
                  chainId === 97741 ? "cursor-pointer hover:bg-white/10" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                    <span className="font-bold text-green-500">{token.symbol[0]}</span>
                  </div>
                  <div>
                    <p className="font-semibold">{token.name}</p>
                    <p className="text-xs text-gray-400">{token.symbol}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{Number.parseFloat(token.balance).toFixed(4)}</p>
                  <p className="text-xs text-gray-400">{token.symbol}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="tokens" />

      {/* Token Details Modal - Only for PEPU chain */}
      {selectedToken && chainId === 97741 && (
        <TokenDetailsModal
          tokenAddress={selectedToken.address}
          tokenSymbol={selectedToken.symbol}
          tokenName={selectedToken.name}
          tokenDecimals={selectedToken.decimals}
          isOpen={showTokenModal}
          onClose={() => {
            setShowTokenModal(false)
            setSelectedToken(null)
          }}
          chainId={chainId}
        />
      )}

      {/* Add Custom Token Modal */}
      {showAddToken && chainId === 1 && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Add Custom ETH Token</h2>
              <button
                onClick={() => {
                  setShowAddToken(false)
                  setCustomAddress("")
                  setCustomError("")
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
                value={customAddress}
                onChange={(e) => {
                  setCustomAddress(e.target.value)
                  setCustomError("")
                }}
                placeholder="0x..."
                className="input-field"
              />
            </div>

            {customError && <p className="text-xs text-red-400">{customError}</p>}

            <button
              onClick={async () => {
                try {
                  setCustomError("")
                  if (!customAddress.trim()) {
                    setCustomError("Enter a token contract address")
                    return
                  }
                  addEthCustomToken(customAddress)
                  setShowAddToken(false)
                  setCustomAddress("")
                  await fetchAllTokens()
                } catch (err: any) {
                  setCustomError(err.message || "Failed to add token")
                }
              }}
              className="w-full px-4 py-3 rounded-lg bg-green-500 text-black hover:bg-green-600 font-semibold transition-all text-sm"
            >
              Save Token
            </button>

            <p className="text-[11px] text-gray-500">
              This token will be remembered locally and included in your ETH balances and send list, using only public
              RPC.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
