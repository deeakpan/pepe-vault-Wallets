"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { getWallets, getWalletState, updateActivity, getCurrentWallet, clearAllWallets, confirmWalletReset } from "@/lib/wallet"
import { getSavedEthCustomTokens } from "@/lib/customTokens"
import { sendNativeToken, sendToken } from "@/lib/transactions"
import { getNativeBalance, getTokenBalance, getProviderWithFallback } from "@/lib/rpc"
import { isTokenBlacklisted } from "@/lib/blacklist"
import { calculateTransactionFeePepu, checkTransactionFeeBalance } from "@/lib/fees"
import { getAllEthTokenBalances } from "@/lib/ethTokens"
import { resolvePepuDomain, isPepuDomain, parseDomainInput } from "@/lib/domains"
import { getUnchainedProvider } from "@/lib/provider"
import {
  ArrowUp, Loader, ChevronDown, CheckCircle, RotateCcw,
  ArrowLeft, X, Check, Send, Wallet,
} from "lucide-react"
import BottomNav from "@/components/BottomNav"
import RpcConnectionNotification from "@/components/RpcConnectionNotification"
import TransactionNotification from "@/components/TransactionNotification"
import Link from "next/link"
import { ethers } from "ethers"

interface Token {
  address: string; name: string; symbol: string; decimals: number; balance: string; isNative: boolean
}

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]

type SendStep = "select" | "recipient" | "amount"

/* ── tiny token avatar ── */
function TAvatar({ symbol, size = 36 }: { symbol: string; size?: number }) {
  const colors = [["#00ff88","#00cc6a"],["#3b82f6","#2563eb"],["#8b5cf6","#7c3aed"],["#f59e0b","#d97706"],["#ec4899","#db2777"]]
  const [a, b] = colors[symbol.charCodeAt(0) % colors.length]
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, background: `linear-gradient(135deg,${a},${b})`, fontSize: size * 0.38 }}>
      {symbol[0]?.toUpperCase()}
    </div>
  )
}

/* ── step dot indicator ── */
function StepDots({ step }: { step: SendStep }) {
  const steps: SendStep[] = ["select", "recipient", "amount"]
  const idx = steps.indexOf(step)
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((_, i) => (
        <div key={i} className="rounded-full transition-all"
          style={{ width: i === idx ? 20 : 6, height: 6, background: i <= idx ? "#00ff88" : "rgba(255,255,255,0.15)" }} />
      ))}
    </div>
  )
}

