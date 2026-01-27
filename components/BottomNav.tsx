"use client"

import Link from "next/link"
import { Wallet, Send, Globe, Settings, ImageIcon, Hash } from "lucide-react"
import { useState, useEffect } from "react"

interface BottomNavProps {
  active?: string
}

export default function BottomNav({ active = "dashboard" }: BottomNavProps) {
  const [chainId, setChainId] = useState(97741)

  useEffect(() => {
    // Get current chain from localStorage if available
    const stored = localStorage.getItem("selected_chain")
    if (stored) {
      setChainId(Number(stored))
    }
  }, [])

  const isActive = (page: string) => (active === page ? "text-green-500" : "text-gray-400 hover:text-green-500")

  return (
    <div className="fixed bottom-0 left-0 right-0 glass-card rounded-t-3xl border-t border-white/10 border-b-0">
      <div className="max-w-6xl mx-auto px-0.5">
        <div className="flex items-center justify-between py-1.5 flex-nowrap">
          <Link
            href="/dashboard"
            className={`flex flex-col items-center gap-0 transition-colors flex-shrink-0 flex-1 min-w-0 ${isActive("dashboard")}`}
          >
            <Wallet className="w-3 h-3" />
            <span className="text-[8px] font-semibold leading-tight">Wallet</span>
          </Link>

          {chainId === 97741 && (
            <Link
              href="/domains"
              className={`flex flex-col items-center gap-0 transition-colors flex-shrink-0 flex-1 min-w-0 ${isActive("domains")}`}
            >
              <Hash className="w-3 h-3" />
              <span className="text-[8px] font-semibold leading-tight">Domains</span>
            </Link>
          )}

          {chainId === 97741 && (
            <Link
              href="/browser"
              className={`flex flex-col items-center gap-0 transition-colors flex-shrink-0 flex-1 min-w-0 ${isActive("browser")}`}
            >
              <Globe className="w-3 h-3" />
              <span className="text-[8px] font-semibold leading-tight">Browser</span>
            </Link>
          )}

          {chainId === 97741 && (
            <Link href="/nfts" className={`flex flex-col items-center gap-0 transition-colors flex-shrink-0 flex-1 min-w-0 ${isActive("nfts")}`}>
              <ImageIcon className="w-3 h-3" />
              <span className="text-[8px] font-semibold leading-tight">NFTs</span>
            </Link>
          )}

          <Link href="/send" className={`flex flex-col items-center gap-0 transition-colors flex-shrink-0 flex-1 min-w-0 ${isActive("send")}`}>
            <Send className="w-3 h-3" />
            <span className="text-[8px] font-semibold leading-tight">Send</span>
          </Link>

          <Link
            href="/settings"
            className={`flex flex-col items-center gap-0 transition-colors flex-shrink-0 flex-1 min-w-0 ${isActive("settings")}`}
          >
            <Settings className="w-3 h-3" />
            <span className="text-[8px] font-semibold leading-tight">Settings</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
