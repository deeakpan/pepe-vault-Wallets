"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ArrowLeft, Plus, Trash2, RefreshCw, CheckCircle2,
  XCircle, Clock, Copy, ChevronDown, Send,
} from "lucide-react"
import Link from "next/link"
import { ethers } from "ethers"
import { getCurrentWallet, getSessionPassword, type Wallet } from "@/lib/wallet"
import { sendNativeToken, sendToken } from "@/lib/transactions"
import { scanWalletTokens, type ScannedToken, NATIVE_ADDR } from "@/lib/scanTokens"
import BottomNav from "@/components/BottomNav"

/* ── avatar ──────────────────────────────────────────────── */
function TAvatar({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const palette: [string, string][] = [
    ["#00ff88", "#00cc6a"], ["#fff", "#ccc"],
    ["#00cc6a", "#009950"], ["#88ffcc", "#00ff88"],
  ]
  const [a, b] = palette[(symbol?.charCodeAt(0) || 0) % palette.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `linear-gradient(135deg,${a},${b})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, fontSize: size * 0.38, fontWeight: 700, color: "#000",
    }}>
      {(symbol?.[0] || "?").toUpperCase()}
    </div>
  )
}

/* ── types ───────────────────────────────────────────────── */
type TxStatus = "pending" | "success" | "failed"

interface BatchRow {
  id: string
  token: ScannedToken | null
  amount: string
  recipient: string
  showPicker: boolean
}

interface TxResult {
  id: string
  symbol: string
  amount: string
  recipient: string
  status: TxStatus
  hash?: string
  error?: string
}

let rowCounter = 1
const mkRow = (): BatchRow => ({
  id: String(rowCounter++),
  token: null,
  amount: "",
  recipient: "",
  showPicker: false,
})

const GAS_RESERVE = 0.01

/* ── component ───────────────────────────────────────────── */
export default function BatchTransferPage() {
  const [chainId, setChainId] = useState<number>(97741)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [tokens, setTokens] = useState<ScannedToken[]>([])
  const [scanning, setScanning] = useState(false)
  const [rows, setRows] = useState<BatchRow[]>([mkRow()])

  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)

  const [executing, setExecuting] = useState(false)
  const [progress, setProgress] = useState<TxResult[]>([])
  const [done, setDone] = useState(false)

  /* ── init ────────────────────────────────────────────────── */
  useEffect(() => {
    const id =
      typeof window !== "undefined"
        ? Number(localStorage.getItem("selected_chain") || "97741")
        : 97741
    setChainId(id)
    const w = getCurrentWallet()
    setWallet(w ?? null)
    if (w) load(w.address, id)
  }, [])

  const load = useCallback(async (addr: string, id: number) => {
    setScanning(true)
    const list = await scanWalletTokens(addr, id)
    setTokens(list)
    setScanning(false)
  }, [])

  /* ── row helpers ─────────────────────────────────────────── */
  const updateRow = (id: string, patch: Partial<BatchRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const removeRow = (id: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev))

  const addRow = () => setRows((prev) => [...prev, mkRow()])

  const setMax = (row: BatchRow) => {
    if (!row.token) return
    const safeMax = row.token.isNative
      ? Math.max(0, Number(row.token.balance) - GAS_RESERVE).toFixed(8)
      : row.token.balance
    updateRow(row.id, { amount: safeMax })
  }

  /* ── validation ──────────────────────────────────────────── */
  const rowValid = (r: BatchRow) =>
    r.token !== null &&
    Number(r.amount) > 0 &&
    ethers.isAddress(r.recipient)

  const canSend = rows.some(rowValid) && !!wallet

  /* ── execute ─────────────────────────────────────────────── */
  const run = async () => {
    if (!wallet || !canSend) return
    const pw = getSessionPassword() || password
    if (!pw) { setShowPw(true); return }

    const valid = rows.filter(rowValid)
    const live: TxResult[] = valid.map((r) => ({
      id: r.id,
      symbol: r.token!.symbol,
      amount: Number(r.amount).toFixed(6),
      recipient: r.recipient,
      status: "pending",
    }))

    setExecuting(true)
    setDone(false)
    setProgress([...live])

    for (let i = 0; i < valid.length; i++) {
      const r = valid[i]
      const t = r.token!
      try {
        let hash: string
        if (t.isNative) {
          hash = await sendNativeToken(wallet, pw, r.recipient, r.amount, chainId)
        } else {
          hash = await sendToken(wallet, pw, t.address, r.recipient, r.amount, chainId)
        }
        live[i] = { ...live[i], status: "success", hash }
      } catch (e: any) {
        live[i] = { ...live[i], status: "failed", error: String(e.message).slice(0, 90) }
      }
      setProgress([...live])
    }

    setDone(true)
    setExecuting(false)
  }

  /* ── counters ────────────────────────────────────────────── */
  const successCount = progress.filter((r) => r.status === "success").length
  const failCount = progress.filter((r) => r.status === "failed").length
  const doneCount = progress.filter((r) => r.status !== "pending").length

  const copy = (v: string) => navigator.clipboard?.writeText(v)

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "#fff", paddingBottom: 100 }}>

      {/* Header */}
      <div className="sticky top-0 z-50 flex items-center gap-3 px-4 py-4"
        style={{ background: "rgba(0,0,0,0.95)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/send"
          className="flex items-center justify-center w-9 h-9 rounded-xl"
          style={{ background: "#111" }}>
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </Link>
        <div className="flex-1">
          <div className="font-bold text-lg">Batch Transfer</div>
          <div className="text-xs" style={{ color: "#555" }}>
            Send to multiple addresses at once
          </div>
        </div>
        <button
          onClick={() => wallet && load(wallet.address, chainId)}
          className="flex items-center justify-center w-9 h-9 rounded-xl"
          style={{ background: "#111" }}>
          <RefreshCw style={{ width: 16, height: 16, color: "#555" }}
            className={scanning ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">

        {/* Scanning notice */}
        {scanning && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl"
            style={{ background: "#111" }}>
            <RefreshCw style={{ width: 14, height: 14, color: "#00ff88" }} className="animate-spin" />
            <span className="text-sm" style={{ color: "#555" }}>Loading your assets…</span>
          </div>
        )}

        {/* Password field (shown on demand) */}
        {showPw && (
          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: "#555" }}>
              WALLET PASSWORD
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password to confirm"
              className="input-field w-full"
            />
          </div>
        )}

        {/* Transfer rows */}
        {rows.map((row, rowIdx) => (
          <div key={row.id} className="rounded-2xl overflow-visible"
            style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)" }}>

            {/* Row header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <div className="text-xs font-semibold" style={{ color: "#555" }}>
                TRANSFER #{rowIdx + 1}
              </div>
              <button onClick={() => removeRow(row.id)}
                className="flex items-center justify-center w-7 h-7 rounded-lg"
                style={{ background: "rgba(255,68,68,0.1)" }}>
                <Trash2 style={{ width: 13, height: 13, color: "#ff6666" }} />
              </button>
            </div>

            <div className="px-4 pb-4 space-y-3">

              {/* Token selector */}
              <div className="relative">
                <button
                  onClick={() => updateRow(row.id, { showPicker: !row.showPicker })}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all"
                  style={{
                    background: "#000",
                    border: `1px solid ${row.showPicker ? "rgba(0,255,136,0.35)" : "rgba(255,255,255,0.07)"}`,
                  }}>
                  {row.token ? (
                    <>
                      <TAvatar symbol={row.token.symbol} />
                      <div className="flex-1 text-left">
                        <div className="text-sm font-semibold">{row.token.symbol}</div>
                        <div className="text-xs" style={{ color: "#555" }}>
                          {Number(row.token.balance).toFixed(4)} available
                        </div>
                      </div>
                    </>
                  ) : (
                    <span className="flex-1 text-left text-sm" style={{ color: "#555" }}>
                      {scanning ? "Loading…" : "Select token"}
                    </span>
                  )}
                  <ChevronDown style={{ width: 16, height: 16, color: "#555" }} />
                </button>

                {/* Token picker dropdown */}
                {row.showPicker && tokens.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-2xl overflow-hidden"
                    style={{ background: "#181818", border: "1px solid rgba(255,255,255,0.1)", maxHeight: 220, overflowY: "auto" }}>
                    {tokens.map((t, i) => (
                      <button key={t.address} onClick={() => {
                        updateRow(row.id, { token: t, showPicker: false, amount: "" })
                      }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-white/5"
                        style={{
                          borderBottom: i < tokens.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        }}>
                        <TAvatar symbol={t.symbol} size={28} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold">{t.symbol}</div>
                        </div>
                        <div className="text-xs" style={{ color: "#555" }}>
                          {Number(t.balance).toFixed(4)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Amount */}
              <div className="flex gap-2">
                <input
                  type="number"
                  value={row.amount}
                  onChange={(e) => updateRow(row.id, { amount: e.target.value })}
                  placeholder="0.00"
                  className="input-field flex-1"
                  style={{ background: "#000" }}
                />
                <button
                  onClick={() => setMax(row)}
                  disabled={!row.token}
                  className="px-4 rounded-xl text-sm font-bold"
                  style={{
                    background: row.token ? "rgba(0,255,136,0.1)" : "#0a0a0a",
                    color: row.token ? "#00ff88" : "#333",
                  }}>
                  MAX
                </button>
              </div>

              {/* Recipient */}
              <input
                value={row.recipient}
                onChange={(e) => updateRow(row.id, { recipient: e.target.value })}
                placeholder="Recipient 0x…"
                className="input-field w-full font-mono text-sm"
                style={{ background: "#000" }}
              />

              {/* Row validity indicator */}
              {row.token && row.amount && row.recipient && (
                <div className="text-xs flex items-center gap-1.5"
                  style={{ color: rowValid(row) ? "#00ff88" : "#ff6666" }}>
                  {rowValid(row)
                    ? <><CheckCircle2 style={{ width: 12, height: 12 }} /> Ready to send</>
                    : <><XCircle style={{ width: 12, height: 12 }} /> Invalid address or amount</>}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Add row */}
        {!executing && !done && (
          <button onClick={addRow}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold transition-all"
            style={{
              background: "transparent",
              border: "1px dashed rgba(0,255,136,0.3)",
              color: "#00ff88",
            }}>
            <Plus style={{ width: 16, height: 16 }} />
            Add Another Transfer
          </button>
        )}

        {/* Results */}
        {progress.length > 0 && (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="font-bold text-sm">
                {done
                  ? `Results — ${successCount} sent, ${failCount} failed`
                  : `Sending ${doneCount}/${progress.length}…`}
              </div>
              {done && (
                <div className="text-xs px-2.5 py-1 rounded-lg font-semibold"
                  style={{
                    background: failCount > 0 ? "rgba(255,68,68,0.12)" : "rgba(0,255,136,0.12)",
                    color: failCount > 0 ? "#ff6666" : "#00ff88",
                  }}>
                  {failCount > 0 ? `${failCount} failed` : "All sent ✓"}
                </div>
              )}
            </div>

            {progress.map((r, i) => (
              <div key={r.id} className="px-4 py-3 flex items-start gap-3"
                style={{ borderBottom: i < progress.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div className="mt-0.5 flex-shrink-0">
                  {r.status === "pending" && (
                    <Clock style={{ width: 16, height: 16, color: "#555" }} className="animate-pulse" />
                  )}
                  {r.status === "success" && (
                    <CheckCircle2 style={{ width: 16, height: 16, color: "#00ff88" }} />
                  )}
                  {r.status === "failed" && (
                    <XCircle style={{ width: 16, height: 16, color: "#ff4444" }} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">
                    {r.amount} {r.symbol}
                    <span className="font-mono font-normal text-xs ml-2" style={{ color: "#555" }}>
                      → {r.recipient.slice(0, 8)}…{r.recipient.slice(-6)}
                    </span>
                  </div>
                  {r.hash && (
                    <button onClick={() => copy(r.hash!)}
                      className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs font-mono" style={{ color: "#00ff88" }}>
                        {r.hash.slice(0, 12)}…{r.hash.slice(-8)}
                      </span>
                      <Copy style={{ width: 10, height: 10, color: "#555" }} />
                    </button>
                  )}
                  {r.error && (
                    <div className="text-xs mt-0.5" style={{ color: "#ff6666" }}>{r.error}</div>
                  )}
                </div>

                <div className="text-xs font-semibold flex-shrink-0 mt-0.5"
                  style={{
                    color: r.status === "success" ? "#00ff88"
                      : r.status === "failed" ? "#ff4444" : "#444",
                  }}>
                  {r.status === "pending" ? "waiting…" : r.status}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary before send */}
        {!executing && !done && rows.filter(rowValid).length > 0 && (
          <div className="px-4 py-3 rounded-2xl flex items-center justify-between"
            style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.12)" }}>
            <div className="text-sm" style={{ color: "#aaa" }}>
              <span style={{ color: "#00ff88", fontWeight: 700 }}>
                {rows.filter(rowValid).length}
              </span>{" "}
              transfer{rows.filter(rowValid).length !== 1 ? "s" : ""} ready
            </div>
            <div className="text-xs" style={{ color: "#555" }}>
              {rows.filter((r) => !rowValid(r) && r.token).length > 0 &&
                `${rows.filter((r) => !rowValid(r) && r.token).length} incomplete`}
            </div>
          </div>
        )}

        {/* CTA */}
        {!done ? (
          <button
            onClick={run}
            disabled={!canSend || executing}
            className="btn-primary w-full py-4 text-base font-bold"
            style={{ opacity: !canSend || executing ? 0.45 : 1 }}>
            {executing ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw style={{ width: 18, height: 18 }} className="animate-spin" />
                Sending {doneCount}/{progress.length}…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Send style={{ width: 18, height: 18 }} />
                Send {rows.filter(rowValid).length} Transfer{rows.filter(rowValid).length !== 1 ? "s" : ""}
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={() => {
              setProgress([])
              setDone(false)
              setRows([mkRow()])
              if (wallet) load(wallet.address, chainId)
            }}
            className="w-full py-4 rounded-2xl font-bold text-base"
            style={{ background: "#111", color: "#fff", border: "1px solid rgba(255,255,255,0.08)" }}>
            New Batch
          </button>
        )}

      </div>
      <BottomNav active="send" />
    </div>
  )
}
