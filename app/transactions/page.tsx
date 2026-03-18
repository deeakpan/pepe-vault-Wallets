"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWallets, updateActivity } from "@/lib/wallet"
import { getTxHistory, type HistoryTx } from "@/lib/txHistory"
import {
  ExternalLink, ArrowLeft, Clock, Send, Zap, ArrowRightLeft, RefreshCw,
} from "lucide-react"
import Link from "next/link"
import BottomNav from "@/components/BottomNav"

/* ── tx type icon ─────────────────────────────────────────── */
const TxIcon = ({ type }: { type: string }) => {
  const map: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
    swap:   { icon: <ArrowRightLeft style={{ width: 16, height: 16 }} />, bg: "rgba(0,255,136,0.12)",   color: "#00ff88" },
    send:   { icon: <Send           style={{ width: 16, height: 16 }} />, bg: "rgba(255,255,255,0.08)", color: "#fff"    },
    bridge: { icon: <Zap            style={{ width: 16, height: 16 }} />, bg: "rgba(139,92,246,0.12)",  color: "#8b5cf6" },
  }
  const c = map[type] ?? { icon: <Clock style={{ width: 16, height: 16 }} />, bg: "rgba(255,255,255,0.06)", color: "#555" }
  return (
    <div style={{ width: 40, height: 40, borderRadius: 14, background: c.bg, color: c.color,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {c.icon}
    </div>
  )
}

/* ── chain badge ──────────────────────────────────────────── */
const ChainBadge = ({ chainId }: { chainId: number }) => {
  const label = chainId === 1 ? "ETH" : chainId === 97741 ? "PEPU" : "?"
  const color = chainId === 1 ? "#627eea" : "#00ff88"
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
      background: `${color}18`, color, border: `1px solid ${color}30`,
    }}>
      {label}
    </span>
  )
}

/* ── helpers ──────────────────────────────────────────────── */
const shortHash = (h: string) => h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "—"

const formatDate = (ts: number) => {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return "Just now"
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

const getExplorer = (tx: HistoryTx) => {
  if (tx.explorerUrl) return tx.explorerUrl
  if (tx.chainId === 1) return `https://etherscan.io/tx/${tx.hash}`
  return `https://pepuscan.com/tx/${tx.hash}`
}

const TABS = [
  { id: 97741, label: "PEPU",     color: "#00ff88" },
  { id: 1,     label: "Ethereum", color: "#627eea" },
  { id: 0,     label: "All",      color: "#aaa"    },
]

export default function TransactionsPage() {
  const router = useRouter()
  const [all, setAll]         = useState<HistoryTx[]>([])
  const [chainId, setChainId] = useState(97741)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const wallets = getWallets()
    if (wallets.length === 0) { router.push("/setup"); return }
    updateActivity()
    load()
  }, [router])

  const load = () => {
    setLoading(true)
    try {
      setAll(getTxHistory())
    } catch {
      setAll([])
    }
    setLoading(false)
  }

  // Filter by chain (0 = show all)
  const txs = chainId === 0
    ? all
    : all.filter((tx) => tx.chainId === chainId)

  /* ── render ───────────────────────────────────────────────── */
  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "#fff", paddingBottom: 100 }}>

      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center gap-3 px-4 py-4"
        style={{ background: "rgba(0,0,0,0.95)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/dashboard"
          className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0"
          style={{ background: "#111" }}>
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-bold">Activity</h1>
          <p className="text-xs" style={{ color: "#555" }}>Your transaction history</p>
        </div>
        <button onClick={load}
          className="flex items-center justify-center w-9 h-9 rounded-xl"
          style={{ background: "#111" }}>
          <RefreshCw style={{ width: 15, height: 15, color: "#555" }}
            className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="px-4 pt-4 pb-4 space-y-4 max-w-lg mx-auto">

        {/* Chain filter tabs */}
        <div className="flex rounded-2xl p-1 gap-1" style={{ background: "#111" }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setChainId(t.id)}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
              style={chainId === t.id
                ? { background: "#000", color: t.color, border: `1px solid ${t.color}30` }
                : { color: "#555" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tx list */}
        {loading ? (
          <div className="flex flex-col items-center py-20 gap-3">
            <RefreshCw style={{ width: 22, height: 22, color: "#00ff88" }} className="animate-spin" />
            <p className="text-sm" style={{ color: "#555" }}>Loading…</p>
          </div>

        ) : txs.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-3 rounded-3xl"
            style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-center w-16 h-16 rounded-full"
              style={{ background: "rgba(255,255,255,0.05)" }}>
              <Clock style={{ width: 28, height: 28, color: "#333" }} />
            </div>
            <p className="font-semibold" style={{ color: "#555" }}>No transactions yet</p>
            <p className="text-sm text-center px-8" style={{ color: "#333" }}>
              {all.length > 0
                ? "No transactions on this chain — try switching to All"
                : "Send, swap or bridge to see your activity here"}
            </p>
            {all.length > 0 && chainId !== 0 && (
              <button onClick={() => setChainId(0)}
                className="text-xs font-bold px-4 py-2 rounded-xl"
                style={{ background: "rgba(0,255,136,0.1)", color: "#00ff88" }}>
                Show All Chains
              </button>
            )}
          </div>

        ) : (
          <div className="rounded-3xl overflow-hidden"
            style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)" }}>
            {txs.map((tx, i) => (
              <div key={`${tx.hash}-${i}`}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderBottom: i < txs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>

                <TxIcon type={tx.type} />

                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold capitalize">{tx.type}</span>
                    {chainId === 0 && <ChainBadge chainId={tx.chainId} />}
                  </div>

                  {/* Send: recipient + amount */}
                  {tx.type === "send" && (
                    <>
                      {tx.to && (
                        <p className="text-xs font-mono truncate" style={{ color: "#555" }}>
                          → {tx.to.slice(0, 10)}…{tx.to.slice(-6)}
                        </p>
                      )}
                      {tx.amount && tx.token && (
                        <p className="text-xs font-semibold mt-0.5" style={{ color: "#aaa" }}>
                          {Number(tx.amount).toFixed(4)} {tx.token}
                        </p>
                      )}
                    </>
                  )}

                  {/* Swap: token pair + amounts */}
                  {tx.type === "swap" && (
                    <>
                      {tx.fromToken && tx.toToken && (
                        <p className="text-xs font-semibold" style={{ color: "#aaa" }}>
                          {tx.fromToken} → {tx.toToken}
                        </p>
                      )}
                      {tx.amountIn && tx.amountOut && (
                        <p className="text-xs" style={{ color: "#555" }}>
                          {Number(tx.amountIn).toFixed(4)} → {Number(tx.amountOut).toFixed(4)}
                        </p>
                      )}
                    </>
                  )}

                  {/* Hash + time */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs font-mono" style={{ color: "#333" }}>
                      {shortHash(tx.hash)}
                    </span>
                    <span style={{ color: "#222" }}>·</span>
                    <span className="text-xs" style={{ color: "#444" }}>
                      {formatDate(tx.timestamp)}
                    </span>
                  </div>
                </div>

                {/* Explorer link */}
                <a href={getExplorer(tx)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0"
                  style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.15)" }}
                  title="View on explorer">
                  <ExternalLink style={{ width: 14, height: 14, color: "#00ff88" }} />
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Total count */}
        {!loading && all.length > 0 && (
          <p className="text-center text-xs" style={{ color: "#333" }}>
            {all.length} transaction{all.length !== 1 ? "s" : ""} stored
          </p>
        )}
      </div>

      <BottomNav active="transactions" />
    </div>
  )
}
