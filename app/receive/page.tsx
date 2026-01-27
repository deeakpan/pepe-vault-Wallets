"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWallets, getWalletState, updateActivity, getCurrentWallet } from "@/lib/wallet"
import { getUnchainedProvider } from "@/lib/provider"
import { Copy, Check } from "lucide-react"
import { QRCodeCanvas } from "qrcode.react"
import BottomNav from "@/components/BottomNav"

export default function ReceivePage() {
  const router = useRouter()
  const [address, setAddress] = useState("")
  const [chainId, setChainId] = useState(() => {
    // Initialize from localStorage or default to PEPU
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selected_chain")
      return saved ? Number(saved) : 97741
    }
    return 97741
  })
  const [copied, setCopied] = useState(false)

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

    // No password required for receive page
    updateActivity()
    const wallet = getCurrentWallet() || wallets[0]
    if (wallet) {
      setAddress(wallet.address)
    }
  }, [router, chainId])

  const handleCopy = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-md mx-auto pt-8 px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold gradient-text mb-2">Receive Tokens</h1>
          <p className="text-gray-400">Share your wallet address</p>
        </div>

        {/* Chain Selector */}
        <div className="glass-card p-4 mb-6">
          <label className="block text-sm text-gray-400 mb-3">Network</label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const newChainId = 1
                setChainId(newChainId)
                localStorage.setItem("selected_chain", newChainId.toString())
                const provider = getUnchainedProvider()
                provider.setChainId(newChainId)
              }}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all flex-1 ${
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
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all flex-1 ${
                chainId === 97741 ? "bg-green-500 text-black" : "bg-white/10 text-gray-400 hover:bg-white/20"
              }`}
            >
              PEPU
            </button>
          </div>
        </div>

        {/* QR Code */}
        <div className="glass-card p-8 mb-6 flex justify-center">
          {address && (
            <QRCodeCanvas
              value={`ethereum:${address}`}
              size={256}
              level="H"
              includeMargin={true}
              fgColor="#00ff88"
              bgColor="#0a0a0a"
            />
          )}
        </div>

        {/* Address Display */}
        <div className="glass-card p-4 mb-6">
          <p className="text-sm text-gray-400 mb-3">Your Address</p>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-green-400 break-all flex-1">{address}</code>
            <button onClick={handleCopy} className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="glass-card p-4 border border-green-500/20">
          <p className="text-sm text-gray-400">
            Share this address to receive tokens. Make sure to use the correct network.
          </p>
        </div>
      </div>

      <BottomNav active="send" />
    </div>
  )
}
