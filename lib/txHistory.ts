/**
 * Shared transaction history helper.
 * Every send / swap / bridge should call saveTxToHistory after a confirmed tx.
 */

export interface HistoryTx {
  hash: string
  type: "send" | "swap" | "bridge"
  chainId: number
  timestamp: number
  explorerUrl: string
  // send fields
  to?: string
  amount?: string
  token?: string
  // swap fields
  fromToken?: string
  toToken?: string
  amountIn?: string
  amountOut?: string
}

const KEY = "transaction_history"
const MAX = 200

export function saveTxToHistory(tx: HistoryTx): void {
  try {
    if (typeof window === "undefined") return
    const list: HistoryTx[] = JSON.parse(localStorage.getItem(KEY) || "[]")
    list.unshift(tx)
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
    console.log(`[txHistory] Saved ${tx.type} tx: ${tx.hash}`)
  } catch (e) {
    console.error("[txHistory] Failed to save tx:", e)
  }
}

export function getTxHistory(): HistoryTx[] {
  try {
    if (typeof window === "undefined") return []
    return JSON.parse(localStorage.getItem(KEY) || "[]")
  } catch {
    return []
  }
}

export function explorerUrl(hash: string, chainId: number): string {
  if (chainId === 1) return `https://etherscan.io/tx/${hash}`
  if (chainId === 97741) return `https://pepuscan.com/tx/${hash}`
  return `#`
}
