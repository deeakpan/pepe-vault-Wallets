"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWallets } from "@/lib/wallet"
import { getUnchainedProvider, type ConnectedDApp } from "@/lib/provider"
import { Trash2, ExternalLink, Plus, Sparkles } from "lucide-react"
import Link from "next/link"
import BottomNav from "@/components/BottomNav"

const NATIVE_PEPU_DAPPS = [
  { name: "PepuLock Locker", url: "https://www.pepulock.com/lock", icon: "🔒" },
  { name: "PepuLock Vesting", url: "https://www.pepulock.com/vest", icon: "⏰" },
  { name: "CKOMFarm", url: "https://ckomfarm.com", icon: "🚜" },
  { name: "PepuSwap", url: "https://pepuswap.com", icon: "💱" },
  { name: "PepuBridge", url: "https://pepubridge.com", icon: "🌉" },
  { name: "Unchained.cards", url: "https://unchained.cards", icon: "🃏" },
]

export default function DAppsPage() {
  const router = useRouter()
  const [connectedDApps, setConnectedDApps] = useState<ConnectedDApp[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if wallet exists
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    // No password required to enter page
    const provider = getUnchainedProvider()
    setConnectedDApps(provider.getConnectedDApps())
    setLoading(false)
  }, [router])

  const handleDisconnect = (id: string) => {
    const provider = getUnchainedProvider()
    provider.removeConnectedDApp(id)
    setConnectedDApps(provider.getConnectedDApps())
  }

  const handleAddDApp = (origin: string, name: string) => {
    const provider = getUnchainedProvider()
    provider.addConnectedDApp(origin, name)
    setConnectedDApps(provider.getConnectedDApps())
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Header */}
      <div className="glass-card rounded-none p-6 border-b border-white/10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold gradient-text">Connected Apps</h1>
            <p className="text-sm text-gray-400">Manage your wallet connections</p>
          </div>
          <Link
            href="/browser"
            className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Browse Apps
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 mt-8 space-y-8">
        {/* Native PEPU DApps Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-bold text-white">Native PEPU DApps</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {NATIVE_PEPU_DAPPS.map((dapp) => (
              <a
                key={dapp.name}
                href={dapp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-card p-5 hover:bg-white/10 transition-all group cursor-pointer"
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl">{dapp.icon}</div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1 group-hover:text-green-400 transition-colors">
                      {dapp.name}
                    </h3>
                    <p className="text-xs text-gray-400 break-all">{dapp.url}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-green-400 transition-colors flex-shrink-0 mt-1" />
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Connected DApps Section */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner"></div>
          </div>
        ) : connectedDApps.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-gray-400 mb-4">No connected apps yet</p>
            <Link
              href="/browser"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-black font-bold rounded-xl transition-all hover:scale-105"
            >
              <Plus className="w-5 h-5" />
              Explore Apps
            </Link>
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
              <span>{connectedDApps.length} Connected</span>
            </h2>
            <div className="space-y-3">
              {connectedDApps.map((dapp) => (
                <div
                  key={dapp.id}
                  className="glass-card p-4 flex items-center justify-between hover:bg-white/10 transition-all"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">{dapp.name}</h3>
                    <p className="text-xs text-gray-400 break-all">{dapp.origin}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      Connected {new Date(dapp.connectedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={dapp.origin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                      title="Open App"
                    >
                      <ExternalLink className="w-5 h-5 text-blue-400" />
                    </a>
                    <button
                      onClick={() => handleDisconnect(dapp.id)}
                      className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                      title="Disconnect"
                    >
                      <Trash2 className="w-5 h-5 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomNav active="dapps" />
    </div>
  )
}
