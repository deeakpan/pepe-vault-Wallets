"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWallets, updateActivity, getCurrentWallet } from "@/lib/wallet"
import { getUnchainedProvider } from "@/lib/provider"
import { Copy, Check, ArrowLeft, Share2 } from "lucide-react"
import { QRCodeCanvas } from "qrcode.react"
import BottomNav from "@/components/BottomNav"
import Link from "next/link"

export default function ReceivePage() {
  const router = useRouter()
  const [address, setAddress] = useState("")
  const [walletName, setWalletName] = useState("")
  const [chainId, setChainId] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selected_chain")
      return saved ? Number(saved) : 97741
    }
    return 97741
  })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const wallets = getWallets()
    if (wallets.length === 0) { router.push("/setup"); return }

    const saved = localStorage.getItem("selected_chain")
    if (saved && Number(saved) !== chainId) setChainId(Number(saved))

    const provider = getUnchainedProvider()
    provider.setChainId(chainId)

    updateActivity()
    const wallet = getCurrentWallet() || wallets[0]
    if (wallet) {
      setAddress(wallet.address)
      setWalletName(wallet.name || "My Wallet")
    }
  }, [router, chainId])

  const handleCopy = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const switchChain = (id: number) => {
    setChainId(id)
    localStorage.setItem("selected_chain", id.toString())
    const provider = getUnchainedProvider()
    provider.setChainId(id)
  }

  const networkName = chainId === 1 ? "Ethereum" : "PEPU Chain"
  const networkColor = chainId === 1 ? "#627eea" : "#00ff88"

  return (
    <div className="min-h-screen pb-28 text-white" style={{ background: "#13141a" }}>

      {/* ── Header ── */}
      <div
        className="sticky top-0 z-40 flex items-center gap-3 px-5 py-4"
        style={{ background: "rgba(19,20,26,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Link
          href="/dashboard"
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-bold">Receive</h1>
          <p className="text-xs" style={{ color: "#6b7280" }}>Share your address</p>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 pt-6 flex flex-col items-center gap-6">

        {/* ── Network pill ── */}
        <div
          className="flex rounded-2xl p-1 gap-1 self-stretch"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {[{ id: 1, label: "Ethereum", color: "#627eea" }, { id: 97741, label: "PEPU", color: "#00ff88" }].map((n) => (
            <button
              key={n.id}
              onClick={() => switchChain(n.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={
                chainId === n.id
                  ? { background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.1)", color: n.color }
                  : { color: "#6b7280" }
              }
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: n.color }} />
              {n.label}
            </button>
          ))}
        </div>

        {/* ── QR Card ── */}
        <div
          className="w-full rounded-3xl p-6 flex flex-col items-center gap-5"
          style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {/* wallet info */}
          <div className="flex flex-col items-center gap-1 text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg mb-1"
              style={{ background: "linear-gradient(135deg,#00ff88,#00cc6a)", color: "#13141a" }}
            >
              {walletName[0]?.toUpperCase() || "W"}
            </div>
            <p className="font-semibold">{walletName}</p>
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: networkColor }} />
              <span className="text-xs font-medium" style={{ color: "#9ca3af" }}>{networkName}</span>
            </div>
          </div>

          {/* QR code */}
          {address && (
            <div
              className="p-4 rounded-2xl"
              style={{ background: "#fff" }}
            >
              <QRCodeCanvas
                value={`ethereum:${address}`}
                size={200}
                level="H"
                includeMargin={false}
                fgColor="#13141a"
                bgColor="#ffffff"
              />
            </div>
          )}

          {/* address */}
          <div className="w-full">
            <p className="text-xs font-semibold mb-2 text-center" style={{ color: "#6b7280" }}>Your Address</p>
            <div
              className="rounded-2xl p-3 flex items-center gap-2"
              style={{ background: "#0e0f17", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <code
                className="flex-1 text-xs font-mono break-all leading-relaxed"
                style={{ color: "#00ff88" }}
              >
                {address}
              </code>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
                style={{ background: copied ? "rgba(0,255,136,0.15)" : "rgba(255,255,255,0.12)", border: copied ? "1px solid rgba(0,255,136,0.3)" : "1px solid rgba(255,255,255,0.2)", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}
              >
                {copied
                  ? <Check className="w-4 h-4" style={{ color: "#00ff88" }} />
                  : <Copy className="w-4 h-4" style={{ color: "#9ca3af" }} />}
              </button>
            </div>
          </div>
        </div>

        {/* ── Copy button ── */}
        <button
          onClick={handleCopy}
          className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
          style={
            copied
              ? { background: "rgba(0,255,136,0.15)", border: "1px solid rgba(0,255,136,0.3)", color: "#00ff88", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }
              : { background: "#00ff88", color: "#0a0b0d", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }
          }
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied to Clipboard!" : "Copy Address"}
        </button>

        {/* ── Info banner ── */}
        <div
          className="w-full rounded-2xl p-4 text-center"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-xs leading-relaxed" style={{ color: "#6b7280" }}>
            Only send <strong style={{ color: "#9ca3af" }}>{networkName}</strong> compatible tokens to this address.
            Sending tokens on the wrong network may result in permanent loss.
          </p>
        </div>
      </div>

      <BottomNav active="send" />
    </div>
  )
}
