"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWallets, getCurrentWallet, updateActivity } from "@/lib/wallet"
import { getRewardsBalance, checkRewardsEligibility, claimRewards, checkAdminWalletBalance } from "@/lib/rewards"
import { fetchGeckoTerminalData } from "@/lib/gecko"
import { UCHAIN_TOKEN_ADDRESS } from "@/lib/config"
import { Gift, Loader, CheckCircle, XCircle } from "lucide-react"
import BottomNav from "@/components/BottomNav"
import TransactionNotification from "@/components/TransactionNotification"

export default function RewardsPage() {
  const router = useRouter()
  const [rewardsBalance, setRewardsBalance] = useState("0")
  const [eligible, setEligible] = useState(false)
  const [checking, setChecking] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [uchainBalance, setUchainBalance] = useState("0")
  const [required, setRequired] = useState(1000000)
  const [uchainPrice, setUchainPrice] = useState<number>(0)
  const [adminHasBalance, setAdminHasBalance] = useState(true)
  const [adminBalanceCheck, setAdminBalanceCheck] = useState<{ hasBalance: boolean; message?: string } | null>(null)
  const [showNotification, setShowNotification] = useState(false)
  const [notificationData, setNotificationData] = useState<{ message: string; txHash?: string; explorerUrl?: string } | null>(null)

  useEffect(() => {
    // Check if wallet exists
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    updateActivity()
    loadRewardsData()

    // Refresh rewards balance and price every 5 seconds
    const interval = setInterval(() => {
      const wallets = getWallets()
      if (wallets.length > 0) {
        const active = getCurrentWallet() || wallets[0]
        const balance = getRewardsBalance(active.address)
        setRewardsBalance(balance)
        
        // Refresh VAULT price
        fetchGeckoTerminalData(UCHAIN_TOKEN_ADDRESS, "pepe-unchained")
          .then((geckoData) => {
            if (geckoData && geckoData.price_usd) {
              const price = parseFloat(geckoData.price_usd)
              if (price > 0) {
                setUchainPrice(price)
              }
            }
          })
          .catch((err) => console.error("Error fetching VAULT price:", err))
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [router])

  const loadRewardsData = async () => {
    setChecking(true)
    try {
      const wallets = getWallets()
      if (wallets.length === 0) return

      const active = getCurrentWallet() || wallets[0]
      
      // Get rewards balance (per-wallet)
      const balance = getRewardsBalance(active.address)
      setRewardsBalance(balance)

      // Check eligibility
      const eligibility = await checkRewardsEligibility(active.address)
      setEligible(eligibility.eligible)
      setUchainBalance(eligibility.balance)
      setRequired(eligibility.required)

      // Fetch VAULT price for USD display
      try {
        const geckoData = await fetchGeckoTerminalData(UCHAIN_TOKEN_ADDRESS, "pepe-unchained")
        if (geckoData && geckoData.price_usd) {
          const price = parseFloat(geckoData.price_usd)
          if (price > 0) {
            setUchainPrice(price)
          }
        }
      } catch (err) {
        console.error("Error fetching VAULT price:", err)
      }
      
      // CRITICAL: Check if admin wallet has VAULT tokens
      // If admin wallet doesn't have VAULT tokens, no claim is available
      try {
        const adminCheck = await checkAdminWalletBalance(balance)
        setAdminHasBalance(adminCheck.hasBalance)
        setAdminBalanceCheck(adminCheck)
        console.log(`[Rewards] Admin wallet balance check: ${adminCheck.hasBalance}, balance: ${adminCheck.adminBalance} VAULT`)
      } catch (err) {
        console.error("Error checking admin wallet balance:", err)
        setAdminHasBalance(false)
      }
    } catch (error: any) {
      console.error("Error loading rewards data:", error)
      setError("Failed to load rewards data")
    } finally {
      setChecking(false)
    }
  }

  const handleClaim = async () => {
    if (Number.parseFloat(rewardsBalance) <= 0) {
      setError("No rewards to claim")
      return
    }

    setClaiming(true)
    setError("")
    setSuccess("")
    
    try {
      const wallets = getWallets()
      if (wallets.length === 0) throw new Error("No wallet found")

      const active = getCurrentWallet() || wallets[0]
      const txHash = await claimRewards(active.address)

      const explorerUrl = `https://pepuscan.com/tx/${txHash}`
      
      // Show transaction notification
      setNotificationData({
        message: "Rewards claimed successfully!",
        txHash,
        explorerUrl,
      })
      setShowNotification(true)
      setSuccess("")
      setRewardsBalance("0")

      // Reload data after a delay
      setTimeout(() => {
        loadRewardsData()
      }, 2000)
    } catch (err: any) {
      setError(err.message || "Failed to claim rewards")
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="min-h-screen pb-28 text-white" style={{ background: "#13141a" }}>

      {showNotification && notificationData && (
        <TransactionNotification
          message={notificationData.message}
          txHash={notificationData.txHash}
          explorerUrl={notificationData.explorerUrl}
          onClose={() => { setShowNotification(false); setNotificationData(null) }}
        />
      )}

      {/* ── Header ── */}
      <div
        className="sticky top-0 z-40 flex items-center gap-3 px-5 py-4"
        style={{ background: "rgba(19,20,26,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,255,136,0.12)" }}>
          <Gift className="w-4 h-4" style={{ color: "#00ff88" }} />
        </div>
        <div>
          <h1 className="text-base font-bold">Rewards</h1>
          <p className="text-xs" style={{ color: "#6b7280" }}>Earn cashback on every transaction</p>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 pt-5 space-y-4">
        {checking ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Loader className="w-8 h-8 animate-spin" style={{ color: "#00ff88" }} />
            <p className="text-sm" style={{ color: "#6b7280" }}>Checking eligibility…</p>
          </div>
        ) : !eligible ? (
          /* ── Not eligible ── */
          <div className="rounded-3xl p-6 space-y-4" style={{ background: "#1a1d2e", border: "1px solid rgba(245,158,11,0.2)" }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(245,158,11,0.12)" }}>
                <XCircle className="w-6 h-6" style={{ color: "#f59e0b" }} />
              </div>
              <div>
                <p className="font-bold" style={{ color: "#f59e0b" }}>Not Eligible</p>
                <p className="text-xs" style={{ color: "#6b7280" }}>Need more VAULT tokens</p>
              </div>
            </div>
            <p className="text-sm" style={{ color: "#9ca3af" }}>
              Hold at least <strong style={{ color: "#fff" }}>1,000,000 VAULT</strong> tokens to access rewards.
            </p>
            <div className="space-y-2 text-sm">
              {[
                { label: "Your VAULT", value: `${Number.parseFloat(uchainBalance).toLocaleString()} VAULT` },
                { label: "Required", value: `${required.toLocaleString()} VAULT` },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center py-2.5 px-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <span style={{ color: "#6b7280" }}>{row.label}</span>
                  <span className="font-semibold">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* ── Rewards balance card ── */}
            <div className="rounded-3xl p-6 space-y-4" style={{ background: "#1a1d2e", border: "1px solid rgba(0,255,136,0.15)" }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(0,255,136,0.12)" }}>
                  <CheckCircle className="w-6 h-6" style={{ color: "#00ff88" }} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: "#00ff88" }}>Eligible for Rewards</p>
                  <p className="text-xs" style={{ color: "#6b7280" }}>Cashback on all transactions</p>
                </div>
              </div>

              <div className="text-center py-4">
                <p className="text-xs font-semibold mb-2" style={{ color: "#6b7280" }}>Total Rewards Earned</p>
                <p className="text-4xl font-bold" style={{ color: "#00ff88" }}>
                  {Number.parseFloat(rewardsBalance).toFixed(6)}
                </p>
                <p className="text-base font-semibold mt-1" style={{ color: "#9ca3af" }}>VAULT</p>
                {uchainPrice > 0 && (
                  <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
                    ≈ ${(Number.parseFloat(rewardsBalance) * uchainPrice).toFixed(2)} USD
                  </p>
                )}
              </div>

              <div className="rounded-2xl p-4 space-y-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-xs font-semibold mb-2" style={{ color: "#6b7280" }}>Reward Rates</p>
                {[
                  "$0.005 worth of VAULT per token transfer",
                  "0.085% of swap value in VAULT (cashback)",
                ].map(item => (
                  <div key={item} className="flex items-start gap-2 text-xs" style={{ color: "#9ca3af" }}>
                    <span style={{ color: "#00ff88" }}>·</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Admin warning ── */}
            {!adminHasBalance && adminBalanceCheck && (
              <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <span className="text-sm" style={{ color: "#fcd34d" }}>
                  {adminBalanceCheck.message || "Rewards temporarily unavailable — admin wallet has insufficient VAULT."}
                </span>
              </div>
            )}

            {/* ── Claim button ── */}
            <button
              onClick={handleClaim}
              disabled={claiming || Number.parseFloat(rewardsBalance) <= 0 || !adminHasBalance}
              className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
              style={
                claiming || Number.parseFloat(rewardsBalance) <= 0 || !adminHasBalance
                  ? { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#9ca3af", cursor: "not-allowed", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }
                  : { background: "#00ff88", color: "#0a0b0d", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }
              }
            >
              {claiming && <Loader className="w-4 h-4 animate-spin" />}
              {claiming ? "Claiming…" : !adminHasBalance ? "Rewards Unavailable" : "Claim Rewards"}
            </button>

            {/* ── Error / success ── */}
            {error && (
              <div className="p-4 rounded-2xl" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <p className="text-sm" style={{ color: "#fca5a5" }}>{error}</p>
              </div>
            )}
            {success && (
              <div className="p-4 rounded-2xl" style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.2)" }}>
                <p className="text-sm" style={{ color: "#6ee7b7" }}>{success}</p>
              </div>
            )}

            {/* ── Info ── */}
            <div className="p-4 rounded-2xl text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-xs" style={{ color: "#4b5563" }}>
                Rewards are tracked automatically for all transfers and swaps on PEPU Chain. Claim anytime to receive VAULT directly to your wallet.
              </p>
            </div>
          </>
        )}
      </div>

      <BottomNav active="rewards" />
    </div>
  )
}

