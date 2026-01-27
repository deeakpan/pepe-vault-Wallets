"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWallets, getCurrentWallet, clearAllWallets, confirmWalletReset } from "@/lib/wallet"
import {
  checkDomainAvailability,
  getDomainRegistrationFee,
  getDomainRegistrationFeeByDays,
  getDomainInfo,
  getDomainStatus,
  validateDomainName,
  registerDomain,
  getDomainByWallet,
} from "@/lib/domains"
import { getTokenBalance } from "@/lib/rpc"
import { Search, Loader, CheckCircle, XCircle, Globe, RotateCcw } from "lucide-react"
import BottomNav from "@/components/BottomNav"

const USDC_ADDRESS = "0x20fB684Bfc1aBAaD3AceC5712f2Aa30bd494dF74"
const PEPU_CHAIN_ID = 97741

export default function DomainsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [isChecking, setIsChecking] = useState(false)
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [domainStatus, setDomainStatus] = useState<any>(null)
  const [registrationFee, setRegistrationFee] = useState<string>("0")
  const [years, setYears] = useState(1)
  const [days, setDays] = useState(365)
  const [inputMode, setInputMode] = useState<"years" | "days">("days")
  const [loadingFee, setLoadingFee] = useState(false)
  const [usdcBalance, setUsdcBalance] = useState("0")
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [registering, setRegistering] = useState(false)
  const [password, setPassword] = useState("")
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [userDomain, setUserDomain] = useState<string | null>(null)
  const [userDomainInfo, setUserDomainInfo] = useState<any>(null)
  const [loadingUserDomain, setLoadingUserDomain] = useState(false)

  useEffect(() => {
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    loadUserDomain()
    loadUsdcBalance()
  }, [router])

  const loadUserDomain = async () => {
    try {
      setLoadingUserDomain(true)
      const wallets = getWallets()
      if (wallets.length === 0) return

      const wallet = getCurrentWallet() || wallets[0]
      const domain = await getDomainByWallet(wallet.address)
      
      if (domain) {
        setUserDomain(domain)
        const parsed = domain.replace(".pepu", "")
        const info = await getDomainInfo(parsed, ".pepu")
        setUserDomainInfo(info)
      }
    } catch (error) {
      console.error("Error loading user domain:", error)
    } finally {
      setLoadingUserDomain(false)
    }
  }

  const loadUsdcBalance = async () => {
    try {
      setLoadingBalance(true)
      const wallets = getWallets()
      if (wallets.length === 0) return

      const wallet = getCurrentWallet() || wallets[0]
      const balance = await getTokenBalance(USDC_ADDRESS, wallet.address, PEPU_CHAIN_ID)
      setUsdcBalance(balance)
    } catch (error) {
      console.error("Error loading USDC balance:", error)
    } finally {
      setLoadingBalance(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a domain name")
      return
    }

    // Remove .pepu if user included it
    const domainName = searchQuery.trim().toLowerCase().replace(".pepu", "")

    // Validate domain name format
    if (!/^[a-z0-9-]{1,63}$/.test(domainName)) {
      setError("Invalid domain name. Use only letters, numbers, and hyphens (1-63 characters)")
      setIsAvailable(null)
      setDomainStatus(null)
      setShowRegisterForm(false)
      return
    }

    setIsChecking(true)
    setError("")
    setSuccess("")
    setShowRegisterForm(false)

    try {
      const isValid = await validateDomainName(domainName)
      if (!isValid) {
        setError("Invalid domain name format")
        setIsAvailable(null)
        setDomainStatus(null)
        return
      }

      const available = await checkDomainAvailability(domainName, ".pepu")
      setIsAvailable(available)

      if (available) {
        const status = await getDomainStatus(domainName, ".pepu")
        setDomainStatus(status)
        setShowRegisterForm(true)
        await updateFee(domainName, years)
      } else {
        // Domain exists, get its info
        const info = await getDomainInfo(domainName, ".pepu")
        if (info) {
          setDomainStatus({
            exists: true,
            expired: Date.now() / 1000 >= info.expiryTimestamp,
            remainingDays: info.expiryTimestamp > Date.now() / 1000
              ? Math.floor((info.expiryTimestamp - Date.now() / 1000) / 86400)
              : 0,
          })
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to check domain availability")
      setIsAvailable(null)
      setDomainStatus(null)
    } finally {
      setIsChecking(false)
    }
  }

  const updateFee = async (domainName: string, yearsValue: number, daysValue?: number) => {
    if (!domainName) return

    setLoadingFee(true)
    try {
      let fee: string
      if (inputMode === "days" && daysValue !== undefined) {
        if (daysValue < 1 || daysValue > 21900) return // Max 60 years = 21,900 days
        fee = await getDomainRegistrationFeeByDays(domainName, daysValue, ".pepu")
      } else {
        if (yearsValue < 1 || yearsValue > 60) return
        fee = await getDomainRegistrationFee(domainName, yearsValue, ".pepu")
      }
      setRegistrationFee(fee)
    } catch (err: any) {
      console.error("Error calculating fee:", err)
    } finally {
      setLoadingFee(false)
    }
  }

  useEffect(() => {
    if (showRegisterForm && searchQuery.trim() && isAvailable) {
      const domainName = searchQuery.trim().toLowerCase().replace(".pepu", "")
      if (inputMode === "days") {
        updateFee(domainName, years, days)
      } else {
        updateFee(domainName, years)
      }
    }
  }, [years, days, inputMode, showRegisterForm, searchQuery, isAvailable])

  // Sync days and years when switching modes
  useEffect(() => {
    if (inputMode === "days") {
      setDays(Math.round(years * 365))
    } else {
      setYears(Math.max(1, Math.min(60, Math.ceil(days / 365))))
    }
  }, [inputMode])

  const handleRegister = async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a domain name")
      return
    }

    if (!password) {
      setError("Please enter your password")
      return
    }

    const domainName = searchQuery.trim().toLowerCase().replace(".pepu", "")

    // Validate input based on mode
    if (inputMode === "days") {
      if (days < 1 || days > 21900) {
        setError("Please enter a valid number of days (1-21,900 days, max 60 years)")
        return
      }
    } else {
      if (years < 1 || years > 60) {
        setError("Please select a valid number of years (1-60)")
        return
      }
    }

    setRegistering(true)
    setError("")
    setSuccess("")

    try {
      const wallets = getWallets()
      if (wallets.length === 0) throw new Error("No wallet found")

      const wallet = getCurrentWallet() || wallets[0]

      // Convert days to years (round up to ensure user gets at least the days they paid for)
      const yearsToRegister = inputMode === "days" ? Math.ceil(days / 365) : years
      
      // Recalculate fee based on actual years that will be registered (important for days mode)
      const actualFee = await getDomainRegistrationFee(domainName, yearsToRegister, ".pepu")
      
      // Check USDC balance with actual fee
      const balance = await getTokenBalance(USDC_ADDRESS, wallet.address, PEPU_CHAIN_ID)
      if (Number.parseFloat(balance) < Number.parseFloat(actualFee)) {
        throw new Error(
          `Insufficient USDC balance. Required: ${Number.parseFloat(actualFee).toFixed(2)} USDC, Available: ${Number.parseFloat(balance).toFixed(2)} USDC`
        )
      }
      
      const txHash = await registerDomain(wallet, password, domainName, yearsToRegister, ".pepu")
      
      setSuccess(`Domain registered successfully! Transaction: https://pepuscan.com/tx/${txHash}`)
      setPassword("")
      setSearchQuery("")
      setShowRegisterForm(false)
      setIsAvailable(null)
      setDomainStatus(null)
      
      // Reload user domain and balance
      await loadUserDomain()
      await loadUsdcBalance()

      // Redirect after 3 seconds
      setTimeout(() => {
        router.push("/dashboard")
      }, 3000)
    } catch (err: any) {
      setError(err.message || "Failed to register domain")
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="glass-card rounded-none p-6 border-b border-white/10 sticky top-0 backdrop-blur-xl bg-gradient-to-b from-black/80 to-black/60">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500/30 to-green-500/10 flex items-center justify-center border border-green-500/30 shadow-lg shadow-green-500/20">
              <Globe className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-green-500 bg-clip-text text-transparent">
                Register Domain
              </h1>
              <p className="text-sm text-gray-400">Get your unique .pepu domain name</p>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-6">
          {/* User's Existing Domain */}
          {loadingUserDomain ? (
            <div className="glass-card p-8 text-center border border-white/10 backdrop-blur-xl">
              <Loader className="w-6 h-6 animate-spin mx-auto text-green-500" />
              <p className="text-sm text-gray-400 mt-3">Loading your domain...</p>
            </div>
          ) : userDomain && userDomainInfo ? (
            <div className="glass-card p-6 border-2 border-green-500/40 bg-gradient-to-br from-green-500/20 via-green-500/10 to-transparent backdrop-blur-xl shadow-2xl shadow-green-500/20">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-green-500/30 flex items-center justify-center border border-green-500/50">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                </div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-green-500 bg-clip-text text-transparent">
                  Your Domain
                </h2>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-400">Domain Name</p>
                  <p className="text-lg font-semibold text-green-400">{userDomain}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">Wallet Address</p>
                    <p className="text-sm font-mono break-all">{userDomainInfo.walletAddress}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Owner</p>
                    <p className="text-sm font-mono break-all">{userDomainInfo.owner}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">Registration Date</p>
                    <p className="text-sm">
                      {new Date(userDomainInfo.registrationTimestamp * 1000).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Expiry Date</p>
                    <p className="text-sm">
                      {new Date(userDomainInfo.expiryTimestamp * 1000).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Time Remaining</p>
                  <p className="text-sm">
                    {userDomainInfo.expiryTimestamp > Date.now() / 1000
                      ? `${Math.floor((userDomainInfo.expiryTimestamp - Date.now() / 1000) / 86400)} days`
                      : "Expired"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Search Bar */}
          <div className="glass-card p-6 border border-white/10 backdrop-blur-xl">
            <label className="block text-sm font-semibold text-gray-300 mb-3">Search Domain</label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setIsAvailable(null)
                    setDomainStatus(null)
                    setShowRegisterForm(false)
                    setError("")
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearch()
                    }
                  }}
                  placeholder="Enter domain name (e.g., myname)"
                  className="input-field pl-12 bg-white/5 border-white/20 focus:border-green-500/50 focus:ring-2 focus:ring-green-500/30"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
              <button
                onClick={handleSearch}
                disabled={isChecking || !searchQuery.trim()}
                className="btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[120px] justify-center"
              >
                {isChecking ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Search
                  </>
                )}
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <p className="text-xs text-gray-500 px-2">
                {searchQuery ? `${searchQuery}.pepu` : "yourname.pepu"}
              </p>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
          </div>

          {/* Availability Status */}
          {isAvailable !== null && (
            <div
              className={`glass-card p-6 border-2 backdrop-blur-xl shadow-2xl transition-all duration-300 ${
                isAvailable
                  ? "border-green-500/50 bg-gradient-to-br from-green-500/20 via-green-500/10 to-transparent shadow-green-500/20"
                  : "border-red-500/50 bg-gradient-to-br from-red-500/20 via-red-500/10 to-transparent shadow-red-500/20"
              }`}
            >
              <div className="flex items-center gap-4">
                {isAvailable ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-green-500/30 flex items-center justify-center border-2 border-green-500/50">
                      <CheckCircle className="w-7 h-7 text-green-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg text-green-400 mb-1">
                        {searchQuery.replace(".pepu", "")}.pepu is available! 🎉
                      </p>
                      {domainStatus && (
                        <p className="text-sm text-gray-300">
                          Base fee: <span className="font-semibold text-green-400">{Number.parseFloat(domainStatus.fee).toFixed(2)} USDC</span> per year
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-red-500/30 flex items-center justify-center border-2 border-red-500/50">
                      <XCircle className="w-7 h-7 text-red-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg text-red-400 mb-1">
                        {searchQuery.replace(".pepu", "")}.pepu is not available
                      </p>
                      {domainStatus && domainStatus.exists && (
                        <p className="text-sm text-gray-300">
                          {domainStatus.expired
                            ? "This domain has expired"
                            : `Registered for ${domainStatus.remainingDays} more days`}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Registration Form */}
          {showRegisterForm && isAvailable && (
            <div className="glass-card p-6 space-y-6 border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 via-transparent to-transparent backdrop-blur-xl shadow-2xl shadow-green-500/10">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-green-500/30 flex items-center justify-center border border-green-500/50">
                  <Globe className="w-5 h-5 text-green-400" />
                </div>
                <h3 className="text-xl font-bold bg-gradient-to-r from-green-400 to-green-500 bg-clip-text text-transparent">
                  Register Domain
                </h3>
              </div>

              {/* Input Mode Toggle */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Registration Period</label>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setInputMode("days")}
                    className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-all ${
                      inputMode === "days"
                        ? "bg-green-500 text-black"
                        : "bg-white/10 text-gray-400 hover:bg-white/20"
                    }`}
                  >
                    Days
                  </button>
                  <button
                    onClick={() => setInputMode("years")}
                    className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-all ${
                      inputMode === "years"
                        ? "bg-green-500 text-black"
                        : "bg-white/10 text-gray-400 hover:bg-white/20"
                    }`}
                  >
                    Years
                  </button>
                </div>

                {/* Days Input */}
                {inputMode === "days" && (
                  <div className="space-y-2">
                    <input
                      type="number"
                      min="1"
                      max="21900"
                      value={days}
                      onChange={(e) => {
                        const value = Number.parseInt(e.target.value) || 1
                        const clampedValue = Math.max(1, Math.min(21900, value))
                        setDays(clampedValue)
                        setYears(Math.ceil(clampedValue / 365))
                      }}
                      placeholder="Enter days (1-21,900)"
                      className="input-field w-full"
                    />
                    <p className="text-xs text-gray-500">
                      {days} days = {Math.ceil(days / 365)} year{Math.ceil(days / 365) !== 1 ? "s" : ""} (rounded up)
                    </p>
                    <div className="flex gap-1 flex-wrap">
                      {[30, 90, 180, 365, 730, 1095, 1825].map((d) => (
                        <button
                          key={d}
                          onClick={() => {
                            setDays(d)
                            setYears(Math.ceil(d / 365))
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                            days === d
                              ? "bg-green-500 text-black"
                              : "bg-white/10 text-gray-400 hover:bg-white/20"
                          }`}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Years Input */}
                {inputMode === "years" && (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={years}
                        onChange={(e) => {
                          const value = Number.parseInt(e.target.value) || 1
                          const clampedValue = Math.max(1, Math.min(60, value))
                          setYears(clampedValue)
                          setDays(clampedValue * 365)
                        }}
                        className="input-field flex-1"
                      />
                      <div className="flex gap-1">
                        {[1, 5, 10, 20, 60].map((y) => (
                          <button
                            key={y}
                            onClick={() => {
                              setYears(y)
                              setDays(y * 365)
                            }}
                            className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                              years === y
                                ? "bg-green-500 text-black"
                                : "bg-white/10 text-gray-400 hover:bg-white/20"
                            }`}
                          >
                            {y}y
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">{years} year{years !== 1 ? "s" : ""} = {years * 365} days</p>
                  </div>
                )}
              </div>

              {/* Fee Display */}
              <div className="glass-card p-5 bg-gradient-to-br from-white/10 to-white/5 border border-white/20 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-300">Registration Fee</span>
                  {loadingFee ? (
                    <Loader className="w-5 h-5 animate-spin text-green-400" />
                  ) : (
                    <span className="text-2xl font-bold bg-gradient-to-r from-green-400 to-green-500 bg-clip-text text-transparent">
                      {Number.parseFloat(registrationFee).toFixed(2)} USDC
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm text-gray-400 mb-3 pb-3 border-b border-white/10">
                  <span>Your USDC Balance</span>
                  {loadingBalance ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="font-semibold">{Number.parseFloat(usdcBalance).toFixed(2)} USDC</span>
                  )}
                </div>
                {Number.parseFloat(usdcBalance) < Number.parseFloat(registrationFee) && (
                  <div className="mt-3 p-3 rounded-lg bg-red-500/20 border border-red-500/50">
                    <p className="text-sm text-red-400 font-semibold">
                      ⚠️ Insufficient USDC balance. You need{" "}
                      <span className="font-bold">
                        {(Number.parseFloat(registrationFee) - Number.parseFloat(usdcBalance)).toFixed(2)} more USDC
                      </span>
                      .
                    </p>
                  </div>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your wallet password"
                  className="input-field"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (confirmWalletReset()) {
                      clearAllWallets()
                      router.push("/setup")
                    }
                  }}
                  className="mt-2 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Forgot Password? Reset Wallet
                </button>
              </div>

              {/* Register Button */}
              <button
                onClick={handleRegister}
                disabled={
                  registering ||
                  !password ||
                  Number.parseFloat(usdcBalance) < Number.parseFloat(registrationFee)
                }
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 py-4 text-lg font-bold shadow-lg shadow-green-500/30 hover:shadow-green-500/40 transition-all"
              >
                {registering ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Registering Domain...
                  </>
                ) : (
                  <>
                    <Globe className="w-5 h-5" />
                    Register {searchQuery.replace(".pepu", "")}.pepu
                  </>
                )}
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="glass-card p-4 border border-red-500/50 bg-red-500/10">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="glass-card p-4 border border-green-500/50 bg-green-500/10">
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}
        </div>
      </div>

      <BottomNav active="domains" />
    </div>
  )
}

