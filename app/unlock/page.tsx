"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { unlockWallet, clearAllWallets, confirmWalletReset } from "@/lib/wallet"
import { Eye, EyeOff, RotateCcw } from "lucide-react"

export default function UnlockPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleUnlock = async () => {
    if (!password) {
      setError("Please enter your password")
      return
    }

    setLoading(true)
    try {
      const success = unlockWallet(password)
      if (success) {
        router.push("/dashboard")
      } else {
        setError("Invalid password")
      }
    } catch (err) {
      setError("Error unlocking wallet")
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    if (confirmWalletReset()) {
      clearAllWallets()
      router.push("/setup")
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold gradient-text">Unlock Wallet</h1>
          <p className="text-gray-400 mt-2">Enter your password to continue</p>
        </div>

        <div className="glass-card p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleUnlock()}
                placeholder="Enter your password"
                className="input-field pr-10"
                autoFocus
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-green-500"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button onClick={handleUnlock} disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? "Unlocking..." : "Unlock"}
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="w-full mt-3 px-4 py-2 text-sm text-red-400 hover:text-red-300 border border-red-400/30 rounded-lg hover:bg-red-400/10 transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Wallet (Forgot Password)
          </button>
        </div>
      </div>
    </div>
  )
}
