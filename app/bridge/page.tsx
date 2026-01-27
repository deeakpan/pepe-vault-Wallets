"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWallets, getWalletState, updateActivity, getCurrentWallet, getCurrentWalletId } from "@/lib/wallet"
import { getNativeBalance } from "@/lib/rpc"
import { getFeePercentage, executeBridge, getPoolBalance } from "@/lib/bridge"
import { MAX_BRIDGE_POOL } from "@/lib/config"
import { Zap, Loader } from "lucide-react"
import BottomNav from "@/components/BottomNav"
import TransactionNotification from "@/components/TransactionNotification"

export default function BridgePage() {
  const router = useRouter()
  const [amount, setAmount] = useState("")
  const [balance, setBalance] = useState("0")
  const [poolBalance, setPoolBalance] = useState("0")
  const [feePercentage, setFeePercentage] = useState(0.05)
  const [loading, setLoading] = useState(false)
  const [loadingPool, setLoadingPool] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [txHash, setTxHash] = useState<string | null>(null)
  const [successTx, setSuccessTx] = useState<{
    original: string
    received: string
    hash: string
  } | null>(null)
  const [showNotification, setShowNotification] = useState(false)
  const [notificationData, setNotificationData] = useState<{ message: string; txHash?: string; explorerUrl?: string } | null>(null)

  useEffect(() => {
    // Check if wallet exists
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    // No password required to enter page
    updateActivity()
    loadBridgeData()
  }, [router])

  // Reload balance when wallet changes (check localStorage for current wallet ID)
  useEffect(() => {
    let lastWalletId = getCurrentWalletId()
    
    const checkWalletChange = () => {
      const currentWalletId = getCurrentWalletId()
      if (currentWalletId !== lastWalletId) {
        lastWalletId = currentWalletId
        loadBridgeData()
      }
    }

    // Check for wallet changes periodically
    const interval = setInterval(checkWalletChange, 1000)
    
    // Also check on focus
    window.addEventListener("focus", checkWalletChange)
    
    // Listen for storage changes (when wallet is switched)
    window.addEventListener("storage", checkWalletChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener("focus", checkWalletChange)
      window.removeEventListener("storage", checkWalletChange)
    }
  }, [])

  const loadBridgeData = async () => {
    try {
      const wallets = getWallets()
      if (wallets.length === 0) return

      // Get the currently selected wallet
      const active = getCurrentWallet() || wallets[0]

      setLoadingPool(true)
      const [pepuBalance, fee, poolBal] = await Promise.all([
        getNativeBalance(active.address, 97741),
        getFeePercentage(97741),
        getPoolBalance(),
      ])

      setBalance(pepuBalance)
      setFeePercentage(fee)
      setPoolBalance(poolBal)
    } catch (err) {
      console.error("Error loading bridge data:", err)
    } finally {
      setLoadingPool(false)
    }
  }

  const handleBridge = async () => {
    setError("")
    setSuccess("")
    setTxHash(null)
    setSuccessTx(null)

    if (!amount) {
      setError("Please enter amount")
      return
    }

    if (Number.parseFloat(amount) <= 0) {
      setError("Amount must be greater than 0")
      return
    }

    if (Number.parseFloat(amount) > Number.parseFloat(balance)) {
      setError("Insufficient PEPU balance")
      return
    }

    // Check if L1 pool has sufficient balance for bridge amount
    const receivePercentage = 1 - feePercentage
    const bridgeAmount = Number.parseFloat(amount) * receivePercentage
    const l1PoolAmount = Number.parseFloat(poolBalance)

    if (bridgeAmount > l1PoolAmount) {
      setError("Insufficient pool funds. Please try a smaller amount or check back later.")
      return
    }

    setLoading(true)
    try {
      const wallets = getWallets()
      if (wallets.length === 0) throw new Error("No wallet found")

      // Get the currently selected wallet
      const active = getCurrentWallet() || wallets[0]

      const hash = await executeBridge(active, null, amount, 97741)
      setTxHash(hash)

      const receivedAmount = Number.parseFloat(amount) * receivePercentage
      setSuccessTx({
        original: amount,
        received: receivedAmount.toFixed(6),
        hash,
      })

      // Store transaction in history with full link
      const explorerUrl = `https://pepuscan.com/tx/${hash}`
      
      // Show transaction notification
      setNotificationData({
        message: "Bridge successful!",
        txHash: hash,
        explorerUrl,
      })
      setShowNotification(true)
      const txHistory = JSON.parse(localStorage.getItem("transaction_history") || "[]")
      txHistory.unshift({
        hash,
        type: "bridge",
        amount,
        received: receivedAmount.toFixed(6),
        chainId: 97741,
        timestamp: Date.now(),
        explorerUrl,
      })
      localStorage.setItem("transaction_history", JSON.stringify(txHistory.slice(0, 100)))

      setAmount("")

      // Reload pool balance after successful bridge
      setTimeout(() => {
        loadBridgeData()
      }, 2000)
    } catch (err: any) {
      setError(err.message || "Bridge failed")
    } finally {
      setLoading(false)
    }
  }

  const handleDismissSuccess = () => {
    setSuccessTx(null)
    setTxHash(null)
    setAmount("")
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (!val || isNaN(Number(val))) {
      setAmount(val)
      return
    }

    const numVal = Number(val)
    if (numVal > Number.parseFloat(balance)) {
      setAmount(balance)
      setError("Amount exceeds wallet balance")
    } else {
      setAmount(val)
      setError("")
    }
  }

  const receivePercentage = 1 - feePercentage
  const receivedAmount = amount ? Number.parseFloat(amount) * receivePercentage : 0
  const bridgeFee = amount ? Number.parseFloat(amount) * feePercentage : 0

  const pool = Number.parseFloat(poolBalance)
  const percent = Math.min((pool / MAX_BRIDGE_POOL) * 100, 100)
  const formattedPool = pool.toLocaleString(undefined, { maximumFractionDigits: 3 })

  const bridgeAmount = amount ? Number.parseFloat(amount) * receivePercentage : 0
  const l1PoolAmount = Number.parseFloat(poolBalance)
  const hasInsufficientL1Pool = bridgeAmount > l1PoolAmount && bridgeAmount > 0

  const isBridgeDisabled =
    loading || !amount || Number.parseFloat(amount) <= 0 || hasInsufficientL1Pool

  const wallets = getWallets()
  const active = wallets.length > 0 ? (getCurrentWallet() || wallets[0]) : null
  const walletAddress = active ? active.address : ""

  function shortenAddress(addr: string) {
    if (!addr) return ""
    return addr.slice(0, 6) + "..." + addr.slice(-4)
  }

  return (
    <div className="min-h-screen bg-[#0e0e0f] pb-24">
      {showNotification && notificationData && (
        <TransactionNotification
          message={notificationData.message}
          txHash={notificationData.txHash}
          explorerUrl={notificationData.explorerUrl}
          onClose={() => {
            setShowNotification(false)
            setNotificationData(null)
          }}
          duration={10000}
        />
      )}
      {/* Header */}
      <div className="glass-card rounded-none p-6 border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">PEPU VAULT Bridge</h1>
            <p className="text-sm text-gray-400">Bridge PEPU from L2 → L1</p>
          </div>
        </div>
      </div>

      {/* Main Bridge Card */}
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="relative">
            {/* Glass effect overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.12] via-white/[0.05] to-transparent rounded-3xl pointer-events-none"></div>

            {/* Main card */}
            <div className="relative backdrop-blur-xl bg-white/[0.05] rounded-3xl shadow-2xl border border-white/[0.15] overflow-hidden">
              {/* Card Body */}
              <div className="relative p-8 sm:p-10 lg:p-12">
                {/* Network Info */}
                <div className="mb-8">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <span className="text-sm font-bold text-green-400">L2</span>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">From</div>
                        <div className="text-white font-semibold">Pepe Unchained V2</div>
                      </div>
                    </div>
                    <div className="text-2xl text-gray-500">→</div>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <span className="text-sm font-bold text-blue-400">L1</span>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">To</div>
                        <div className="text-white font-semibold">Ethereum Mainnet</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pool Status */}
                <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-green-500/10 to-blue-500/10 border border-white/[0.15]">
                  <div className="text-center mb-4">
                    <div className="text-sm text-gray-400 mb-1">Bridge Pool Status</div>
                    <div className="text-2xl font-bold text-white mb-2">
                      {loadingPool ? (
                        <span className="text-gray-400">Loading...</span>
                      ) : (
                        <span>{formattedPool} <span className="text-lg text-gray-400">PEPU</span></span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      Max Capacity: {MAX_BRIDGE_POOL.toLocaleString()} PEPU
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full h-6 bg-black/50 border border-white/[0.2] rounded-full mb-2 relative overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-blue-500 rounded-full transition-all duration-700 shadow-lg shadow-green-500/30"
                      style={{ width: `${percent}%` }}
                    ></div>
                    <span className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 text-xs font-bold text-white drop-shadow-lg">
                      {loadingPool ? "..." : `${percent.toFixed(2)}%`}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0</span>
                    <span>{MAX_BRIDGE_POOL.toLocaleString()}</span>
                  </div>
                </div>

                {/* Amount Input */}
                <div className="mb-6">
                  <label className="block text-white text-sm font-semibold mb-2">Amount to Bridge</label>
                  <div className="relative">
                    <input
                      type="number"
                      className="w-full bg-white/[0.08] backdrop-blur-sm border-2 border-white/[0.2] rounded-xl px-4 py-4 text-white text-xl font-semibold focus:outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all"
                      value={amount}
                      onChange={handleInputChange}
                      min="0"
                      step="any"
                      placeholder="0.00"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <span className="text-gray-400 font-semibold">PEPU</span>
                    </div>
                  </div>
                  {hasInsufficientL1Pool && amount && (
                    <div className="text-orange-400 text-sm mt-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                      ⚠️ Insufficient pool funds. Try a smaller amount.
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm text-gray-400 mt-3 px-1">
                    <span>Available Balance:</span>
                    <span className="text-white font-semibold">
                      {Number.parseFloat(balance).toLocaleString(undefined, {
                        maximumFractionDigits: 6,
                      })}{" "}
                      PEPU
                    </span>
                  </div>
                </div>

                {/* Bridge Button */}
                <div className="relative w-full mb-6">
                  <button
                    className={`w-full font-bold text-lg py-4 rounded-xl border transition-all ${
                      isBridgeDisabled
                        ? "bg-white/[0.05] text-white/30 cursor-not-allowed border-white/[0.08] backdrop-blur-sm"
                        : "bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 hover:from-orange-600 hover:via-pink-600 hover:to-purple-600 text-white hover:scale-[1.02] shadow-xl shadow-orange-500/30 hover:shadow-orange-500/40 border-transparent active:scale-[0.98]"
                    }`}
                    disabled={isBridgeDisabled}
                    onClick={handleBridge}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-3">
                        <Loader className="w-5 h-5 animate-spin" />
                        Bridging...
                      </span>
                    ) : (
                      "Bridge PEPU"
                    )}
                  </button>
                </div>

                {/* Transaction Status Messages */}
                {error && (
                  <div className="text-red-400 text-sm mb-4 text-center bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                    {error}
                  </div>
                )}

                {loading && txHash && (
                  <div className="backdrop-blur-sm bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4 text-blue-100 text-center">
                    <div className="flex items-center justify-center mb-3">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-2 animate-pulse">
                        <span className="text-white text-lg">⏳</span>
                      </div>
                      <div className="font-bold text-lg">Transaction Pending</div>
                    </div>

                    <div className="text-sm mb-3">
                      Your bridge transaction is being processed on Pepe Unchained V2 mainnet...
                    </div>

                    <div className="bg-black/40 rounded-lg p-2 mb-3">
                      <div className="text-xs text-gray-300 mb-1">Transaction:</div>
                      <a
                        href={`https://pepuscan.com/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-yellow-300 hover:text-yellow-200 underline break-all"
                      >
                        https://pepuscan.com/tx/{txHash}
                      </a>
                    </div>

                    <div className="text-xs text-gray-300">
                      🔄 Please wait while we confirm your transaction...
                    </div>
                  </div>
                )}

                {successTx && (
                  <div className="backdrop-blur-sm bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4 text-green-100 text-center">
                    <div className="flex items-center justify-center mb-3">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-2">
                        <span className="text-white text-lg">✓</span>
                      </div>
                      <div className="font-bold text-lg">Bridge Successful!</div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between items-center bg-black/30 rounded-lg p-2">
                        <span className="text-sm">Amount Bridged:</span>
                        <span className="font-mono font-bold text-green-300">
                          {successTx.original} PEPU
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-black/30 rounded-lg p-2">
                        <span className="text-sm">You'll Receive:</span>
                        <span className="font-mono font-bold text-yellow-300">
                          {successTx.received} PEPU
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-black/30 rounded-lg p-2">
                        <span className="text-sm">Network Fee ({(feePercentage * 100).toFixed(1)}%):</span>
                        <span className="font-mono text-red-300">
                          {(Number.parseFloat(successTx.original) * feePercentage).toFixed(6)} PEPU
                        </span>
                      </div>
                    </div>

                    <div className="bg-black/40 rounded-lg p-2 mb-3">
                      <div className="text-xs text-gray-300 mb-1">Transaction:</div>
                      <a
                        href={`https://pepuscan.com/tx/${successTx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-yellow-300 hover:text-yellow-200 underline break-all"
                      >
                        https://pepuscan.com/tx/{successTx.hash}
                      </a>
                    </div>

                    <div className="text-xs text-gray-300 mb-3">
                      ⏱️ Your tokens will arrive on Ethereum mainnet in approximately 30 seconds
                    </div>

                    <button
                      onClick={handleDismissSuccess}
                      className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors"
                    >
                      Continue Bridging
                    </button>
                  </div>
                )}

                {/* Bridge Info */}
                {!loading && !txHash && !successTx && (
                  <div className="backdrop-blur-sm bg-white/[0.05] border border-white/[0.15] rounded-xl p-6 space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-white/[0.1]">
                      <span className="text-sm text-gray-400">Recipient Address</span>
                      <span className="text-white font-mono text-sm">{shortenAddress(walletAddress)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/[0.1]">
                      <span className="text-sm text-gray-400">Estimated Time</span>
                      <span className="text-white font-semibold">≈ 30 seconds</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/[0.1]">
                      <span className="text-sm text-gray-400">You Will Receive</span>
                      <span className="text-green-400 font-bold text-lg">
                        {amount && !isNaN(Number(amount))
                          ? `${receivedAmount.toLocaleString(undefined, {
                              maximumFractionDigits: 6,
                            })} PEPU`
                          : "0 PEPU"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-gray-400">Bridge Fee ({(feePercentage * 100).toFixed(1)}%)</span>
                      <span className="text-red-400 font-semibold">
                        {amount && !isNaN(Number(amount))
                          ? `${bridgeFee.toLocaleString(undefined, {
                              maximumFractionDigits: 6,
                            })} PEPU`
                          : "0 PEPU"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="relative backdrop-blur-sm bg-white/[0.03] px-8 py-4 border-t border-white/[0.1]">
                <p className="text-xs text-white/60 text-center">
                  Bridge Fee: {(feePercentage * 100).toFixed(1)}% • Estimated Time: ~30 seconds • No Token Restrictions
                </p>
              </div>
            </div>
          </div>
        </div>

      <BottomNav active="bridge" />
    </div>
  )
}
