"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createWallet, addWallet, getMnemonic, importWalletFromMnemonic, importWalletFromPrivateKey, getWallets, unlockWallet } from "@/lib/wallet"
import { Eye, EyeOff, Copy } from "lucide-react"
import Image from "next/image"

type SetupMode = "menu" | "create" | "import-seed" | "import-key"

export default function SetupPage() {
  const router = useRouter()
  
  useEffect(() => {
    // If wallet already exists, redirect to dashboard
    const wallets = getWallets()
    if (wallets.length > 0) {
      router.push("/dashboard")
    }
  }, [router])
  const [mode, setMode] = useState<SetupMode>("menu")
  const [password, setPassword] = useState("")
  const [walletName, setWalletName] = useState("")
  const [seedPhrase, setSeedPhrase] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [derivedAddress, setDerivedAddress] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [mnemonic, setMnemonic] = useState("")
  const [quizIndices, setQuizIndices] = useState<number[]>([])
  const [quizAnswers, setQuizAnswers] = useState<string[]>([])
  const [quizError, setQuizError] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleCreateWallet = async () => {
    if (!password || password.length < 4) {
      setError("Password must be exactly 4 digits")
      return
    }

    setLoading(true)
    try {
      const wallet = await createWallet(password, walletName || "My PEPU VAULT WALLET", 1)
      
      // Save wallet to localStorage immediately
      addWallet(wallet)
      
      // Verify wallet was saved by reading it back
      const savedWallets = getWallets()
      const saved = savedWallets.find(w => w.id === wallet.id)
      if (!saved) {
        throw new Error("Failed to save PEPU VAULT WALLET - PEPU VAULT WALLET not found after save")
      }
      
      // Auto-unlock using the same password so signing doesn't require /unlock
      unlockWallet(password)
      
      const mnemonic = getMnemonic(wallet, password)
      setMnemonic(mnemonic || "")
      
      // Prepare quiz
      if (mnemonic) {
        const words = mnemonic.split(" ")
        // Pick 3 random unique indices
        const indices = new Set<number>()
        while (indices.size < 3 && indices.size < words.length) {
          indices.add(Math.floor(Math.random() * words.length))
        }
        setQuizIndices(Array.from(indices))
        setQuizAnswers(Array.from(indices).map(() => ""))
      }
      setMode("menu")
    } catch (err: any) {
      console.error("[Setup] Error creating wallet:", err)
      setError(err.message || "Failed to create PEPU VAULT WALLET. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleImportSeed = async () => {
    if (!seedPhrase || !password) {
      setError("Please enter both seed phrase and password")
      return
    }

    setLoading(true)
    try {
      const wallet = await importWalletFromMnemonic(seedPhrase.trim(), password, walletName || "Imported PEPU VAULT WALLET", 1)
      
      // Save wallet to localStorage immediately
      addWallet(wallet)
      
      // Verify wallet was saved by reading it back
      const savedWallets = getWallets()
      const saved = savedWallets.find(w => w.id === wallet.id)
      if (!saved) {
        throw new Error("Failed to save PEPU VAULT WALLET - PEPU VAULT WALLET not found after save")
      }
      
      // Auto-unlock so signing doesn't require /unlock
      unlockWallet(password)
      setSeedPhrase("")
      setWalletName("")
      setPassword("")
      router.push("/dashboard")
    } catch (err: any) {
      console.error("[Setup] Error importing seed:", err)
      setError(err.message || "Failed to import seed phrase")
    } finally {
      setLoading(false)
    }
  }

  const handleImportPrivateKey = async () => {
    if (!privateKey || !password) {
      setError("Please enter both private key and password")
      return
    }

    setLoading(true)
    try {
      const wallet = await importWalletFromPrivateKey(privateKey.trim(), password, walletName || "Imported PEPU VAULT WALLET", 1)
      
      // Save wallet to localStorage immediately
      addWallet(wallet)
      
      // Verify wallet was saved by reading it back
      const savedWallets = getWallets()
      const saved = savedWallets.find(w => w.id === wallet.id)
      if (!saved) {
        throw new Error("Failed to save PEPU VAULT WALLET - PEPU VAULT WALLET not found after save")
      }
      
      // Auto-unlock so signing doesn't require /unlock
      unlockWallet(password)
      setPrivateKey("")
      setWalletName("")
      setPassword("")
      router.push("/dashboard")
    } catch (err: any) {
      console.error("[Setup] Error importing private key:", err)
      setError(err.message || "Failed to import private key")
    } finally {
      setLoading(false)
    }
  }

  const proceedToDashboard = () => {
    router.push("/dashboard")
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo - PEPU VAULT */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image src="/pepu-vault-logo.png" alt="PEPU VAULT Logo" width={64} height={64} className="w-16 h-16" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">PEPU VAULT</h1>
          <p className="text-gray-400 mt-2">Non-Custodial PEPU VAULT WALLET</p>
        </div>

        {/* Menu Mode */}
        {mode === "menu" && !mnemonic && (
          <div className="space-y-4">
            <button
              onClick={() => {
                setMode("create")
                setError("")
              }}
              className="btn-primary w-full"
            >
              Create New PEPU VAULT WALLET
            </button>
            <button
              onClick={() => {
                setMode("import-seed")
                setError("")
              }}
              className="btn-secondary w-full"
            >
              Import Seed Phrase
            </button>
            <button
              onClick={() => {
                setMode("import-key")
                setError("")
              }}
              className="btn-secondary w-full"
            >
              Import Private Key
            </button>
          </div>
        )}

        {/* Create Mode */}
        {mode === "create" && !mnemonic && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">PEPU VAULT WALLET Name (Optional)</label>
              <input
                type="text"
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                placeholder="My Wallet"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a secure password"
                  className="input-field pr-10"
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-green-500"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleCreateWallet} disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? "Creating..." : "Create PEPU VAULT WALLET"}
            </button>
            <button
              onClick={() => {
                setMode("menu")
                setError("")
              }}
              className="btn-secondary w-full"
            >
              Back
            </button>
          </div>
        )}

        {/* Import Seed Phrase */}
        {mode === "import-seed" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">PEPU VAULT WALLET Name (Optional)</label>
              <input
                type="text"
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                placeholder="My Imported PEPU VAULT WALLET"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Seed Phrase</label>
              <textarea
                value={seedPhrase}
                onChange={(e) => setSeedPhrase(e.target.value)}
                placeholder="Enter your 12 or 24 word seed phrase"
                className="input-field min-h-[100px]"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Passcode (4 digits)</label>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={4}
                placeholder="Enter a 4-digit passcode"
                className="input-field"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleImportSeed} disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? "Importing..." : "Import Seed Phrase"}
            </button>
            <button
              onClick={() => {
                setMode("menu")
                setError("")
              }}
              className="btn-secondary w-full"
            >
              Back
            </button>
          </div>
        )}

        {/* Import Private Key */}
        {mode === "import-key" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">PEPU VAULT WALLET Name (Optional)</label>
              <input
                type="text"
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                placeholder="My Imported PEPU VAULT WALLET"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Private Key</label>
              <textarea
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="Enter your private key"
                className="input-field min-h-[80px]"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Passcode (4 digits)</label>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={4}
                placeholder="Enter a 4-digit passcode"
                className="input-field"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleImportPrivateKey}
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? "Importing..." : "Import Private Key"}
            </button>
            <button
              onClick={() => {
                setMode("menu")
                setError("")
              }}
              className="btn-secondary w-full"
            >
              Back
            </button>
          </div>
        )}

        {/* Mnemonic Display + Backup Quiz */}
        {mnemonic && (
          <div className="space-y-4">
            <div className="glass-card p-6">
              <h2 className="text-lg font-bold mb-4">Save Your Seed Phrase</h2>
              <p className="text-sm text-gray-400 mb-4">
                This is your wallet backup. Store it safely - anyone with this phrase can access your wallet.
              </p>
              <div className="bg-black/50 rounded-lg p-4 mb-4 border border-green-500/20">
                <p className="text-sm text-white font-mono break-words">{mnemonic}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(mnemonic)
                }}
                className="flex items-center gap-2 text-green-500 hover:text-green-400 text-sm"
              >
                <Copy className="w-4 h-4" />
                Copy to clipboard
              </button>
            </div>
            {quizIndices.length > 0 && (
              <div className="glass-card p-6 space-y-3">
                <h3 className="font-semibold text-sm mb-2">Verify Your Backup</h3>
                <p className="text-xs text-gray-400 mb-2">
                  Enter the correct words from your seed phrase to confirm you backed it up.
                </p>
                {quizIndices.map((index, i) => (
                  <div key={index}>
                    <label className="block text-xs text-gray-400 mb-1">{`Word #${index + 1}`}</label>
                    <input
                      type="text"
                      value={quizAnswers[i] || ""}
                      onChange={(e) => {
                        const next = [...quizAnswers]
                        next[i] = e.target.value
                        setQuizAnswers(next)
                        setQuizError("")
                      }}
                      className="input-field"
                    />
                  </div>
                ))}
                {quizError && <p className="text-xs text-red-400">{quizError}</p>}
                <button
                  onClick={() => {
                    const words = mnemonic.split(" ")
                    const allCorrect = quizIndices.every((idx, i) => {
                      return (quizAnswers[i] || "").trim().toLowerCase() === words[idx].toLowerCase()
                    })
                    if (!allCorrect) {
                      setQuizError("Incorrect words. Please check your seed phrase and try again.")
                      return
                    }
                    proceedToDashboard()
                  }}
                  className="btn-primary w-full"
                >
                  Continue
            </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
