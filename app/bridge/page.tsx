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
    <div className="min-h-screen pb-28 text-white" style={{ background: "#13141a" }}>
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

      {/* ── Header ── */}
      <div
        className="sticky top-0 z-40 flex items-center gap-3 px-5 py-4"
        style={{ background: "rgba(19,20,26,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,255,136,0.12)" }}>
          <Zap className="w-4 h-4" style={{ color: "#00ff88" }} />
        </div>
        <div>
          <h1 className="text-base font-bold">Bridge</h1>
          <p className="text-xs" style={{ color: "#6b7280" }}>PEPU L2 → Ethereum L1</p>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 pt-5 space-y-4">

        {/* ── Network route ── */}
        <div
          className="flex items-center justify-between p-4 rounded-2xl"
          style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: "rgba(0,255,136,0.15)", color: "#00ff88" }}>L2</div>
            <div>
              <p className="text-xs" style={{ color: "#6b7280" }}>From</p>
              <p className="text-sm font-semibold">PEPU Chain V2</p>
            </div>
          </div>
          <div style={{ color: "#374151" }}>→</div>
          <div className="flex items-center gap-3">
            <div className="flex-1 text-right">
              <p className="text-xs" style={{ color: "#6b7280" }}>To</p>
              <p className="text-sm font-semibold">Ethereum</p>
            </div>
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: "rgba(98,126,234,0.15)", color: "#627eea" }}>L1</div>
          </div>
        </div>

        {/* ── Pool status ── */}
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: "#6b7280" }}>Bridge Pool</p>
            <p className="text-xs font-semibold" style={{ color: "#9ca3af" }}>
              Max: {MAX_BRIDGE_POOL.toLocaleString()} PEPU
            </p>
          </div>
          <div className="text-xl font-bold">
            {loadingPool ? (
              <span style={{ color: "#6b7280" }}>Loading…</span>
            ) : (
              <>{formattedPool} <span className="text-sm font-normal" style={{ color: "#6b7280" }}>PEPU</span></>
            )}
          </div>
          {/* progress bar */}
          <div className="w-full h-2.5 rounded-full relative overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${percent}%`, background: "linear-gradient(90deg, #00ff88, #3b82f6)" }}
            />
          </div>
          <div className="flex justify-between text-xs" style={{ color: "#4b5563" }}>
            <span>0</span>
            <span>{percent.toFixed(1)}% full</span>
            <span>{MAX_BRIDGE_POOL.toLocaleString()}</span>
          </div>
        </div>

        {/* ── Amount card ── */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold" style={{ color: "#6b7280" }}>You Bridge</span>
              <button
                onClick={() => setAmount(balance)}
                className="text-xs font-semibold"
                style={{ color: "#00ff88" }}
              >
                Max: {Number.parseFloat(balance).toFixed(4)} PEPU
              </button>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                className="flex-1 bg-transparent text-3xl font-bold outline-none"
                style={{ color: "#fff" }}
                value={amount}
                onChange={handleInputChange}
                min="0"
                step="any"
                placeholder="0.00"
              />
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl flex-shrink-0" style={{ background: "rgba(0,255,136,0.12)", border: "1px solid rgba(0,255,136,0.2)" }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs" style={{ background: "#00ff88", color: "#13141a" }}>P</div>
                <span className="text-sm font-bold" style={{ color: "#00ff88" }}>PEPU</span>
              </div>
            </div>
          </div>

          {/* fee info */}
          {amount && Number.parseFloat(amount) > 0 && (
            <div className="mx-5 mb-5 rounded-2xl p-4 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: "#6b7280" }}>Recipient</span>
                <span className="font-mono" style={{ color: "#9ca3af" }}>{shortenAddress(walletAddress)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: "#6b7280" }}>Estimated time</span>
                <span style={{ color: "#9ca3af" }}>≈ 30 seconds</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: "#6b7280" }}>Bridge fee ({(feePercentage * 100).toFixed(1)}%)</span>
                <span style={{ color: "#ef4444" }}>-{bridgeFee.toFixed(6)} PEPU</span>
              </div>
              <div className="flex justify-between text-xs font-semibold pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ color: "#9ca3af" }}>You receive</span>
                <span style={{ color: "#00ff88" }}>{receivedAmount.toFixed(6)} PEPU</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Insufficient pool warning ── */}
        {hasInsufficientL1Pool && amount && (
          <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}>
            <span className="text-sm" style={{ color: "#f59e0b" }}>Insufficient pool funds. Please try a smaller amount or check back later.</span>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <span className="text-sm" style={{ color: "#fca5a5" }}>{error}</span>
          </div>
        )}

        {/* ── Pending tx ── */}
        {loading && txHash && (
          <div className="p-4 rounded-2xl space-y-2" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)" }}>
            <div className="flex items-center gap-2">
              <Loader className="w-4 h-4 animate-spin" style={{ color: "#3b82f6" }} />
              <span className="text-sm font-semibold" style={{ color: "#93c5fd" }}>Transaction Pending…</span>
            </div>
            <a href={`https://pepuscan.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="text-xs font-mono break-all underline" style={{ color: "#6b7280" }}>
              {txHash}
            </a>
          </div>
        )}

        {/* ── Success ── */}
        {successTx && (
          <div className="p-4 rounded-2xl space-y-3" style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.2)" }}>
            <p className="font-semibold text-sm" style={{ color: "#00ff88" }}>Bridge Successful!</p>
            <div className="space-y-2 text-xs">
              {[
                { label: "Bridged", value: `${successTx.original} PEPU`, color: "#fff" },
                { label: "You receive", value: `${successTx.received} PEPU`, color: "#00ff88" },
                { label: `Fee (${(feePercentage * 100).toFixed(1)}%)`, value: `${(Number.parseFloat(successTx.original) * feePercentage).toFixed(6)} PEPU`, color: "#ef4444" },
              ].map(row => (
                <div key={row.label} className="flex justify-between">
                  <span style={{ color: "#6b7280" }}>{row.label}</span>
                  <span className="font-semibold" style={{ color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
            <a href={`https://pepuscan.com/tx/${successTx.hash}`} target="_blank" rel="noopener noreferrer"
              className="text-xs font-mono break-all underline block" style={{ color: "#6b7280" }}>
              {successTx.hash}
            </a>
            <p className="text-xs" style={{ color: "#6b7280" }}>Tokens arrive on Ethereum in ~30 seconds</p>
            <button onClick={handleDismissSuccess}
              className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
              style={{ background: "#00ff88", color: "#13141a" }}>
              Bridge Again
            </button>
          </div>
        )}

        {/* ── Bridge button ── */}
        <button
          onClick={handleBridge}
          disabled={isBridgeDisabled}
          className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
          style={
            isBridgeDisabled
              ? { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#9ca3af", cursor: "not-allowed", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }
              : { background: "#00ff88", color: "#0a0b0d", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }
          }
        >
          {loading ? <><Loader className="w-4 h-4 animate-spin" /> Bridging…</> : "Bridge PEPU"}
        </button>

        {/* ── Footer note ── */}
        <p className="text-xs text-center pb-2" style={{ color: "#374151" }}>
          Fee: {(feePercentage * 100).toFixed(1)}% · Est. time: ~30s · No token restrictions
        </p>
      </div>

      <BottomNav active="bridge" />
    </div>
  )
}
