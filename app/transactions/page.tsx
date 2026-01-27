"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWallets, updateActivity, getCurrentWallet } from "@/lib/wallet"
import { ExternalLink, ArrowLeft, Clock, Send, TrendingUp, Zap } from "lucide-react"
import Link from "next/link"
import BottomNav from "@/components/BottomNav"

interface Transaction {
  hash: string
  type: string
  fromToken?: string
  toToken?: string
  amountIn?: string
  amountOut?: string
  chainId: number
  timestamp: number
  explorerUrl?: string
}

export default function TransactionsPage() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [chainId, setChainId] = useState(97741)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if wallet exists
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    updateActivity()
    loadTransactions()
  }, [router, chainId])

  const loadTransactions = () => {
    try {
      const stored = localStorage.getItem("transaction_history")
      if (stored) {
        const allTxs: Transaction[] = JSON.parse(stored)
        // Filter by chain if needed, or show all
        const filtered = chainId ? allTxs.filter(tx => tx.chainId === chainId) : allTxs
        setTransactions(filtered.sort((a, b) => b.timestamp - a.timestamp))
      }
    } catch (error) {
      console.error("Error loading transactions:", error)
    } finally {
      setLoading(false)
    }
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "swap":
        return <TrendingUp className="w-5 h-5 text-green-500" />
      case "send":
        return <Send className="w-5 h-5 text-blue-500" />
      case "bridge":
        return <Zap className="w-5 h-5 text-purple-500" />
      default:
        return <Clock className="w-5 h-5 text-gray-500" />
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  const getExplorerUrl = (tx: Transaction) => {
    if (tx.explorerUrl) return tx.explorerUrl
    if (tx.chainId === 1) return `https://etherscan.io/tx/${tx.hash}`
    if (tx.chainId === 97741) return `https://pepuscan.com/tx/${tx.hash}`
    return `#`
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Header */}
      <div className="glass-card rounded-none p-6 border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Transactions</h1>
              <p className="text-sm text-gray-400">Your transaction history</p>
            </div>
          </div>
          <Link href="/dashboard" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            ✕
          </Link>
        </div>
      </div>

      {/* Chain Selector */}
      <div className="max-w-6xl mx-auto px-4 mt-6">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setChainId(1)}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              chainId === 1 ? "bg-green-500 text-black" : "bg-white/10 text-gray-400 hover:bg-white/20"
            }`}
          >
            Ethereum
          </button>
          <button
            onClick={() => setChainId(97741)}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              chainId === 97741 ? "bg-green-500 text-black" : "bg-white/10 text-gray-400 hover:bg-white/20"
            }`}
          >
            PEPU
          </button>
          <button
            onClick={() => setChainId(0)}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              chainId === 0 ? "bg-green-500 text-black" : "bg-white/10 text-gray-400 hover:bg-white/20"
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner"></div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Clock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Transactions</h3>
            <p className="text-gray-400">Your transaction history will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.hash}
                className="glass-card p-4 flex items-center justify-between hover:bg-white/10 transition-all"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    {getTransactionIcon(tx.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold capitalize">{tx.type}</p>
                      {tx.type === "swap" && tx.fromToken && tx.toToken && (
                        <span className="text-xs text-gray-400">
                          {tx.fromToken} → {tx.toToken}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <a
                        href={getExplorerUrl(tx)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-400 hover:text-green-300 font-mono truncate underline"
                      >
                        {getExplorerUrl(tx)}
                      </a>
                      <span className="text-xs text-gray-500">•</span>
                      <p className="text-xs text-gray-400">{formatDate(tx.timestamp)}</p>
                    </div>
                    {tx.amountIn && tx.amountOut && (
                      <p className="text-xs text-gray-500 mt-1">
                        {Number.parseFloat(tx.amountIn).toFixed(4)} → {Number.parseFloat(tx.amountOut).toFixed(4)}
                      </p>
                    )}
                  </div>
                </div>
                <a
                  href={getExplorerUrl(tx)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
                  title="View on Explorer"
                >
                  <ExternalLink className="w-5 h-5 text-green-500" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="dashboard" />
    </div>
  )
}

