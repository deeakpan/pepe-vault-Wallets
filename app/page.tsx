"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWallets, getWalletState, lockWallet } from "@/lib/wallet"

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    // Check if wallet exists and redirect accordingly
    // No password required to access pages
    const wallets = getWallets()

    if (wallets.length === 0) {
      router.push("/setup")
    } else {
      router.push("/dashboard")
    }
  }, [router])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="spinner mx-auto mb-4"></div>
        <p className="text-gray-400">Loading wallet...</p>
      </div>
    </div>
  )
}
