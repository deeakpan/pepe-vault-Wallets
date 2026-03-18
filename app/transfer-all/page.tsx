"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ArrowLeft, RefreshCw, CheckSquare2, Square, CheckCircle2,
  XCircle, Clock, Copy, ArrowRightLeft, Send,
} from "lucide-react"
import Link from "next/link"
import { getCurrentWallet, getSessionPassword, type Wallet } from "@/lib/wallet"
import { sendNativeToken, sendToken } from "@/lib/transactions"
import { scanWalletTokens, type ScannedToken, NATIVE_ADDR } from "@/lib/scanTokens"
import BottomNav from "@/components/BottomNav"

/* ── tiny avatar ──────────────────────────────────────────── */
function TAvatar({ symbol, size = 38 }: { symbol: string; size?: number }) {
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

type TxStatus = "pending" | "success" | "failed" | "skipped"

interface TxResult {
  symbol: string
  amount: string
  status: TxStatus
  hash?: string
  error?: string
}

const GAS_RESERVE = 0.01 // keep for gas on native transfers

export default function TransferAllPage() {
  const [chainId, setChainId] = useState<number>(97741)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [tokens, setTokens] = useState<ScannedToken[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)

  const [mode, setMode] = useState<"transfer" | "swap">("transfer")
  const [recipient, setRecipient] = useState("")

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
    setSelected(new Set(list.map((t) => t.address)))
    setScanning(false)
  }, [])

  /* ── helpers ─────────────────────────────────────────────── */
  const toggle = (addr: string) =>
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(addr) ? n.delete(addr) : n.add(addr)
      return n
    })

  const canExecute =
    !!wallet &&
    selected.size > 0 &&
    (mode === "swap" || recipient.startsWith("0x"))

  /* ── execute ─────────────────────────────────────────────── */
  const run = async () => {
    if (!wallet || !canExecute) return
    const pw = getSessionPassword() || password
    if (!pw) { setShowPw(true); return }

    const toProcess = tokens.filter((t) => selected.has(t.address))
    const live: TxResult[] = toProcess.map((t) => ({
      symbol: t.symbol,
      amount: Number(t.balance).toFixed(6),
      status: "pending",
    }))

    setExecuting(true)
    setDone(false)
    setProgress([...live])

    if (mode === "transfer") {
      for (let i = 0; i < toProcess.length; i++) {
        const t = toProcess[i]
        try {
          let hash: string
          if (t.isNative) {
            const safe = Math.max(0, Number(t.balance) - GAS_RESERVE)
            if (safe <= 0) throw new Error("Balance too low (gas reserve)")
            hash = await sendNativeToken(wallet, pw, recipient, safe.toFixed(8), chainId)
          } else {
            hash = await sendToken(wallet, pw, t.address, recipient, t.balance, chainId)
          }
          live[i] = { ...live[i], status: "success", hash }
        } catch (e: any) {
          live[i] = { ...live[i], status: "failed", error: String(e.message).slice(0, 90) }
        }
        setProgress([...live])
      }
    } else {
      // Swap All → PEPU (native)
      const ZERO_ADDR = "0x0000000000000000000000000000000000000000"
      for (let i = 0; i < toProcess.length; i++) {
        const t = toProcess[i]
        // Skip if it's already PEPU native
        if (t.isNative && chainId === 97741) {
          live[i] = { ...live[i], status: "skipped", error: "Already PEPU" }
          setProgress([...live])
          continue
        }
        try {
          const { executeSwap, approveToken } = await import("@/lib/swap")
          // Approve ERC20 first
          if (!t.isNative) {
            try {
              await approveToken(t.address, t.balance, t.decimals, wallet, pw, chainId)
            } catch (approveErr: any) {
              if (!String(approveErr.message).includes("already_approved")) throw approveErr
            }
          }
          const tokenIn = {
            address: t.isNative ? ZERO_ADDR : t.address,
            decimals: t.decimals,
          }
          const tokenOut = { address: ZERO_ADDR, decimals: 18 }
          // Deduct 0.85% fee from amountIn
          const amountAfterFee = (Number(t.balance) * (1 - 0.0085)).toFixed(t.decimals > 8 ? 8 : t.decimals)
          const hash = await executeSwap(tokenIn, tokenOut, amountAfterFee, "0", wallet, pw, 5, chainId)
          live[i] = { ...live[i], status: "success", hash }
        } catch (e: any) {
          live[i] = { ...live[i], status: "failed", error: String(e.message).slice(0, 90) }
        }
        setProgress([...live])
      }
    }

    setDone(true)
    setExecuting(false)
  }

  /* ── counters ────────────────────────────────────────────── */
  const successCount = progress.filter((r) => r.status === "success").length
  const failCount = progress.filter((r) => r.status === "failed").length
  const doneCount = progress.filter((r) => r.status !== "pending").length

  /* ── copy ────────────────────────────────────────────────── */
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
          <div className="font-bold text-lg">Transfer All</div>
          <div className="text-xs truncate" style={{ color: "#555" }}>
            {wallet?.address?.slice(0, 6)}…{wallet?.address?.slice(-4)}
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

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">

        {/* Mode toggle */}
        <div className="flex rounded-2xl p-1 gap-1" style={{ background: "#111" }}>
          {(["transfer", "swap"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
              style={{
                background: mode === m ? "#00ff88" : "transparent",
                color: mode === m ? "#000" : "#555",
              }}>
              {m === "transfer"
                ? <><Send style={{ width: 14, height: 14 }} /> Transfer All</>
                : <><ArrowRightLeft style={{ width: 14, height: 14 }} /> Swap All to PEPU</>}
            </button>
          ))}
        </div>

        {/* Recipient (Transfer mode only) */}
        {mode === "transfer" && (
          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: "#555" }}>
              RECIPIENT ADDRESS
            </div>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x…"
              className="input-field w-full font-mono text-sm"
            />
          </div>
        )}

        {/* Swap mode info */}
        {mode === "swap" && (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.2)" }}>
            <ArrowRightLeft style={{ width: 18, height: 18, color: "#00ff88", flexShrink: 0 }} />
            <div className="text-sm" style={{ color: "#aaa" }}>
              All selected ERC-20 tokens will be swapped to <strong style={{ color: "#00ff88" }}>PEPU</strong> via the DEX.
              Native PEPU will be skipped.
            </div>
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

        {/* Asset list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold" style={{ color: "#555" }}>
              YOUR ASSETS {!scanning && `(${tokens.length})`}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSelected(new Set(tokens.map((t) => t.address)))}
                className="text-xs font-semibold" style={{ color: "#00ff88" }}>
                All
              </button>
              <button onClick={() => setSelected(new Set())}
                className="text-xs font-semibold" style={{ color: "#555" }}>
                None
              </button>
            </div>
          </div>

          {scanning ? (
            <div className="flex items-center justify-center gap-3 py-14 rounded-2xl"
              style={{ background: "#111" }}>
              <RefreshCw style={{ width: 18, height: 18, color: "#00ff88" }} className="animate-spin" />
              <span style={{ color: "#555" }}>Scanning your assets…</span>
            </div>
          ) : tokens.length === 0 ? (
            <div className="flex items-center justify-center py-14 rounded-2xl"
              style={{ background: "#111" }}>
              <span style={{ color: "#555" }}>No assets found</span>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)" }}>
              {tokens.map((t, i) => {
                const isSelected = selected.has(t.address)
                return (
                  <button key={t.address} onClick={() => toggle(t.address)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all"
                    style={{
                      borderBottom: i < tokens.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      background: isSelected ? "rgba(0,255,136,0.04)" : "transparent",
                    }}>
                    <div style={{ color: isSelected ? "#00ff88" : "#333", flexShrink: 0 }}>
                      {isSelected
                        ? <CheckSquare2 style={{ width: 18, height: 18 }} />
                        : <Square style={{ width: 18, height: 18 }} />}
                    </div>
                    <TAvatar symbol={t.symbol} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{t.symbol}</div>
                      <div className="text-xs truncate" style={{ color: "#555" }}>
                        {t.isNative ? "Native token" : `${t.address.slice(0, 10)}…`}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-semibold text-sm">{Number(t.balance).toFixed(4)}</div>
                      <div className="text-xs" style={{ color: "#555" }}>{t.symbol}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Live progress / results */}
        {progress.length > 0 && (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="font-bold text-sm">
                {done
                  ? `Done — ${successCount} succeeded, ${failCount} failed`
                  : `Processing ${doneCount}/${progress.length}…`}
              </div>
              {done && (
                <div className="text-xs px-2.5 py-1 rounded-lg font-semibold"
                  style={{
                    background: failCount > 0 ? "rgba(255,68,68,0.12)" : "rgba(0,255,136,0.12)",
                    color: failCount > 0 ? "#ff6666" : "#00ff88",
                  }}>
                  {failCount > 0 ? `${failCount} failed` : "All done ✓"}
                </div>
              )}
            </div>

            {progress.map((r, i) => (
              <div key={i} className="px-4 py-3 flex items-start gap-3"
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
                  {r.status === "skipped" && (
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#333" }} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">
                    {r.symbol}
                    <span className="font-normal ml-2" style={{ color: "#555" }}>
                      {r.amount}
                    </span>
                  </div>
                  {r.hash && r.hash !== "—" && (
                    <button
                      onClick={() => copy(r.hash!)}
                      className="flex items-center gap-1.5 mt-0.5 group">
                      <span className="text-xs font-mono"
                        style={{ color: "#00ff88" }}>
                        {r.hash.slice(0, 12)}…{r.hash.slice(-8)}
                      </span>
                      <Copy style={{ width: 10, height: 10, color: "#555" }} />
                    </button>
                  )}
                  {r.error && (
                    <div className="text-xs mt-0.5 leading-tight" style={{ color: "#ff6666" }}>
                      {r.error}
                    </div>
                  )}
                </div>

                <div className="text-xs font-semibold flex-shrink-0 mt-0.5"
                  style={{
                    color: r.status === "success" ? "#00ff88"
                      : r.status === "failed" ? "#ff4444"
                        : r.status === "skipped" ? "#555"
                          : "#444",
                  }}>
                  {r.status === "pending" ? "waiting…" : r.status}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        {!done ? (
          <button
            onClick={run}
            disabled={!canExecute || executing}
            className="btn-primary w-full py-4 text-base font-bold"
            style={{ opacity: !canExecute || executing ? 0.45 : 1 }}>
            {executing ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw style={{ width: 18, height: 18 }} className="animate-spin" />
                Processing {doneCount}/{progress.length}…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                {mode === "transfer"
                  ? <><Send style={{ width: 18, height: 18 }} />
                    Transfer {selected.size} asset{selected.size !== 1 ? "s" : ""}</>
                  : <><ArrowRightLeft style={{ width: 18, height: 18 }} />
                    Swap {selected.size} asset{selected.size !== 1 ? "s" : ""} → PEPU</>}
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={() => {
              setProgress([])
              setDone(false)
              setRecipient("")
              if (wallet) load(wallet.address, chainId)
            }}
            className="w-full py-4 rounded-2xl font-bold text-base"
            style={{ background: "#111", color: "#fff", border: "1px solid rgba(255,255,255,0.08)" }}>
            Reset &amp; Scan Again
          </button>
        )}

      </div>
      <BottomNav active="send" />
    </div>
  )
}
