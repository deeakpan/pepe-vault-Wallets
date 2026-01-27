"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getWallets, getPrivateKey, getCurrentWalletId, setCurrentWalletId, getSessionPassword, unlockWallet } from "@/lib/wallet"
import { getProvider, getChainName } from "@/lib/rpc"
import { getUnchainedProvider } from "@/lib/provider"
import { getDomainByWallet } from "@/lib/domains"
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Shield,
  Zap,
  ArrowRight,
  Building2,
  Coins,
  FileText,
  Activity,
  Info,
  Lock,
  Unlock,
} from "lucide-react"
import { ethers } from "ethers"

// ERC20 Transfer function signature: transfer(address,uint256)
const TRANSFER_SIGNATURE = "0xa9059cbb"
const APPROVE_SIGNATURE = "0x095ea7b3"
const TRANSFER_FROM_SIGNATURE = "0x23b872dd"

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]

interface TokenInfo {
  name: string
  symbol: string
  decimals: number
  address: string
}

interface TransactionAnalysis {
  type: "native" | "token_transfer" | "token_approve" | "contract_interaction" | "unknown"
  tokenInfo?: TokenInfo
  functionName?: string
  amount?: string
  recipient?: string
  spender?: string
  contractAddress?: string
}

export default function SignPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [method, setMethod] = useState("")
  const [origin, setOrigin] = useState("")
  const [params, setParams] = useState<any>(null)
  const [approved, setApproved] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [riskLevel, setRiskLevel] = useState<"low" | "medium" | "high">("low")
  const [selectedChainId, setSelectedChainId] = useState<number>(1)
  const [wallets, setWallets] = useState<any[]>([])
  const [selectedWalletId, setSelectedWalletId] = useState<string>("")
  const [walletDomains, setWalletDomains] = useState<Record<string, string>>({})
  const [isWalletConnect, setIsWalletConnect] = useState(false)
  const [wcRequest, setWcRequest] = useState<any>(null)
  const [txAnalysis, setTxAnalysis] = useState<TransactionAnalysis | null>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [gasEstimate, setGasEstimate] = useState<string>("")
  const [contractName, setContractName] = useState<string>("")

  useEffect(() => {
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    // Force PEPU chain only
    const provider = getUnchainedProvider()
    provider.setChainId(97741)
    setSelectedChainId(97741)

    const wcRequestId = searchParams.get("wc_request")
    if (wcRequestId) {
      setIsWalletConnect(true)
      import("@/lib/walletConnect").then((mod) => {
        const request = mod.getStoredRequest(wcRequestId)
        if (request) {
          setWcRequest(request)
          const requestMethod = request.params.request.method
          const requestParams = request.params.request.params || []
          
          setMethod(requestMethod)
          
          const session = request.session
          const dappUrl = session?.peer?.metadata?.url || "Unknown dApp"
          setOrigin(dappUrl)
          
          if (requestMethod === "eth_sendTransaction") {
            setParams(requestParams)
          } else if (requestMethod === "personal_sign" || requestMethod === "eth_sign") {
            setParams([requestParams[0], requestParams[1]])
          } else if (requestMethod === "eth_signTypedData" || requestMethod === "eth_signTypedData_v4") {
            setParams(requestParams)
          }
        }
      }).catch(console.error)
    } else {
      const methodParam = searchParams.get("method") || ""
      const originParam = searchParams.get("origin") || "Unknown"
      const paramsParam = searchParams.get("params")

      setMethod(methodParam)
      setOrigin(originParam)

      if (paramsParam) {
        try {
          const parsedParams = JSON.parse(decodeURIComponent(paramsParam))
          setParams(parsedParams)

          if (methodParam === "eth_sendTransaction") {
            const tx = parsedParams[0] || parsedParams
            const value = tx.value ? ethers.toBeHex(tx.value) : "0x0"
            const valueNum = Number.parseFloat(ethers.formatEther(value))
            if (valueNum > 1 || (tx.data && tx.data.length > 100)) {
              setRiskLevel("high")
            } else if (tx.data && tx.data !== "0x") {
              setRiskLevel("medium")
            }
          }
        } catch (e) {
          console.error("[v0] Error parsing params:", e)
        }
      }
    }

    const allWallets = getWallets()
    setWallets(allWallets)
    const currentId = getCurrentWalletId()
    if (currentId && allWallets.find((w) => w.id === currentId)) {
      setSelectedWalletId(currentId)
    } else if (allWallets.length > 0) {
      setSelectedWalletId(allWallets[0].id)
    }

    // Load VAULT Domains for all wallets so we can show domain names in the selector
    const loadDomains = async () => {
      const domainMap: Record<string, string> = {}

      for (const wallet of allWallets) {
        try {
          const domain = await getDomainByWallet(wallet.address)
          if (domain) {
            domainMap[wallet.id] = domain
          }
        } catch (error) {
          console.error("[Sign] Error loading domain for wallet", wallet.address, error)
        }
      }

      setWalletDomains(domainMap)
    }

    void loadDomains()
  }, [router, searchParams])

  // Analyze transaction when params change
  useEffect(() => {
    if (method === "eth_sendTransaction" && params) {
      analyzeTransaction()
    }
  }, [params, method, selectedChainId])

  const analyzeTransaction = async () => {
    if (!params || method !== "eth_sendTransaction") return

    setLoadingAnalysis(true)
    try {
      const tx = params[0] || params
      const txData: TransactionAnalysis = {
        type: "unknown",
      }

      // Check if it's a native transfer
      const value = tx.value ? BigInt(tx.value) : BigInt(0)
      const hasData = tx.data && tx.data !== "0x" && tx.data.length > 2

      if (!hasData && value > 0) {
        txData.type = "native"
        txData.amount = ethers.formatEther(value.toString())
        txData.recipient = tx.to
      } else if (hasData) {
        const data = tx.data.toLowerCase()
        const functionSig = data.slice(0, 10)

        // Check for ERC20 transfer
        if (functionSig === TRANSFER_SIGNATURE) {
          try {
            const iface = new ethers.Interface([
              "function transfer(address to, uint256 amount)",
            ])
            const decoded = iface.decodeFunctionData("transfer", tx.data)
            txData.type = "token_transfer"
            txData.recipient = decoded[0]
            txData.contractAddress = tx.to

            // Fetch token info - PEPU only
            const provider = getProvider(97741)
            try {
              const tokenContract = new ethers.Contract(tx.to, ERC20_ABI, provider)
              const [name, symbol, decimals] = await Promise.all([
                tokenContract.name().catch(() => "Unknown Token"),
                tokenContract.symbol().catch(() => "???"),
                tokenContract.decimals().catch(() => 18),
              ])

              txData.tokenInfo = {
                name,
                symbol,
                decimals: Number(decimals),
                address: tx.to,
              }

              // Format amount
              const amount = decoded[1]
              txData.amount = ethers.formatUnits(amount, decimals)
            } catch (e) {
              console.error("Error fetching token info:", e)
            }
          } catch (e) {
            console.error("Error decoding transfer:", e)
          }
        } else if (functionSig === APPROVE_SIGNATURE) {
          try {
            const iface = new ethers.Interface([
              "function approve(address spender, uint256 amount)",
            ])
            const decoded = iface.decodeFunctionData("approve", tx.data)
            txData.type = "token_approve"
            txData.spender = decoded[0]
            txData.contractAddress = tx.to

            // Fetch token info - PEPU only
            const provider = getProvider(97741)
            try {
              const tokenContract = new ethers.Contract(tx.to, ERC20_ABI, provider)
              const [name, symbol, decimals] = await Promise.all([
                tokenContract.name().catch(() => "Unknown Token"),
                tokenContract.symbol().catch(() => "???"),
                tokenContract.decimals().catch(() => 18),
              ])

              txData.tokenInfo = {
                name,
                symbol,
                decimals: Number(decimals),
                address: tx.to,
              }

              // Format amount
              const amount = decoded[1]
              if (amount === ethers.MaxUint256) {
                txData.amount = "Unlimited"
              } else {
                txData.amount = ethers.formatUnits(amount, decimals)
              }
            } catch (e) {
              console.error("Error fetching token info:", e)
            }
          } catch (e) {
            console.error("Error decoding approve:", e)
          }
        } else {
          // Contract interaction
          txData.type = "contract_interaction"
          txData.contractAddress = tx.to
          txData.functionName = functionSig

          // Try to get contract name from code - PEPU only
          try {
            const provider = getProvider(97741)
            const code = await provider.getCode(tx.to)
            if (code && code !== "0x") {
              setContractName("Smart Contract")
            }
          } catch (e) {
            console.error("Error checking contract:", e)
          }
        }
      } else {
        txData.type = "contract_interaction"
        txData.contractAddress = tx.to
      }

      setTxAnalysis(txData)

      // Calculate actual gas fee from PEPU RPC - PEPU only
      try {
        const provider = getProvider(97741)
        const wallet = wallets.find((w) => w.id === selectedWalletId) || wallets[0]
        
        if (wallet && tx.to) {
          // Get real-time gas price from PEPU RPC
          const feeData = await provider.getFeeData()
          const gasPrice = feeData.gasPrice || BigInt(0)
          
          // Use provided gas limit if available, otherwise estimate
          let gasLimit: bigint
          if (tx.gas) {
            gasLimit = BigInt(tx.gas)
          } else {
            // Estimate gas limit from RPC
            try {
              const estimatedGas = await provider.estimateGas({
                to: tx.to,
                value: tx.value || "0x0",
                data: tx.data || "0x",
                from: wallet.address,
              })
              gasLimit = estimatedGas
            } catch (estimateError) {
              // If estimation fails, use a default safe value
              console.warn("Gas estimation failed, using default:", estimateError)
              gasLimit = BigInt(21000) // Default for simple transfers
            }
          }
          
          // Calculate actual fee: gasLimit * gasPrice
          const gasCost = gasLimit * gasPrice
          const feeInPepu = ethers.formatEther(gasCost.toString())
          
          // Format to show reasonable precision (up to 6 decimal places)
          const feeNum = Number.parseFloat(feeInPepu)
          if (feeNum < 0.000001) {
            setGasEstimate(feeNum.toExponential(2))
          } else if (feeNum < 1) {
            setGasEstimate(feeNum.toFixed(6))
          } else {
            setGasEstimate(feeNum.toFixed(4))
          }
        } else {
          // Fallback if no wallet or tx.to
          setGasEstimate("Calculating...")
        }
      } catch (e) {
        console.error("Error calculating gas fee from RPC:", e)
        // Try to get at least the gas price even if estimation fails
        try {
          const provider = getProvider(97741)
          const feeData = await provider.getFeeData()
          const gasPrice = feeData.gasPrice || BigInt(0)
          // Use default gas limit of 21000 for simple transfers
          const defaultGasLimit = BigInt(21000)
          const gasCost = defaultGasLimit * gasPrice
          const feeInPepu = ethers.formatEther(gasCost.toString())
          const feeNum = Number.parseFloat(feeInPepu)
          if (feeNum < 0.000001) {
            setGasEstimate(feeNum.toExponential(2))
          } else if (feeNum < 1) {
            setGasEstimate(feeNum.toFixed(6))
          } else {
            setGasEstimate(feeNum.toFixed(4))
          }
        } catch (fallbackError) {
          console.error("Fallback gas calculation failed:", fallbackError)
          setGasEstimate("Unable to calculate")
        }
      }
    } catch (e) {
      console.error("Error analyzing transaction:", e)
    } finally {
      setLoadingAnalysis(false)
    }
  }

  const handleApprove = async () => {
    if (!params) {
      setError("Invalid transaction parameters")
      return
    }

    setLoading(true)
    try {
      if (wallets.length === 0) {
        throw new Error("No wallet found")
      }

      const wallet = wallets.find((w) => w.id === selectedWalletId) || wallets[0]
      setCurrentWalletId(wallet.id)
      
      // Check if this is an extension request
      const fromExtension = searchParams.get("from") === "extension"
      
      // For extension requests, try to auto-unlock using persisted password
      let sessionPassword = getSessionPassword()
      if (!sessionPassword && fromExtension) {
        // Try to get persisted password and auto-unlock
        const persistedPassword = localStorage.getItem("unchained_persist_password")
        if (persistedPassword) {
          const unlocked = unlockWallet(persistedPassword)
          if (unlocked) {
            sessionPassword = persistedPassword
          }
        }
      }
      
      if (!sessionPassword) {
        throw new Error("Missing signing key. Please re-import your wallet with the latest version.")
      }
      const privateKey = getPrivateKey(wallet, sessionPassword)

      let result: any = null

      if (method === "eth_sendTransaction") {
        const tx = params[0] || params
        // Force PEPU chain
        const rpcProvider = getProvider(97741)
        const walletInstance = new ethers.Wallet(privateKey, rpcProvider)

        const txRequest: any = {
          to: tx.to,
          value: tx.value || "0x0",
          data: tx.data || "0x",
        }

        if (tx.gas) {
          txRequest.gasLimit = tx.gas
        }

        // Always use PEPU chain
        const provider = getUnchainedProvider()
        provider.setChainId(97741)

        const txResponse = await walletInstance.sendTransaction(txRequest)
        result = txResponse.hash
      } else if (method === "personal_sign" || method === "eth_sign") {
        const message = params[0]
        const walletInstance = new ethers.Wallet(privateKey)
        result = await walletInstance.signMessage(message)
      } else if (method === "eth_signTypedData_v4" || method === "eth_signTypedData") {
        const domain = params[0]
        const types = params[1]
        const value = params[2]
        const walletInstance = new ethers.Wallet(privateKey)
        result = await walletInstance.signTypedData(domain, types, value)
      }

      setApproved(true)

      const fromBrowser = searchParams.get("from") === "browser"
      const requestId = searchParams.get("requestId")
      
      if (fromExtension && requestId) {
        setTimeout(() => {
          window.location.href = `/extension-response?requestId=${requestId}&result=${encodeURIComponent(result)}`
        }, 1000)
        return
      } else if (fromBrowser && requestId) {
        localStorage.setItem(`browser_result_${requestId}`, JSON.stringify(result))
        setTimeout(() => {
          router.push("/browser?wallet_status=approved&requestId=" + requestId)
        }, 1000)
        return
      }

      if (isWalletConnect && wcRequest) {
        const wcMod = await import("@/lib/walletConnect")
        await wcMod.approveSessionRequest(wcRequest.id, result)
        
        setTimeout(() => {
          window.close()
          if (window.opener) {
            window.close()
          } else {
            router.push("/dashboard")
          }
        }, 1500)
      } else {
        const returnOrigin = localStorage.getItem("unchained_return_origin") || origin
        const returnUrl = localStorage.getItem("unchained_return_url") || returnOrigin
        const requestId = searchParams.get("requestId") || localStorage.getItem("unchained_request_id") || ""
        
        const returnUrlObj = new URL(returnUrl)
        returnUrlObj.searchParams.set("wallet_result", encodeURIComponent(result))
        returnUrlObj.searchParams.set("wallet_request_id", requestId)
        returnUrlObj.searchParams.set("wallet_status", "approved")
        
        setTimeout(() => {
          window.location.href = returnUrlObj.toString()
        }, 1500)
      }
    } catch (err: any) {
      setError(err.message || "Signing failed")
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (isWalletConnect && wcRequest) {
      try {
        const wcMod = await import("@/lib/walletConnect")
        await wcMod.rejectSessionRequest(wcRequest.id, "USER_REJECTED")
        setRejected(true)
        setTimeout(() => {
          window.close()
          if (window.opener) {
            window.close()
          } else {
            router.push("/dashboard")
          }
        }, 1500)
      } catch (err: any) {
        setError(err.message || "Failed to reject")
      }
    } else {
      const requestId = searchParams.get("requestId")
      const fromExtension = searchParams.get("from") === "extension"
      
      if (fromExtension && requestId) {
        setRejected(true)
        setTimeout(() => {
          window.location.href = `/extension-response?requestId=${requestId}&error=${encodeURIComponent("User rejected transaction")}`
        }, 1000)
      } else {
        setRejected(true)
        const returnOrigin = localStorage.getItem("unchained_return_origin") || origin
        const returnUrl = localStorage.getItem("unchained_return_url") || returnOrigin
        const reqId = requestId || searchParams.get("requestId") || localStorage.getItem("unchained_request_id") || ""
        
        const returnUrlObj = new URL(returnUrl)
        returnUrlObj.searchParams.set("wallet_error", "User rejected transaction")
        returnUrlObj.searchParams.set("wallet_request_id", reqId)
        returnUrlObj.searchParams.set("wallet_status", "rejected")
        
        setTimeout(() => {
          window.location.href = returnUrlObj.toString()
        }, 1000)
      }
    }
  }

  const getDomainName = (url: string) => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }

  const formatAddress = (address: string) => {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A"
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const getExplorerUrl = (address: string) => {
    return `https://pepuscan.com/address/${address}`
  }

  if (!params) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading transaction details...</p>
        </div>
      </div>
    )
  }

  const txData = method === "eth_sendTransaction" ? params[0] || params : null
  const messageData = method === "personal_sign" ? params[0] : null
  const wallet = wallets.find((w) => w.id === selectedWalletId) || wallets[0]

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white">
      {/* Header */}
      <div className="bg-black/50 backdrop-blur-xl border-b border-white/10 p-4 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-blue-500 flex items-center justify-center shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Review Transaction</h1>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Activity className="w-3 h-3" />
                {getDomainName(origin)}
              </p>
            </div>
          </div>
          {wallets.length > 0 && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-gray-500 mb-1">Wallet</span>
              <select
                value={selectedWalletId}
                onChange={(e) => setSelectedWalletId(e.target.value)}
                className="bg-white/5 border border-white/20 text-xs rounded px-2 py-1 text-gray-200"
              >
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {(walletDomains[wallet.id] || wallet.name || "Wallet") +
                      " - " +
                      wallet.address.slice(0, 6) +
                      "..." +
                      wallet.address.slice(-4)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-4">
        {/* Risk Warning */}
        {riskLevel === "high" && (
          <div className="bg-red-500/10 border-2 border-red-500/30 rounded-xl p-4 flex items-start gap-3 animate-pulse">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 font-bold mb-1">⚠️ High Risk Transaction</p>
              <p className="text-red-300 text-sm">Please verify all details carefully before approving.</p>
            </div>
          </div>
        )}

        {/* Transaction Type Badge */}
        <div className="glass-card rounded-xl p-4 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {method === "eth_sendTransaction" ? (
                <Zap className="w-5 h-5 text-green-400" />
              ) : (
                <FileText className="w-5 h-5 text-blue-400" />
              )}
              <span className="text-gray-400 text-sm">Transaction Type</span>
            </div>
            <span
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                method === "eth_sendTransaction"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {method === "eth_sendTransaction" ? "Transaction" : "Message Sign"}
            </span>
          </div>
        </div>

        {/* Network Info - PEPU Only */}
        {method === "eth_sendTransaction" && (
          <div className="glass-card rounded-xl p-4 border border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-gray-400 text-sm">Network</span>
            </div>
            <p className="text-white font-semibold mt-2">PEPU Chain</p>
            <p className="text-xs text-gray-500 mt-1">Chain ID: 97741</p>
          </div>
        )}

        {/* Transaction Details - Enhanced */}
        {txData && (
          <>
            {/* From Address */}
            <div className="glass-card rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" />
                  From
                </span>
                <button
                  onClick={() => copyToClipboard(wallet?.address || "")}
                  className="text-gray-400 hover:text-green-400 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-white font-mono text-sm break-all bg-black/30 p-2 rounded">
                {wallet?.address || "N/A"}
              </p>
            </div>

            {/* Transaction Analysis */}
            {loadingAnalysis ? (
              <div className="glass-card rounded-xl p-6 border border-white/10 text-center">
                <div className="w-8 h-8 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Analyzing transaction...</p>
              </div>
            ) : txAnalysis && (
              <div className="glass-card rounded-xl p-5 border border-white/10 space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-5 h-5 text-blue-400" />
                  <h3 className="font-bold text-lg">Transaction Details</h3>
                </div>

                {/* Token Transfer */}
                {txAnalysis.type === "token_transfer" && txAnalysis.tokenInfo && (
                  <>
                    <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg p-4 border border-green-500/20">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                          <Coins className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                          <p className="font-bold text-lg">{txAnalysis.tokenInfo.name}</p>
                          <p className="text-xs text-gray-400">{txAnalysis.tokenInfo.symbol}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-sm">Amount</span>
                          <span className="text-white font-bold text-xl">
                            {txAnalysis.amount} {txAnalysis.tokenInfo.symbol}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-white/10">
                          <span className="text-gray-400 text-sm">To</span>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-mono text-sm">
                              {formatAddress(txAnalysis.recipient || "")}
                            </span>
                            <a
                              href={getExplorerUrl(txAnalysis.recipient || "")}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-sm">Token Contract</span>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-mono text-xs">
                              {formatAddress(txAnalysis.contractAddress || "")}
                            </span>
                            <a
                              href={getExplorerUrl(txAnalysis.contractAddress || "")}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Token Approval */}
                {txAnalysis.type === "token_approve" && txAnalysis.tokenInfo && (
                  <>
                    <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-lg p-4 border border-yellow-500/20">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                          {txAnalysis.amount === "Unlimited" ? (
                            <Unlock className="w-5 h-5 text-yellow-400" />
                          ) : (
                            <Lock className="w-5 h-5 text-yellow-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-lg">Token Approval</p>
                          <p className="text-xs text-gray-400">{txAnalysis.tokenInfo.name}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-sm">Amount</span>
                          <span className={`font-bold text-lg ${txAnalysis.amount === "Unlimited" ? "text-yellow-400" : "text-white"}`}>
                            {txAnalysis.amount === "Unlimited" ? "⚠️ Unlimited" : `${txAnalysis.amount} ${txAnalysis.tokenInfo.symbol}`}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-white/10">
                          <span className="text-gray-400 text-sm">Spender</span>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-mono text-sm">
                              {formatAddress(txAnalysis.spender || "")}
                            </span>
                            <a
                              href={getExplorerUrl(txAnalysis.spender || "")}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-sm">Token Contract</span>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-mono text-xs">
                              {formatAddress(txAnalysis.contractAddress || "")}
                            </span>
                            <a
                              href={getExplorerUrl(txAnalysis.contractAddress || "")}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Native Transfer */}
                {txAnalysis.type === "native" && (
                  <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg p-4 border border-purple-500/20">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="font-bold text-lg">Native Transfer</p>
                        <p className="text-xs text-gray-400">PEPU</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Amount</span>
                        <span className="text-white font-bold text-xl">
                          {txAnalysis.amount} PEPU
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-white/10">
                        <span className="text-gray-400 text-sm">To</span>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-mono text-sm">
                            {formatAddress(txAnalysis.recipient || "")}
                          </span>
                          <a
                            href={getExplorerUrl(txAnalysis.recipient || "")}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-400 hover:text-green-300"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Contract Interaction */}
                {txAnalysis.type === "contract_interaction" && (
                  <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-lg p-4 border border-blue-500/20">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="font-bold text-lg">Smart Contract Interaction</p>
                        <p className="text-xs text-gray-400">{contractName || "Unknown Contract"}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Contract Address</span>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-mono text-xs">
                            {formatAddress(txAnalysis.contractAddress || txData.to || "")}
                          </span>
                          <a
                            href={getExplorerUrl(txAnalysis.contractAddress || txData.to || "")}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-400 hover:text-green-300"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                      {txData.value && BigInt(txData.value) > 0 && (
                        <div className="flex justify-between items-center pt-2 border-t border-white/10">
                          <span className="text-gray-400 text-sm">Value</span>
                          <span className="text-white font-bold">
                            {ethers.formatEther(txData.value)} PEPU
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* To Address (fallback) */}
                {!txAnalysis && txData.to && (
                  <div className="bg-white/5 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-400 text-sm">To</span>
                      <a
                        href={getExplorerUrl(txData.to)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-400 hover:text-green-300"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <p className="text-white font-mono text-sm break-all">{formatAddress(txData.to)}</p>
                  </div>
                )}

                {/* Amount (fallback) */}
                {!txAnalysis && txData.value && (
                  <div className="bg-white/5 rounded-lg p-4">
                    <span className="text-gray-400 text-sm">Amount</span>
                    <p className="text-white text-xl font-bold mt-2">
                      {ethers.formatEther(txData.value)} PEPU
                    </p>
                  </div>
                )}

                {/* Gas Estimate */}
                <div className="bg-white/5 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-gray-400 text-sm">Estimated Gas Fee</span>
                  </div>
                  <p className="text-white font-semibold">
                    {gasEstimate || "~0.001"} PEPU
                  </p>
                </div>
              </div>
            )}

            {/* To Address (if no analysis) */}
            {!txAnalysis && txData.to && (
              <div className="glass-card rounded-xl p-4 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">To</span>
                  <a
                    href={getExplorerUrl(txData.to)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-400 hover:text-green-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <p className="text-white font-mono text-sm break-all bg-black/30 p-2 rounded">
                  {formatAddress(txData.to)}
                </p>
              </div>
            )}
          </>
        )}

        {/* Message Data */}
        {messageData && (
          <div className="glass-card rounded-xl p-4 border border-white/10">
            <span className="text-gray-400 text-sm mb-2 block">Message</span>
            <p className="text-white text-sm mt-2 break-all font-mono bg-black/50 p-3 rounded border border-white/10">
              {messageData}
            </p>
          </div>
        )}

        {/* Advanced Details */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full glass-card rounded-xl p-4 border border-white/10 flex items-center justify-between hover:bg-white/10 transition-colors"
        >
          <span className="text-gray-400 text-sm flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Advanced Details
          </span>
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvanced && txData && (
          <div className="glass-card rounded-xl p-4 border border-white/10 space-y-3">
            {txData.gas && (
              <div>
                <span className="text-gray-400 text-xs">Gas Limit</span>
                <p className="text-white font-mono text-sm mt-1">{txData.gas}</p>
              </div>
            )}
            {txData.data && txData.data !== "0x" && (
              <div>
                <span className="text-gray-400 text-xs mb-2 block">Transaction Data</span>
                <p className="text-white font-mono text-xs break-all bg-black/50 p-3 rounded border border-white/10">
                  {txData.data}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border-2 border-red-500/30 rounded-xl p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {approved && (
          <div className="bg-green-500/10 border-2 border-green-500/30 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-400" />
            <p className="text-green-400 font-bold">Transaction Approved</p>
          </div>
        )}

        {/* Rejected Message */}
        {rejected && (
          <div className="bg-red-500/10 border-2 border-red-500/30 rounded-xl p-4 flex items-center gap-3">
            <XCircle className="w-6 h-6 text-red-400" />
            <p className="text-red-400 font-bold">Transaction Rejected</p>
          </div>
        )}

        {/* Action Buttons */}
        {!approved && !rejected && (
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleReject}
              className="flex-1 bg-red-500/20 border-2 border-red-500/50 text-red-400 font-bold py-4 rounded-xl hover:bg-red-500/30 transition-all"
            >
              Reject
            </button>
            <button
              onClick={handleApprove}
              disabled={loading || loadingAnalysis}
              className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-black font-bold py-4 rounded-xl hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  Approve & Sign
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
