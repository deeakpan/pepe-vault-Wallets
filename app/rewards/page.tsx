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
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="glass-card rounded-none p-6 border-b border-white/10 sticky top-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <Gift className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Rewards</h1>
              <p className="text-sm text-gray-400">Earn cashback on every transaction</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8 space-y-6">
          {checking ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-green-500 mb-3" />
              <p className="text-gray-400">Checking eligibility...</p>
            </div>
          ) : !eligible ? (
            <div className="glass-card p-6 border border-yellow-500/50 bg-yellow-500/10">
              <div className="flex items-center gap-3 mb-4">
                <XCircle className="w-6 h-6 text-yellow-400" />
                <h2 className="text-lg font-bold text-yellow-400">Not Eligible</h2>
              </div>
              <p className="text-sm text-gray-300 mb-4">
                You need to hold at least <span className="font-bold text-white">1,000,000 VAULT</span> tokens to access rewards.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Your VAULT Balance:</span>
                  <span className="font-semibold">{Number.parseFloat(uchainBalance).toLocaleString()} VAULT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Required:</span>
                  <span className="font-semibold">{required.toLocaleString()} VAULT</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Rewards Balance */}
              <div className="glass-card p-6 border border-green-500/50 bg-green-500/10">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <h2 className="text-lg font-bold text-green-400">Eligible for Rewards</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Total Rewards Earned</p>
                    <p className="text-3xl font-bold text-green-400">
                      {Number.parseFloat(rewardsBalance).toFixed(6)} VAULT
                    </p>
                    {uchainPrice > 0 && (
                      <p className="text-sm text-gray-400 mt-1">
                        ≈ ${(Number.parseFloat(rewardsBalance) * uchainPrice).toFixed(2)} USD
                      </p>
                    )}
                  </div>
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-xs text-gray-400 mb-2">Rewards Rates:</p>
                    <ul className="text-xs text-gray-300 space-y-1">
                      <li>• $0.005 worth of VAULT per token transfer</li>
                      <li>• 0.085% of swap value in VAULT (cashback)</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Admin Wallet Balance Warning */}
              {!adminHasBalance && adminBalanceCheck && (
                <div className="glass-card p-4 border border-yellow-500/50 bg-yellow-500/10">
                  <p className="text-yellow-400 text-sm">
                    ⚠️ Rewards are temporarily unavailable. {adminBalanceCheck.message || "Admin wallet does not have sufficient VAULT tokens."}
                  </p>
                </div>
              )}

              {/* Claim Button */}
              <button
                onClick={handleClaim}
                disabled={claiming || Number.parseFloat(rewardsBalance) <= 0 || !adminHasBalance}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {claiming && <Loader className="w-4 h-4 animate-spin" />}
                {claiming ? "Claiming..." : !adminHasBalance ? "Rewards Unavailable" : "Claim Rewards"}
              </button>

              {/* Messages */}
              {error && (
                <div className="glass-card p-4 border border-red-500/50 bg-red-500/10">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {success && (
                <div className="glass-card p-4 border border-green-500/50 bg-green-500/10">
                  <p className="text-green-400 text-sm">{success}</p>
                </div>
              )}

              {/* Info */}
              <div className="glass-card p-4 border border-white/10">
                <p className="text-xs text-gray-400">
                  Rewards are automatically tracked for all transfers and swaps on the PEPU chain. 
                  Claim your rewards anytime to receive VAULT tokens directly to your wallet.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <BottomNav active="dashboard" />
    </div>
  )
}

