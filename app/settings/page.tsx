"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  getWallets,
  getWalletState,
  updateActivity,
  lockWallet,
  getPrivateKey,
  getMnemonic,
  encryptData,
  decryptData,
  getAutoLockSeconds,
  setAutoLockSeconds,
  getCurrentWallet,
  deleteWallet,
  clearAllWallets,
} from "@/lib/wallet"
import { deleteAllCookies } from "@/lib/cookies"
import { CURRENCIES, getSavedCurrency, saveCurrency, getDefaultCurrency, type Currency } from "@/lib/currencies"
import { Settings, Lock, Eye, EyeOff, Copy, Check, Trash2, Key, DollarSign } from "lucide-react"
import BottomNav from "@/components/BottomNav"

export default function SettingsPage() {
  const router = useRouter()
  const [wallets, setWallets] = useState<any[]>([])
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [password, setPassword] = useState("")
  const [copied, setCopied] = useState("")
  const [error, setError] = useState("")
  const [showChangePasscode, setShowChangePasscode] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changePasscodeLoading, setChangePasscodeLoading] = useState(false)
  const [changePasscodeSuccess, setChangePasscodeSuccess] = useState("")
  const [autoLockSeconds, setAutoLockSecondsState] = useState<number>(60)
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(getDefaultCurrency())

  useEffect(() => {
    // Check if wallet exists
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    // No password required for viewing settings
    updateActivity()
    setWallets(wallets)

    // Load auto-lock setting
    if (typeof window !== "undefined") {
      setAutoLockSecondsState(getAutoLockSeconds())
      setSelectedCurrency(getSavedCurrency())
    }
  }, [router])

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(""), 2000)
  }

  const handleLock = () => {
    lockWallet()
    router.push("/unlock")
  }

  const handleAutoLockChange = (value: string) => {
    const seconds = Number.parseInt(value, 10)
    if (Number.isNaN(seconds)) return
    setAutoLockSecondsState(seconds)
    setAutoLockSeconds(seconds)
  }

  const handleReset = () => {
    // Use the proper clearAllWallets function instead of localStorage.clear()
    // This ensures we only clear wallet-related data, not everything
    if (confirm("Are you sure? This will delete all wallets, localStorage, and cookies. Make sure you have saved your seed phrases.")) {
      // Clear all wallet data using the proper function
      clearAllWallets()
      
      // Delete all cookies (including unchained_user_id)
      deleteAllCookies()
      
      router.push("/setup")
    }
  }

  const handleChangePasscode = async () => {
    setError("")
    setChangePasscodeSuccess("")

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Please fill all fields")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match")
      return
    }

    if (newPassword.length !== 4) {
      setError("Password must be exactly 4 digits")
      return
    }

    setChangePasscodeLoading(true)
    try {
      const currentWallets = getWallets()
      if (currentWallets.length === 0) throw new Error("No wallet found")

      // Verify current password by trying to decrypt the active wallet
      const active = getCurrentWallet() || currentWallets[0]
      try {
        decryptData(active.encryptedPrivateKey, currentPassword)
      } catch {
        throw new Error("Current password is incorrect")
      }

      // Re-encrypt all wallets with new password
      const updatedWallets = currentWallets.map((wallet) => ({
        ...wallet,
        encryptedPrivateKey: encryptData(decryptData(wallet.encryptedPrivateKey, currentPassword), newPassword),
        encryptedMnemonic: wallet.encryptedMnemonic
          ? encryptData(decryptData(wallet.encryptedMnemonic, currentPassword), newPassword)
          : undefined,
      }))

      localStorage.setItem("unchained_wallets", JSON.stringify(updatedWallets))
      setChangePasscodeSuccess("Passcode changed successfully!")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setShowChangePasscode(false)

      setTimeout(() => setChangePasscodeSuccess(""), 3000)
    } catch (err: any) {
      setError(err.message || "Failed to change passcode")
    } finally {
      setChangePasscodeLoading(false)
    }
  }

  const [privateKey, setPrivateKey] = useState<string | null>(null)
  const [mnemonic, setMnemonic] = useState<string | null>(null)
  const [loadingPrivateKey, setLoadingPrivateKey] = useState(false)
  const [loadingMnemonic, setLoadingMnemonic] = useState(false)

  const loadPrivateKey = () => {
    if (!password || wallets.length === 0) {
      setPrivateKey(null)
      return
    }
    
    setLoadingPrivateKey(true)
    setError("")
    
    try {
      const active = getCurrentWallet() || wallets[0]
      if (!active) {
        setPrivateKey(null)
        setLoadingPrivateKey(false)
        return
      }
      
      const decryptedKey = getPrivateKey(active, password)
      setPrivateKey(decryptedKey)
    } catch (err: any) {
      console.error("Error loading private key:", err)
      setError(err.message || "Invalid password. Please try again.")
      setPrivateKey(null)
    } finally {
      setLoadingPrivateKey(false)
    }
  }

  const loadMnemonic = () => {
    if (!password || wallets.length === 0) {
      setMnemonic(null)
      return
    }
    
    setLoadingMnemonic(true)
    setError("")
    
    try {
      const active = getCurrentWallet() || wallets[0]
      if (!active) {
        setMnemonic(null)
        setLoadingMnemonic(false)
        return
      }
      
      const decryptedMnemonic = getMnemonic(active, password)
      setMnemonic(decryptedMnemonic || "No mnemonic available")
    } catch (err: any) {
      console.error("Error loading mnemonic:", err)
      setError(err.message || "Invalid password. Please try again.")
      setMnemonic(null)
    } finally {
      setLoadingMnemonic(false)
    }
  }

  // Load private key when showPrivateKey becomes true and password is set
  useEffect(() => {
    if (showPrivateKey && password && wallets.length > 0) {
      loadPrivateKey()
    } else if (!showPrivateKey) {
      setPrivateKey(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPrivateKey, password])

  // Load mnemonic when showMnemonic becomes true and password is set
  useEffect(() => {
    if (showMnemonic && password && wallets.length > 0) {
      loadMnemonic()
    } else if (!showMnemonic) {
      setMnemonic(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMnemonic, password])

  const handleDeleteActiveWallet = () => {
    if (wallets.length <= 1) {
      setError("You cannot delete your primary wallet")
      return
    }
    const active = getCurrentWallet() || wallets[0]
    if (wallets[0].id === active.id) {
      setError("You cannot delete your primary wallet")
      return
    }
    try {
      deleteWallet(active.id)
      const updated = getWallets()
      setWallets(updated)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to delete PEPU VAULT WALLET")
    }
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="glass-card rounded-none p-6 border-b border-white/10 sticky top-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <Settings className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Settings</h1>
              <p className="text-sm text-gray-400">Manage your wallet</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8 space-y-6">
          {/* Wallet Info */}
          {wallets.length > 0 && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-bold mb-4">Active PEPU VAULT WALLET</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-400 mb-2">Address</p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-green-400 break-all bg-black/50 p-2 rounded flex-1">
                      {(getCurrentWallet() || wallets[0]).address}
                    </code>
                    <button
                      onClick={() => handleCopy((getCurrentWallet() || wallets[0]).address, "address")}
                      className="p-2 hover:bg-white/10 rounded transition-colors"
                    >
                      {copied === "address" ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-400 mb-2">PEPU VAULT WALLET Name</p>
                  <p className="font-semibold">{(getCurrentWallet() || wallets[0]).name || "My PEPU VAULT WALLET"}</p>
                </div>

                {wallets.length > 1 && (
                  <button
                    onClick={handleDeleteActiveWallet}
                    className="mt-4 w-full px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm font-semibold transition-all"
                  >
                    Delete This Wallet (keeps primary wallet)
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-green-500" />
                <h2 className="text-lg font-bold">Security</h2>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Auto-Lock Timer (seconds)</label>
                <input
                  type="number"
                  min={0}
                  value={autoLockSeconds}
                  onChange={(e) => handleAutoLockChange(e.target.value)}
                  className="input-field"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Set how long of inactivity before the wallet auto-locks. Use 0 to disable auto-lock.
                </p>
              </div>

            {!showChangePasscode ? (
              <button
                onClick={() => setShowChangePasscode(true)}
                className="w-full px-4 py-3 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 font-semibold transition-all"
              >
                Change Passcode
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Current Passcode</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value)
                      setError("")
                    }}
                    placeholder="Enter current passcode"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">New Passcode</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      setError("")
                    }}
                    placeholder="Enter new passcode"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Confirm New Passcode</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      setError("")
                    }}
                    placeholder="Confirm new passcode"
                    className="input-field"
                  />
                </div>

                {error && (
                  <div className="glass-card p-3 border border-red-500/50 bg-red-500/10">
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}

                {changePasscodeSuccess && (
                  <div className="glass-card p-3 border border-green-500/50 bg-green-500/10">
                    <p className="text-green-400 text-sm">{changePasscodeSuccess}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleChangePasscode}
                    disabled={changePasscodeLoading}
                    className="flex-1 px-4 py-3 rounded-lg bg-green-500 text-black hover:bg-green-600 font-semibold transition-all disabled:opacity-50"
                  >
                    {changePasscodeLoading ? "Updating..." : "Update Passcode"}
                  </button>
                  <button
                    onClick={() => {
                      setShowChangePasscode(false)
                      setCurrentPassword("")
                      setNewPassword("")
                      setConfirmPassword("")
                      setError("")
                    }}
                    className="flex-1 px-4 py-3 rounded-lg bg-white/10 text-gray-400 hover:bg-white/20 font-semibold transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>

          {/* Currency Settings */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-500" />
                <h2 className="text-lg font-bold">Display Currency</h2>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Select Currency</label>
                <select
                  value={selectedCurrency.code}
                  onChange={(e) => {
                    const currency = CURRENCIES.find((c) => c.code === e.target.value) || getDefaultCurrency()
                    setSelectedCurrency(currency)
                    saveCurrency(currency)
                    // Reload page to update all balances
                    window.location.reload()
                  }}
                  className="fancy-select"
                >
                  {CURRENCIES.map((currency) => (
                    <option 
                      key={currency.code} 
                      value={currency.code}
                    >
                      {currency.symbol} {currency.name} ({currency.code.toUpperCase()})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Your portfolio balance will be displayed in the selected currency.
                </p>
              </div>
            </div>
          </div>

          {/* Recovery Section */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-bold mb-4">Recovery Keys</h2>
            <p className="text-sm text-gray-400 mb-4">
              Enter your password to view your private key and seed phrase. Store these safely!
            </p>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError("")
                }}
                placeholder="Enter your password"
                className="input-field"
              />
            </div>

            {error && !showChangePasscode && (
              <div className="mb-4 glass-card p-3 border border-red-500/50 bg-red-500/10">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Private Key */}
            <div className="mb-4">
              <button
                onClick={() => {
                  setShowPrivateKey(!showPrivateKey)
                  if (!showPrivateKey && !password) {
                    setError("Please enter your password first")
                  }
                }}
                className="flex items-center gap-2 text-green-400 hover:text-green-300 mb-2"
              >
                {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showPrivateKey ? "Hide" : "Show"} Private Key
              </button>
              {showPrivateKey && (
                <>
                  {loadingPrivateKey ? (
                    <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      Loading private key...
                    </div>
                  ) : privateKey ? (
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-yellow-400 break-all bg-black/50 p-2 rounded flex-1">
                        {privateKey}
                      </code>
                      <button
                        onClick={() => handleCopy(privateKey, "key")}
                        className="p-2 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                      >
                        {copied === "key" ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  ) : password ? (
                    <p className="text-xs text-red-400">Failed to load private key. Please check your password.</p>
                  ) : (
                    <p className="text-xs text-gray-400">Please enter your password above to view your private key.</p>
                  )}
                </>
              )}
            </div>

            {/* Mnemonic */}
            <div>
              <button
                onClick={() => {
                  setShowMnemonic(!showMnemonic)
                  if (!showMnemonic && !password) {
                    setError("Please enter your password first")
                  }
                }}
                className="flex items-center gap-2 text-green-400 hover:text-green-300 mb-2"
              >
                {showMnemonic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showMnemonic ? "Hide" : "Show"} Seed Phrase
              </button>
              {showMnemonic && (
                <>
                  {loadingMnemonic ? (
                    <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      Loading seed phrase...
                    </div>
                  ) : mnemonic ? (
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-yellow-400 break-all bg-black/50 p-2 rounded flex-1">
                        {mnemonic}
                      </code>
                      <button
                        onClick={() => handleCopy(mnemonic, "seed")}
                        className="p-2 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                      >
                        {copied === "seed" ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  ) : password ? (
                    <p className="text-xs text-red-400">Failed to load seed phrase. Please check your password.</p>
                  ) : (
                    <p className="text-xs text-gray-400">Please enter your password above to view your seed phrase.</p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="glass-card p-6 space-y-3">
            <button onClick={handleLock} className="w-full flex items-center justify-center gap-2 btn-secondary">
              <Lock className="w-4 h-4" />
              Lock Wallet
            </button>

            <button
              onClick={handleReset}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Reset Wallet
            </button>
          </div>

          {/* Info */}
          <div className="glass-card p-4 text-sm text-gray-400">
            <p>
              Never share your private key or seed phrase with anyone. This wallet is non-custodial - only you have
              access to your keys.
            </p>
          </div>
        </div>
      </div>

      <BottomNav active="settings" />
    </div>
  )
}