export default function SendPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<SendStep>("select")
  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("")
  const [password, setPassword] = useState("")
  const [chainId, setChainId] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selected_chain")
      return saved ? Number(saved) : 97741
    }
    return 97741
  })
  const [balance, setBalance] = useState("0")
  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [tokens, setTokens] = useState<Token[]>([])
  const [loadingTokens, setLoadingTokens] = useState(false)
  const [showTokenSelector, setShowTokenSelector] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [transactionFee, setTransactionFee] = useState<string>("0")
  const [feeWarning, setFeeWarning] = useState("")
  const [feeCalculated, setFeeCalculated] = useState(false)
  const [resolvedAddress, setResolvedAddress] = useState<string>("")
  const [resolvingDomain, setResolvingDomain] = useState(false)
  const [domainInput, setDomainInput] = useState("")
  const [tokenLoadError, setTokenLoadError] = useState<string>("")
  const [showNotification, setShowNotification] = useState(false)
  const [notificationData, setNotificationData] = useState<{ message: string; txHash?: string; explorerUrl?: string } | null>(null)
  const tokenSelectorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wallets = getWallets()
    if (wallets.length === 0) { router.push("/setup"); return }
    const saved = localStorage.getItem("selected_chain")
    const savedChainId = saved ? Number(saved) : 97741
    if (savedChainId !== chainId) setChainId(savedChainId)
    const provider = getUnchainedProvider()
    const providerChainId = provider.getChainId()
    const finalChainId = savedChainId || chainId || 97741
    if (providerChainId !== finalChainId) provider.setChainId(finalChainId)
    if (finalChainId !== chainId) setChainId(finalChainId)
    updateActivity()
    if (currentStep === "select") loadTokens()
  }, [router, chainId, currentStep])

  useEffect(() => {
    let retryTimeout: NodeJS.Timeout | null = null
    let isMounted = true
    const calculateFee = async (isRetry = false) => {
      if (!amount || !selectedToken || Number.parseFloat(amount) === 0 || currentStep !== "amount") {
        setTransactionFee("0"); setFeeWarning(""); setFeeCalculated(true); return
      }
      if (chainId !== 97741) { setTransactionFee("0"); setFeeWarning(""); setFeeCalculated(true); return }
      try {
        const wallets = getWallets()
        if (wallets.length === 0) { setFeeCalculated(false); return }
        const active = getCurrentWallet() || wallets[0]
        let feeAmount = "0"
        if (selectedToken.isNative) {
          feeAmount = await calculateTransactionFeePepu(amount)
        } else {
          const { calculateERC20TokenFee } = await import("@/lib/fees")
          const feeCalc = calculateERC20TokenFee(amount, selectedToken.decimals)
          feeAmount = feeCalc.feeAmount
        }
        if (!feeAmount || Number.parseFloat(feeAmount) === 0) {
          if (isMounted) { setFeeCalculated(false); setTransactionFee("0"); setFeeWarning(""); retryTimeout = setTimeout(() => { if (isMounted) calculateFee(true) }, 5000) }
          return
        }
        if (isMounted) {
          setTransactionFee(feeAmount); setFeeWarning("")
          try {
            const feeCheck = await checkTransactionFeeBalance(active.address, amount, selectedToken.address, selectedToken.decimals, chainId)
            if (!feeCheck.hasEnough) {
              const nativeSymbol = chainId === 1 ? "ETH" : "PEPU"
              const symbol = selectedToken.isNative ? nativeSymbol : selectedToken.symbol
              setFeeWarning(`Insufficient balance. Required: ${Number.parseFloat(feeCheck.requiredTotal).toFixed(6)} ${symbol}, Available: ${Number.parseFloat(feeCheck.currentBalance).toFixed(6)} ${symbol}`)
              setFeeCalculated(false)
            } else { setFeeWarning(""); setFeeCalculated(true) }
          } catch (feeError: any) {
            const errorMsg = feeError.message || "Failed to check fee balance"
            if (errorMsg.includes("RPC") || errorMsg.includes("network")) setFeeWarning("Network error: Unable to verify balance.")
              else setFeeWarning(errorMsg)
            setFeeCalculated(false)
          }
        }
      } catch (error: any) {
        if (isMounted) {
          const errorMsg = error.message || "Failed to calculate fee"
          if (errorMsg.includes("RPC") || errorMsg.includes("network") || errorMsg.includes("fetch")) setFeeWarning("Network error: Unable to calculate fee.")
          else setFeeWarning(errorMsg)
          setFeeCalculated(false); setTransactionFee("0")
          retryTimeout = setTimeout(() => { if (isMounted) calculateFee(true) }, 5000)
        }
      }
    }
    calculateFee()
    return () => { isMounted = false; if (retryTimeout) clearTimeout(retryTimeout) }
  }, [amount, selectedToken, chainId, currentStep])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tokenSelectorRef.current && !tokenSelectorRef.current.contains(event.target as Node)) setShowTokenSelector(false)
    }
    if (showTokenSelector) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showTokenSelector])

  const loadTokens = async (targetChainId?: number) => {
    setLoadingTokens(true); setTokenLoadError("")
    const timeoutId = setTimeout(() => { setTokenLoadError("Token loading timed out."); setLoadingTokens(false) }, 30000)
    try {
      const wallets = getWallets()
      if (wallets.length === 0) { clearTimeout(timeoutId); setLoadingTokens(false); return }
      const wallet = getCurrentWallet() || wallets[0]
      const allTokens: Token[] = []
      const effectiveChainId = targetChainId === 1 || targetChainId === 97741 ? targetChainId : chainId
      const currentChainId = effectiveChainId === 1 ? 1 : 97741
      const nativeSymbol = currentChainId === 1 ? "ETH" : "PEPU"
      let nativeBalance = "0"
      try { nativeBalance = await getNativeBalance(wallet.address, currentChainId) } catch {}
      allTokens.push({ address: "0x0000000000000000000000000000000000000000", name: nativeSymbol, symbol: nativeSymbol, decimals: 18, balance: nativeBalance, isNative: true })

      if (currentChainId === 1) {
        try {
          const ethTokens = await getAllEthTokenBalances(wallet.address)
          for (const t of ethTokens) {
            if (!isTokenBlacklisted(t.address, currentChainId)) {
              allTokens.push({ address: t.address, name: t.name || "Unknown Token", symbol: t.symbol && t.symbol.trim() !== "" ? t.symbol.trim() : "TOKEN", decimals: t.decimals, balance: t.balanceFormatted, isNative: false })
            }
          }
        } catch {}
        try {
          const customTokens = getSavedEthCustomTokens()
          if (customTokens.length > 0) {
            const provider = await getProviderWithFallback(currentChainId)
            for (const addr of customTokens) {
              if (allTokens.find(t => t.address.toLowerCase() === addr.toLowerCase()) || isTokenBlacklisted(addr, currentChainId)) continue
              try {
                const contract = new ethers.Contract(addr, ERC20_ABI, provider)
                const [bal, dec, sym, nm] = await Promise.all([contract.balanceOf(wallet.address).catch(() => ethers.parseUnits("0", 18)), contract.decimals().catch(() => 18), contract.symbol().catch(() => "TOKEN"), contract.name().catch(() => "Unknown Token")])
                allTokens.push({ address: addr.toLowerCase(), name: nm || "Unknown Token", symbol: sym && sym.trim() !== "" ? sym.trim() : "TOKEN", decimals: Number(dec), balance: ethers.formatUnits(bal, dec), isNative: false })
              } catch {}
            }
          }
        } catch {}
      } else if (currentChainId === 97741) {
        const provider = await getProviderWithFallback(currentChainId)
        const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        const currentBlock = await provider.getBlockNumber()
        const fromBlock = Math.max(0, currentBlock - 10000)
        try {
          const addressTopic = ethers.zeroPadValue(wallet.address, 32)
          const [logsFrom, logsTo] = await Promise.all([
            provider.getLogs({ fromBlock, toBlock: "latest", topics: [transferTopic, addressTopic] }),
            provider.getLogs({ fromBlock, toBlock: "latest", topics: [transferTopic, null, addressTopic] }),
          ])
          const tokenAddresses = [...new Set([...logsFrom, ...logsTo].map(l => l.address.toLowerCase()))].filter(a => !isTokenBlacklisted(a, currentChainId))
          for (const tokenAddress of tokenAddresses) {
            try {
              const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
              const [bal, dec, sym, nm] = await Promise.all([contract.balanceOf(wallet.address), contract.decimals(), contract.symbol().catch(() => "TOKEN"), contract.name().catch(() => "Unknown Token")])
              const bf = ethers.formatUnits(bal, dec)
              if (Number.parseFloat(bf) > 0) allTokens.push({ address: tokenAddress, name: nm || "Unknown Token", symbol: sym && sym.trim() !== "" ? sym.trim() : "TOKEN", decimals: Number(dec), balance: bf, isNative: false })
            } catch {}
          }
        } catch {}
      }

      setTokens(allTokens)
      if (allTokens.length > 0) {
        if (!selectedToken) { setSelectedToken(allTokens[0]); setBalance(allTokens[0].balance) }
        else {
          const updated = allTokens.find(t => t.address.toLowerCase() === selectedToken.address.toLowerCase())
          if (updated && updated.symbol && updated.symbol.trim() !== "") { setSelectedToken(updated); setBalance(updated.balance) }
          else { setSelectedToken(allTokens[0]); setBalance(allTokens[0].balance) }
        }
      } else { setSelectedToken(null); setBalance("0") }
      clearTimeout(timeoutId)
    } catch (error: any) {
      const msg = error?.message || String(error)
      setTokenLoadError(`Error loading tokens: ${msg}`)
    } finally { clearTimeout(timeoutId); setLoadingTokens(false) }
  }

  const handleNext = () => {
    if (currentStep === "select") {
      if (!selectedToken) { setError("Please select a token"); return }
      setCurrentStep("recipient"); setError("")
    } else if (currentStep === "recipient") {
      if (!recipient.trim()) { setError("Please enter a recipient address"); return }
      let finalRecipient = recipient.trim()
      if (chainId === 97741 && isPepuDomain(recipient)) {
        if (resolvedAddress) finalRecipient = resolvedAddress
        else { setError("Please wait for domain resolution or enter a valid address"); return }
      }
      if (!ethers.isAddress(finalRecipient)) { setError("Invalid recipient address"); return }
      setCurrentStep("amount"); setError("")
    }
  }

  const handleBack = () => {
    if (currentStep === "recipient") { setCurrentStep("select"); setError("") }
    else if (currentStep === "amount") { setCurrentStep("recipient"); setError("") }
  }

  const handleSend = async () => {
    setError("")
    if (!recipient || !amount || !password || !selectedToken) { setError("Please fill in all fields"); return }
    let finalRecipient = recipient.trim()
    if (chainId === 97741 && isPepuDomain(recipient)) {
      if (resolvedAddress) finalRecipient = resolvedAddress
      else {
        const parsed = parseDomainInput(recipient)
        if (parsed && parsed.tld) {
          const address = await resolvePepuDomain(parsed.name, parsed.tld)
          if (address) finalRecipient = address
          else { setError("Domain not found or expired"); return }
        } else { setError("Invalid domain format"); return }
      }
    }
    if (!ethers.isAddress(finalRecipient)) { setError("Invalid recipient address"); return }
    if (Number.parseFloat(amount) > Number.parseFloat(balance)) { setError("Insufficient balance"); return }
    setLoading(true)
    try {
      const wallets = getWallets()
      if (wallets.length === 0) throw new Error("No wallet found")
      const active = getCurrentWallet() || wallets[0]
      let txHash: string
      if (selectedToken.isNative) txHash = await sendNativeToken(active, password, finalRecipient, amount, chainId)
      else txHash = await sendToken(active, password, selectedToken.address, finalRecipient, amount, chainId)
      const explorerUrl = chainId === 1 ? `https://etherscan.io/tx/${txHash}` : `https://pepuscan.com/tx/${txHash}`
      const txHistory = JSON.parse(localStorage.getItem("transaction_history") || "[]")
      txHistory.unshift({ hash: txHash, type: "send", to: recipient, amount, token: selectedToken.symbol, chainId, timestamp: Date.now(), explorerUrl })
      localStorage.setItem("transaction_history", JSON.stringify(txHistory.slice(0, 100)))
      setNotificationData({ message: "Transaction sent successfully!", txHash, explorerUrl })
      setShowNotification(true)
      setRecipient(""); setAmount(""); setPassword(""); setCurrentStep("select")
      await loadTokens()
      setTimeout(() => router.push("/dashboard"), 2000)
    } catch (err: any) { setError(err.message || "Transaction failed") }
    finally { setLoading(false) }
  }

  const handleChainSwitch = async (newChainId: number) => {
    setChainId(newChainId); setSelectedToken(null); setTokens([]); setBalance("0")
    localStorage.setItem("selected_chain", newChainId.toString())
    localStorage.setItem("unchained_chain_id", newChainId.toString())
    const provider = getUnchainedProvider(); provider.setChainId(newChainId)
    void loadTokens(newChainId)
  }

  /* ─── UI ─── */
  return (
    <div className="min-h-screen pb-28 text-white" style={{ background: "#13141a" }}>
      <RpcConnectionNotification chainId={chainId} />
      {showNotification && notificationData && (
        <TransactionNotification
          message={notificationData.message}
          txHash={notificationData.txHash}
          explorerUrl={notificationData.explorerUrl}
          onClose={() => { setShowNotification(false); setNotificationData(null) }}
          duration={10000}
        />
      )}

      {/* ── Header ── */}
      <div
        className="sticky top-0 z-40 px-5 py-4"
        style={{ background: "rgba(19,20,26,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          {currentStep !== "select" ? (
            <button onClick={handleBack} className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors btn-icon">
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <Link href="/dashboard" className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors btn-icon">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}
          <div className="flex-1">
            <h1 className="text-base font-bold">Send</h1>
            <p className="text-xs" style={{ color: "#6b7280" }}>
              {currentStep === "select" && "Select token"}
              {currentStep === "recipient" && "Enter recipient"}
              {currentStep === "amount" && "Enter amount"}
            </p>
          </div>
          <StepDots step={currentStep} />
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 pt-6 space-y-4">

        {/* ── STEP 1: Token & chain ── */}
        {currentStep === "select" && (
          <>
            {/* Chain toggle */}
            <div
              className="flex rounded-2xl p-1 gap-1"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {[{ id: 1, label: "Ethereum", color: "#627eea" }, { id: 97741, label: "PEPU", color: "#00ff88" }].map(n => (
                <button key={n.id} onClick={() => handleChainSwitch(n.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={chainId === n.id ? { background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.1)", color: n.color } : { color: "#6b7280" }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: n.color }} />{n.label}
                </button>
              ))}
            </div>

            {/* Token selector */}
            <div ref={tokenSelectorRef} className="relative">
              <p className="text-xs font-semibold mb-2" style={{ color: "#6b7280" }}>Select Token</p>
              <button
                onClick={() => setShowTokenSelector(!showTokenSelector)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all"
                style={{ background: "#1a1d2e", border: `1px solid ${showTokenSelector ? "rgba(0,255,136,0.4)" : "rgba(255,255,255,0.08)"}` }}
                disabled={loadingTokens}
              >
                {loadingTokens ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Loader className="w-5 h-5 animate-spin" style={{ color: "#00ff88" }} />
                    <span className="text-sm" style={{ color: "#6b7280" }}>Loading tokens…</span>
                  </div>
                ) : selectedToken ? (
                  <>
                    <TAvatar symbol={selectedToken.symbol} />
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold">{selectedToken.symbol}</p>
                      <p className="text-xs" style={{ color: "#6b7280" }}>{Number.parseFloat(selectedToken.balance).toFixed(4)} available</p>
                    </div>
                  </>
                ) : (
                  <span className="flex-1 text-left text-sm" style={{ color: "#6b7280" }}>
                    {tokenLoadError ? "Error loading tokens" : "Pick a token"}
                  </span>
                )}
                <ChevronDown className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: "#6b7280", transform: showTokenSelector ? "rotate(180deg)" : "" }} />
              </button>

              {showTokenSelector && !loadingTokens && (
                <div
                  className="absolute z-50 w-full mt-2 rounded-2xl overflow-hidden shadow-2xl"
                  style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.1)", maxHeight: 280, overflowY: "auto" }}
                >
                  {tokenLoadError ? (
                    <div className="p-4">
                      <p className="text-sm mb-2" style={{ color: "#ef4444" }}>{tokenLoadError}</p>
                      <button onClick={() => { setTokenLoadError(""); loadTokens() }} className="text-xs underline" style={{ color: "#00ff88" }}>Retry</button>
                    </div>
                  ) : tokens.length === 0 ? (
                    <div className="p-4 text-center text-sm" style={{ color: "#6b7280" }}>No tokens found</div>
                  ) : (
                    tokens.map(token => (
                      <button key={token.address}
                        onClick={() => { if (!token.symbol || token.symbol.trim() === "") { setError("Token symbol missing"); return } setSelectedToken(token); setBalance(token.balance); setShowTokenSelector(false) }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      >
                        <TAvatar symbol={token.symbol || "?"} />
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{token.symbol || "TOKEN"}</p>
                          <p className="text-xs" style={{ color: "#6b7280" }}>{token.name || "Unknown Token"}</p>
                        </div>
                        <p className="text-sm font-semibold" style={{ color: "#00ff88" }}>{Number.parseFloat(token.balance).toFixed(4)}</p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}

            <button
              onClick={handleNext}
              disabled={!selectedToken || loadingTokens}
              className="btn-primary w-full disabled:opacity-40"
            >
              Continue
            </button>
          </>
        )}

        {/* ── STEP 2: Recipient ── */}
        {currentStep === "recipient" && (
          <>
            {/* selected token badge */}
            {selectedToken && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.08)" }}>
                <TAvatar symbol={selectedToken.symbol} />
                <div>
                  <p className="text-sm font-semibold">{selectedToken.symbol}</p>
                  <p className="text-xs" style={{ color: "#6b7280" }}>Balance: {Number.parseFloat(balance).toFixed(6)}</p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: "#6b7280" }}>
                Recipient {chainId === 97741 && <span style={{ color: "#00ff88" }}>· .pepu domains supported</span>}
              </label>
              <textarea
                value={recipient}
                onChange={async (e) => {
                  const value = e.target.value.trim()
                  setRecipient(value); setResolvedAddress(""); setDomainInput(""); setError("")
                  if (chainId === 97741 && isPepuDomain(value)) {
                    setResolvingDomain(true)
                    const parsed = parseDomainInput(value)
                    if (parsed && parsed.tld) {
                      setDomainInput(`${parsed.name}${parsed.tld}`)
                      const address = await resolvePepuDomain(parsed.name, parsed.tld)
                      if (address) setResolvedAddress(address)
                      else setResolvedAddress("")
                    } else { setResolvedAddress(""); setDomainInput("") }
                    setResolvingDomain(false)
                  }
                }}
                placeholder={chainId === 97741 ? "0x… or name.pepu" : "0x…"}
                rows={2}
                className="input-field resize-none font-mono text-sm"
              />
              {resolvingDomain && (
                <p className="flex items-center gap-1.5 text-xs mt-1" style={{ color: "#6b7280" }}>
                  <Loader className="w-3 h-3 animate-spin" /> Resolving domain…
                </p>
              )}
              {resolvedAddress && domainInput && (
                <div className="mt-2 flex items-start gap-2 p-3 rounded-xl" style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.2)" }}>
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#00ff88" }} />
                  <div>
                    <p className="text-xs" style={{ color: "#6b7280" }}>{domainInput}</p>
                    <p className="text-sm font-mono" style={{ color: "#00ff88" }}>{resolvedAddress}</p>
                  </div>
                </div>
              )}
              {recipient && isPepuDomain(recipient) && !resolvedAddress && !resolvingDomain && chainId === 97741 && (
                <p className="text-xs mt-1" style={{ color: "#ef4444" }}>Domain not found or expired</p>
              )}
            </div>

            {error && <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}

            <button
              onClick={handleNext}
              disabled={!recipient.trim() || (chainId === 97741 && isPepuDomain(recipient) && !resolvedAddress)}
              className="btn-primary w-full disabled:opacity-40"
            >
              Continue
            </button>
          </>
        )}

        {/* ── STEP 3: Amount ── */}
        {currentStep === "amount" && (
          <>
            {/* summary card */}
            <div className="p-4 rounded-2xl space-y-3" style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "#6b7280" }}>Token</span>
                <div className="flex items-center gap-2">
                  <TAvatar symbol={selectedToken?.symbol || "?"} size={22} />
                  <span className="text-sm font-semibold">{selectedToken?.symbol}</span>
                </div>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-xs" style={{ color: "#6b7280" }}>To</span>
                <span className="text-xs font-mono text-right max-w-[60%] break-all" style={{ color: "#9ca3af" }}>
                  {resolvedAddress || recipient}
                </span>
              </div>
            </div>

            {/* amount input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold" style={{ color: "#6b7280" }}>Amount</label>
                <span className="text-xs" style={{ color: "#6b7280" }}>
                  Balance: <span style={{ color: "#00ff88" }}>{Number.parseFloat(balance).toFixed(4)}</span> {selectedToken?.symbol}
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.0001"
                  className="input-field pr-16 text-lg font-bold"
                />
                <button
                  onClick={() => setAmount(balance)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                  style={{ background: "rgba(0,255,136,0.15)", border: "1px solid rgba(0,255,136,0.3)", color: "#00ff88", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}
                >
                  MAX
                </button>
              </div>
            </div>

            {feeWarning && chainId === 97741 && feeWarning.includes("Insufficient") && (
              <div className="p-3 rounded-xl flex items-start gap-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <X className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
                <p className="text-xs" style={{ color: "#ef4444" }}>{feeWarning}</p>
              </div>
            )}

            {/* password */}
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: "#6b7280" }}>Enter PIN to confirm</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••"
                maxLength={4}
                className="input-field"
              />
              <button
                type="button"
                onClick={() => { if (confirmWalletReset()) { clearAllWallets(); router.push("/setup") } }}
                className="mt-1.5 flex items-center gap-1 text-xs transition-colors"
                style={{ color: "#9ca3af" }}
              >
                <RotateCcw className="w-3 h-3" /> Forgot PIN? Reset Wallet
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-xl flex items-start gap-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <X className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
                <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={loading || !recipient || !amount || !password || !selectedToken || (chainId === 97741 && !feeCalculated)}
              className="btn-primary w-full disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {loading ? "Sending…" : chainId === 97741 && !feeCalculated ? "Preparing…" : `Send ${selectedToken?.symbol || ""}`}
            </button>
          </>
        )}
      </div>

      <BottomNav active="send" />
    </div>
  )
}
