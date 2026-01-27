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
import { ArrowUp, Loader, ChevronDown, CheckCircle, RotateCcw, ArrowLeft, ArrowRight, X } from "lucide-react"
import BottomNav from "@/components/BottomNav"
import RpcConnectionNotification from "@/components/RpcConnectionNotification"
import TransactionNotification from "@/components/TransactionNotification"
import { ethers } from "ethers"

interface Token {
  address: string
  name: string
  symbol: string
  decimals: number
  balance: string
  isNative: boolean
}

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]

type SendStep = "chain" | "recipient" | "amount"

export default function SendPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<SendStep>("chain")
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
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    const saved = localStorage.getItem("selected_chain")
    const savedChainId = saved ? Number(saved) : 97741
    if (savedChainId !== chainId) {
      setChainId(savedChainId)
    }

    const provider = getUnchainedProvider()
    const providerChainId = provider.getChainId()
    const finalChainId = savedChainId || chainId || 97741
    if (providerChainId !== finalChainId) {
      provider.setChainId(finalChainId)
    }
    if (finalChainId !== chainId) {
      setChainId(finalChainId)
    }

    updateActivity()
    if (currentStep === "chain") {
      loadTokens()
    }
  }, [router, chainId, currentStep])

  useEffect(() => {
    let retryTimeout: NodeJS.Timeout | null = null
    let isMounted = true

    const calculateFee = async (isRetry = false) => {
      if (!amount || !selectedToken || Number.parseFloat(amount) === 0 || currentStep !== "amount") {
        setTransactionFee("0")
        setFeeWarning("")
        setFeeCalculated(true)
        return
      }

      if (chainId !== 97741) {
        setTransactionFee("0")
        setFeeWarning("")
        setFeeCalculated(true)
        return
      }

      try {
        const wallets = getWallets()
        if (wallets.length === 0) {
          setFeeCalculated(false)
          return
        }

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
          if (isMounted) {
            setFeeCalculated(false)
            setTransactionFee("0")
            setFeeWarning("")
            retryTimeout = setTimeout(() => {
              if (isMounted) {
                calculateFee(true)
              }
            }, 5000)
          }
          return
        }

        if (isMounted) {
          setTransactionFee(feeAmount)
          setFeeWarning("")

          try {
            const feeCheck = await checkTransactionFeeBalance(
              active.address,
              amount,
              selectedToken.address,
              selectedToken.decimals,
              chainId,
            )

            if (!feeCheck.hasEnough) {
              const nativeSymbol = chainId === 1 ? "ETH" : "PEPU"
              const symbol = selectedToken.isNative ? nativeSymbol : selectedToken.symbol
              setFeeWarning(
                `Insufficient balance. Required: ${Number.parseFloat(feeCheck.requiredTotal).toFixed(6)} ${symbol}, Available: ${Number.parseFloat(feeCheck.currentBalance).toFixed(6)} ${symbol}`,
              )
              setFeeCalculated(false)
            } else {
              setFeeWarning("")
              setFeeCalculated(true)
            }
          } catch (feeError: any) {
            console.error("Error checking fee balance:", feeError)
            // Show specific error message to user
            const errorMsg = feeError.message || "Failed to check fee balance"
            if (errorMsg.includes("RPC") || errorMsg.includes("network")) {
              setFeeWarning("⚠️ Network error: Unable to verify balance. Please check your connection and try again.")
            } else {
              setFeeWarning(`⚠️ ${errorMsg}`)
            }
            setFeeCalculated(false)
            // Still allow transaction to proceed if fee calculation succeeded
            // The transaction will fail at send time if balance is insufficient
          }
        }
      } catch (error: any) {
        console.error("Error calculating fee:", error)
        if (isMounted) {
          const errorMsg = error.message || "Failed to calculate fee"
          if (errorMsg.includes("RPC") || errorMsg.includes("network") || errorMsg.includes("fetch")) {
            setFeeWarning("⚠️ Network error: Unable to calculate fee. Please check your connection.")
          } else {
            setFeeWarning(`⚠️ ${errorMsg}`)
          }
          setFeeCalculated(false)
          setTransactionFee("0")
          retryTimeout = setTimeout(() => {
            if (isMounted) {
              calculateFee(true)
            }
          }, 5000)
        }
      }
    }

    calculateFee()

    return () => {
      isMounted = false
      if (retryTimeout) {
        clearTimeout(retryTimeout)
      }
    }
  }, [amount, selectedToken, chainId, currentStep])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tokenSelectorRef.current && !tokenSelectorRef.current.contains(event.target as Node)) {
        setShowTokenSelector(false)
      }
    }

    if (showTokenSelector) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showTokenSelector])

  // Debug: Log selectedToken changes
  useEffect(() => {
    if (selectedToken) {
      console.log(`[Send] Selected token changed: ${selectedToken.symbol} (${selectedToken.name}) - isNative: ${selectedToken.isNative} - address: ${selectedToken.address}`)
    } else {
      console.log(`[Send] Selected token cleared`)
    }
  }, [selectedToken])

  const loadTokens = async (targetChainId?: number) => {
    setLoadingTokens(true)
    setTokenLoadError("")
    
    const timeoutId = setTimeout(() => {
      if (loadingTokens) {
        setTokenLoadError("Token loading timed out. Please check your RPC connection.")
        setLoadingTokens(false)
      }
    }, 30000)
    
    try {
      const wallets = getWallets()
      if (wallets.length === 0) {
        clearTimeout(timeoutId)
        setLoadingTokens(false)
        return
      }

      const wallet = getCurrentWallet() || wallets[0]
      const allTokens: Token[] = []

      // Determine which chain's tokens to load. If an explicit targetChainId is provided,
      // use that; otherwise fall back to the current state value.
      const effectiveChainId = targetChainId === 1 || targetChainId === 97741 ? targetChainId : chainId
      const currentChainId = effectiveChainId === 1 ? 1 : 97741
      
      const nativeSymbol = currentChainId === 1 ? "ETH" : "PEPU"
      let nativeBalance = "0"
      
      try {
        nativeBalance = await getNativeBalance(wallet.address, currentChainId)
      } catch (error) {
        console.error(`[Send] Error fetching native ${nativeSymbol} balance:`, error)
      }
      
      const nativeToken: Token = {
        address: "0x0000000000000000000000000000000000000000",
        name: nativeSymbol,
        symbol: nativeSymbol,
        decimals: 18,
        balance: nativeBalance,
        isNative: true,
      }
      allTokens.push(nativeToken)

      if (currentChainId === 1) {
        try {
          const ethTokens = await getAllEthTokenBalances(wallet.address)
          console.log(`[Send] Loaded ${ethTokens.length} ETH tokens from getAllEthTokenBalances`)
          for (const ethToken of ethTokens) {
            if (!isTokenBlacklisted(ethToken.address, currentChainId)) {
              // Ensure symbol is preserved correctly
              const tokenSymbol = ethToken.symbol && ethToken.symbol.trim() !== "" ? ethToken.symbol.trim() : "TOKEN"
              console.log(`[Send] Adding ETH token: ${tokenSymbol} (${ethToken.name}) at ${ethToken.address}`)
              allTokens.push({
                address: ethToken.address,
                name: ethToken.name || "Unknown Token",
                symbol: tokenSymbol,
                decimals: ethToken.decimals,
                balance: ethToken.balanceFormatted,
                isNative: false,
              })
            }
          }
        } catch (error: any) {
          const errorMsg = error?.message || String(error) || "Unknown error"
          if (errorMsg.includes("RPC") || errorMsg.includes("network") || errorMsg.includes("timeout") || errorMsg.includes("fetch")) {
            setTokenLoadError(`RPC Error: Unable to load ETH tokens. ${errorMsg}`)
          }
        }
        
        try {
          const customTokens = getSavedEthCustomTokens()
          if (customTokens.length > 0) {
            const provider = await getProviderWithFallback(currentChainId)
            for (const customTokenAddress of customTokens) {
              if (allTokens.find(t => t.address.toLowerCase() === customTokenAddress.toLowerCase())) {
                continue
              }
              if (isTokenBlacklisted(customTokenAddress, currentChainId)) {
                continue
              }
              try {
                const contract = new ethers.Contract(customTokenAddress, ERC20_ABI, provider)
                const [balance, decimals, symbol, name] = await Promise.all([
                  contract.balanceOf(wallet.address).catch(() => ethers.parseUnits("0", 18)),
                  contract.decimals().catch(() => 18),
                  contract.symbol().catch(() => {
                    console.warn(`[Send] Failed to fetch symbol for custom token ${customTokenAddress}, using fallback`)
                    return "TOKEN"
                  }),
                  contract.name().catch(() => {
                    console.warn(`[Send] Failed to fetch name for custom token ${customTokenAddress}, using fallback`)
                    return "Unknown Token"
                  }),
                ])
                
                // Ensure symbol is not empty and not "ETH" unless it's actually ETH
                const tokenSymbol = symbol && symbol.trim() !== "" ? symbol.trim() : "TOKEN"
                
                const balanceFormatted = ethers.formatUnits(balance, decimals)
                console.log(`[Send] Adding custom ETH token: ${tokenSymbol} (${name}) at ${customTokenAddress}`)
                allTokens.push({
                  address: customTokenAddress.toLowerCase(),
                  name: name || "Unknown Token",
                  symbol: tokenSymbol,
                  decimals: Number(decimals),
                  balance: balanceFormatted,
                  isNative: false,
                })
              } catch (error) {
                console.warn(`[Send] Error loading custom token ${customTokenAddress}:`, error)
              }
            }
          }
        } catch (error) {
          console.error("Error loading custom ETH tokens:", error)
        }
      } else if (currentChainId === 97741) {
        const provider = await getProviderWithFallback(currentChainId)
        const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        const currentBlock = await provider.getBlockNumber()
        const lookback = 10000
        const fromBlock = Math.max(0, currentBlock - lookback)

        try {
          const addressTopic = ethers.zeroPadValue(wallet.address, 32)
          const [logsFrom, logsTo] = await Promise.all([
            provider.getLogs({
              fromBlock,
              toBlock: "latest",
              topics: [transferTopic, addressTopic],
            }),
            provider.getLogs({
              fromBlock,
              toBlock: "latest",
              topics: [transferTopic, null, addressTopic],
            }),
          ])

          const logs = [...logsFrom, ...logsTo]
          let tokenAddresses = [...new Set(logs.map((log) => log.address.toLowerCase()))]
          const filteredTokenAddresses = tokenAddresses.filter(
            (addr) => !isTokenBlacklisted(addr, currentChainId)
          )

          for (const tokenAddress of filteredTokenAddresses) {
            try {
              const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
              const [balance, decimals, symbol, name] = await Promise.all([
                contract.balanceOf(wallet.address),
                contract.decimals(),
                contract.symbol().catch(() => {
                  console.warn(`[Send] Failed to fetch symbol for token ${tokenAddress}, using fallback`)
                  return "TOKEN"
                }),
                contract.name().catch(() => {
                  console.warn(`[Send] Failed to fetch name for token ${tokenAddress}, using fallback`)
                  return "Unknown Token"
                }),
              ])
              
              // Ensure symbol is not empty and not "ETH" unless it's actually ETH
              const tokenSymbol = symbol && symbol.trim() !== "" ? symbol.trim() : "TOKEN"
              
              const balanceFormatted = ethers.formatUnits(balance, decimals)
              if (Number.parseFloat(balanceFormatted) > 0) {
                console.log(`[Send] Adding PEPU token: ${tokenSymbol} (${name}) at ${tokenAddress}`)
                allTokens.push({
                  address: tokenAddress,
                  name: name || "Unknown Token",
                  symbol: tokenSymbol,
                  decimals: Number(decimals),
                  balance: balanceFormatted,
                  isNative: false,
                })
              }
            } catch (error) {
              console.error(`Error fetching token ${tokenAddress}:`, error)
            }
          }
        } catch (error) {
          console.error("Error scanning for tokens:", error)
        }
      }

      console.log(`[Send] Total tokens loaded: ${allTokens.length}`)
      allTokens.forEach((token, index) => {
        console.log(`[Send] Token ${index + 1}: ${token.symbol} (${token.name}) - ${token.balance} - isNative: ${token.isNative} - address: ${token.address}`)
      })
      
      setTokens(allTokens)
      if (allTokens.length > 0) {
        if (!selectedToken) {
          console.log(`[Send] No selected token, setting to first: ${allTokens[0].symbol} (${allTokens[0].name})`)
          setSelectedToken(allTokens[0])
          setBalance(allTokens[0].balance)
        } else {
          const updated = allTokens.find((t) => t.address.toLowerCase() === selectedToken.address.toLowerCase())
          if (updated) {
            console.log(`[Send] Found updated token: ${updated.symbol} (${updated.name}) - was ${selectedToken.symbol} (${selectedToken.name})`)
            // Ensure we preserve the correct symbol
            if (updated.symbol && updated.symbol.trim() !== "") {
              setSelectedToken(updated)
              setBalance(updated.balance)
            } else {
              console.warn(`[Send] Updated token has empty symbol, using first token instead`)
              setSelectedToken(allTokens[0])
              setBalance(allTokens[0].balance)
            }
          } else {
            console.log(`[Send] Selected token not found in new list, setting to first: ${allTokens[0].symbol} (${allTokens[0].name})`)
            setSelectedToken(allTokens[0])
            setBalance(allTokens[0].balance)
          }
        }
      } else {
        setSelectedToken(null)
        setBalance("0")
      }
      
      clearTimeout(timeoutId)
    } catch (error: any) {
      console.error("Error loading tokens:", error)
      const errorMsg = error?.message || String(error) || "Unknown error"
      if (errorMsg.includes("RPC") || errorMsg.includes("network") || errorMsg.includes("timeout") || errorMsg.includes("fetch")) {
        setTokenLoadError(`RPC Error: Unable to load tokens. ${errorMsg}`)
      } else {
        setTokenLoadError(`Error loading tokens: ${errorMsg}`)
      }
    } finally {
      clearTimeout(timeoutId)
      setLoadingTokens(false)
    }
  }

  const handleNext = () => {
    if (currentStep === "chain") {
      if (!selectedToken) {
        setError("Please select a token")
        return
      }
      setCurrentStep("recipient")
      setError("")
    } else if (currentStep === "recipient") {
      if (!recipient.trim()) {
        setError("Please enter a recipient address")
        return
      }
      
      // Validate recipient
      let finalRecipient = recipient.trim()
      if (chainId === 97741 && isPepuDomain(recipient)) {
        if (resolvedAddress) {
          finalRecipient = resolvedAddress
        } else {
          setError("Please wait for domain resolution or enter a valid address")
          return
        }
      }
      
      if (!ethers.isAddress(finalRecipient)) {
        setError("Invalid recipient address")
        return
      }
      
      setCurrentStep("amount")
      setError("")
    }
  }

  const handleBack = () => {
    if (currentStep === "recipient") {
      setCurrentStep("chain")
      setError("")
    } else if (currentStep === "amount") {
      setCurrentStep("recipient")
      setError("")
    }
  }

  const handleSend = async () => {
    setError("")

    if (!recipient || !amount || !password || !selectedToken) {
      setError("Please fill in all fields")
      return
    }

    let finalRecipient = recipient.trim()
    if (chainId === 97741 && isPepuDomain(recipient)) {
      if (resolvedAddress) {
        finalRecipient = resolvedAddress
      } else {
        const parsed = parseDomainInput(recipient)
        if (parsed && parsed.tld) {
          const address = await resolvePepuDomain(parsed.name, parsed.tld)
          if (address) {
            finalRecipient = address
          } else {
            setError("Domain not found or expired")
            return
          }
        } else {
          setError("Invalid domain format - must include .pepu or .uchain")
          return
        }
      }
    }

    if (!ethers.isAddress(finalRecipient)) {
      setError("Invalid recipient address")
      return
    }

    if (Number.parseFloat(amount) > Number.parseFloat(balance)) {
      setError("Insufficient balance")
      return
    }

    setLoading(true)
    try {
      const wallets = getWallets()
      if (wallets.length === 0) throw new Error("No wallet found")

      const active = getCurrentWallet() || wallets[0]

      let txHash: string
      if (selectedToken.isNative) {
        txHash = await sendNativeToken(active, password, finalRecipient, amount, chainId)
      } else {
        txHash = await sendToken(active, password, selectedToken.address, finalRecipient, amount, chainId)
      }

      const explorerUrl = chainId === 1 
        ? `https://etherscan.io/tx/${txHash}`
        : `https://pepuscan.com/tx/${txHash}`
      const txHistory = JSON.parse(localStorage.getItem("transaction_history") || "[]")
      txHistory.unshift({
        hash: txHash,
        type: "send",
        to: recipient,
        amount,
        token: selectedToken.symbol,
        chainId,
        timestamp: Date.now(),
        explorerUrl,
      })
      localStorage.setItem("transaction_history", JSON.stringify(txHistory.slice(0, 100)))

      // Show notification
      setNotificationData({
        message: `Transaction sent successfully!`,
        txHash,
        explorerUrl,
      })
      setShowNotification(true)

      setRecipient("")
      setAmount("")
      setPassword("")
      setCurrentStep("chain")
      await loadTokens()

      setTimeout(() => {
        router.push("/dashboard")
      }, 2000)
    } catch (err: any) {
      setError(err.message || "Transaction failed")
    } finally {
      setLoading(false)
    }
  }

  const handleChainSwitch = async (newChainId: number) => {
    console.log(`[Send] Switching to ${newChainId === 1 ? 'ETH' : 'PEPU'} chain`)
    setChainId(newChainId)
    setSelectedToken(null)
    setTokens([])
    setBalance("0")
    localStorage.setItem("selected_chain", newChainId.toString())
    localStorage.setItem("unchained_chain_id", newChainId.toString())
    const provider = getUnchainedProvider()
    provider.setChainId(newChainId)
    // Load tokens explicitly for the newly selected chain to avoid race conditions
    void loadTokens(newChainId)
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <RpcConnectionNotification chainId={chainId} />
      {showNotification && notificationData && (
        <TransactionNotification
          message={notificationData.message}
          txHash={notificationData.txHash}
          explorerUrl={notificationData.explorerUrl}
          onClose={() => {
            setShowNotification(false)
            setNotificationData(null)
          }}
          duration={10000}
        />
      )}
      
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="glass-card rounded-none p-6 border-b border-white/10 sticky top-0">
          <div className="flex items-center gap-3">
            {currentStep !== "chain" && (
              <button
                onClick={handleBack}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <ArrowUp className="w-5 h-5 text-green-500" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Send Tokens</h1>
              <p className="text-sm text-gray-400">
                {currentStep === "chain" && "Select network and token"}
                {currentStep === "recipient" && "Enter recipient address"}
                {currentStep === "amount" && "Enter amount and confirm"}
              </p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Progress Steps */}
          <div className="flex items-center gap-2 mt-4">
            <div className={`flex-1 h-1 rounded-full ${currentStep === "chain" ? "bg-green-500" : "bg-green-500"}`} />
            <div className={`flex-1 h-1 rounded-full ${currentStep === "recipient" || currentStep === "amount" ? "bg-green-500" : "bg-white/10"}`} />
            <div className={`flex-1 h-1 rounded-full ${currentStep === "amount" ? "bg-green-500" : "bg-white/10"}`} />
          </div>
        </div>

        {/* Step Content */}
        <div className="p-4 md:p-8 space-y-6">
          {/* Step 1: Chain & Token Selection */}
          {currentStep === "chain" && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-3">Network</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleChainSwitch(1)}
                    className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all ${
                      chainId === 1 ? "bg-green-500 text-black" : "bg-white/10 text-gray-400 hover:bg-white/20"
                    }`}
                  >
                    Ethereum
                  </button>
                  <button
                    onClick={() => handleChainSwitch(97741)}
                    className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all ${
                      chainId === 97741 ? "bg-green-500 text-black" : "bg-white/10 text-gray-400 hover:bg-white/20"
                    }`}
                  >
                    PEPU
                  </button>
                </div>
              </div>

              <div ref={tokenSelectorRef}>
                <label className="block text-sm text-gray-400 mb-2">Select Token</label>
                <div className="relative">
                  <button
                    onClick={() => setShowTokenSelector(!showTokenSelector)}
                    className="input-field flex items-center justify-between cursor-pointer w-full"
                    disabled={loadingTokens}
                  >
                    <span>
                      {loadingTokens
                        ? "Loading tokens..."
                        : tokenLoadError
                          ? "Error loading tokens"
                          : selectedToken
                            ? `${selectedToken.symbol} - ${selectedToken.name}`
                            : "Select Token"}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showTokenSelector ? "rotate-180" : ""}`} />
                  </button>
                  {showTokenSelector && !loadingTokens && (
                    <div className="absolute z-50 w-full mt-2 glass-card max-h-60 overflow-y-auto border border-white/20">
                      <div className="p-2">
                        {tokenLoadError ? (
                          <div className="p-4">
                            <div className="text-red-400 text-sm mb-2">{tokenLoadError}</div>
                            <button
                              onClick={() => {
                                setTokenLoadError("")
                                loadTokens()
                              }}
                              className="text-xs text-green-400 hover:text-green-300 underline"
                            >
                              Retry
                            </button>
                          </div>
                        ) : tokens.length === 0 ? (
                          <div className="p-4 text-center text-gray-400">No tokens found</div>
                        ) : (
                          tokens.map((token) => (
                            <button
                              key={token.address}
                              onClick={() => {
                                console.log(`[Send] User selected token: ${token.symbol} (${token.name}) at ${token.address}`)
                                // Ensure token has valid symbol before selecting
                                if (!token.symbol || token.symbol.trim() === "") {
                                  console.error(`[Send] Token has empty symbol, cannot select: ${token.address}`)
                                  setError("Token symbol is missing. Please try again.")
                                  return
                                }
                                setSelectedToken(token)
                                setBalance(token.balance)
                                setShowTokenSelector(false)
                              }}
                              className="w-full text-left p-3 rounded-lg hover:bg-white/10 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-semibold">{token.symbol || "TOKEN"}</p>
                                  <p className="text-xs text-gray-400">{token.name || "Unknown Token"}</p>
                                </div>
                                <p className="text-sm text-green-400">{Number.parseFloat(token.balance).toFixed(4)}</p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {selectedToken && (
                  <p className="text-xs text-gray-400 mt-2">
                    Balance: {Number.parseFloat(balance).toFixed(4)} {selectedToken.symbol}
                  </p>
                )}
              </div>

              <button
                onClick={handleNext}
                disabled={!selectedToken || loadingTokens}
                className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Step 2: Recipient */}
          {currentStep === "recipient" && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Recipient Address {chainId === 97741 && <span className="text-green-400">or .pepu domain</span>}
                </label>
                <input
                  type="text"
                  value={recipient}
                  onChange={async (e) => {
                    const value = e.target.value.trim()
                    setRecipient(value)
                    setResolvedAddress("")
                    setDomainInput("")
                    setError("")
                    
                    // Only resolve domains on PEPU chain
                    if (chainId === 97741 && isPepuDomain(value)) {
                      setResolvingDomain(true)
                      const parsed = parseDomainInput(value)
                      if (parsed && parsed.tld) {
                        setDomainInput(`${parsed.name}${parsed.tld}`)
                        const address = await resolvePepuDomain(parsed.name, parsed.tld)
                        if (address) {
                          setResolvedAddress(address)
                        } else {
                          setResolvedAddress("")
                        }
                      } else {
                        setResolvedAddress("")
                        setDomainInput("")
                      }
                      setResolvingDomain(false)
                    }
                  }}
                  placeholder={chainId === 97741 ? "0x... or teck.pepu" : "0x..."}
                  className="input-field"
                />
                {resolvingDomain && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                    <Loader className="w-3 h-3 animate-spin" />
                    Resolving domain...
                  </p>
                )}
                {resolvedAddress && domainInput && (
                  <div className="mt-2 glass-card p-3 border border-green-500/30 bg-green-500/10">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-400">Domain: {domainInput}</p>
                        <p className="text-sm text-green-400 font-mono break-all">{resolvedAddress}</p>
                      </div>
                    </div>
                  </div>
                )}
                {recipient && isPepuDomain(recipient) && !resolvedAddress && !resolvingDomain && chainId === 97741 && (
                  <p className="text-xs text-red-400 mt-1">Domain not found or expired</p>
                )}
                {chainId === 1 && isPepuDomain(recipient) && (
                  <p className="text-xs text-red-400 mt-1">.pepu domains only work on PEPU chain</p>
                )}
              </div>

              {error && (
                <div className="glass-card p-4 border border-red-500/50 bg-red-500/10">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleNext}
                disabled={!recipient.trim() || (chainId === 97741 && isPepuDomain(recipient) && !resolvedAddress)}
                className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Step 3: Amount & Password */}
          {currentStep === "amount" && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Amount</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    className="input-field flex-1"
                    step="0.0001"
                  />
                  <button
                    onClick={() => setAmount(balance)}
                    className="px-4 py-3 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 font-semibold whitespace-nowrap"
                  >
                    MAX
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Balance: {Number.parseFloat(balance).toFixed(4)} {selectedToken?.symbol || ""}
                </p>
              </div>

              {feeWarning && chainId === 97741 && feeWarning.includes("Insufficient balance") && (
                <div className="glass-card p-4 border border-red-500/50 bg-red-500/10">
                  <p className="text-red-400 text-sm">{feeWarning}</p>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="input-field"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (confirmWalletReset()) {
                      clearAllWallets()
                      router.push("/setup")
                    }
                  }}
                  className="mt-2 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Forgot Password? Reset Wallet
                </button>
              </div>

              {error && (
                <div className="glass-card p-4 border border-red-500/50 bg-red-500/10">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleSend}
                disabled={
                  loading || 
                  !recipient || 
                  !amount || 
                  !password || 
                  !selectedToken ||
                  (chainId === 97741 && !feeCalculated)
                }
                className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader className="w-4 h-4 animate-spin" />}
                {loading 
                  ? "Sending..." 
                  : chainId === 97741 && !feeCalculated
                  ? "Preparing..."
                  : `Send ${selectedToken?.symbol || ""}`
                }
              </button>
            </>
          )}
        </div>
      </div>

      <BottomNav active="send" />
    </div>
  )
}
