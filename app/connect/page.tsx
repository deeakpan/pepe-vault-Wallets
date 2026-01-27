"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getWalletState, getWallets, getCurrentWalletId, setCurrentWalletId } from "@/lib/wallet"
import { getUnchainedProvider } from "@/lib/provider"
import { AlertCircle, CheckCircle, XCircle, Globe } from "lucide-react"
import { getDomainByWallet } from "@/lib/domains"

export default function ConnectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [origin, setOrigin] = useState("")
  const [method, setMethod] = useState("")
  const [approved, setApproved] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [wallets, setWallets] = useState<any[]>([])
  const [selectedWalletId, setSelectedWalletId] = useState<string>("")
  const [walletDomains, setWalletDomains] = useState<Record<string, string>>({})
  const [isWalletConnect, setIsWalletConnect] = useState(false)
  const [wcProposal, setWcProposal] = useState<any>(null)

  useEffect(() => {
    // Check if wallet exists
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    // Check if this is a WalletConnect proposal
    const wcProposalId = searchParams.get("wc_proposal")
    if (wcProposalId) {
      setIsWalletConnect(true)
      // Dynamic import to avoid SSR analysis
      import("@/lib/walletConnect").then((mod) => {
        const proposal = mod.getStoredProposal(wcProposalId)
        if (proposal) {
          setWcProposal(proposal)
          const dappName = proposal.params.proposer.metadata?.name || "Unknown dApp"
          const dappUrl = proposal.params.proposer.metadata?.url || ""
          setOrigin(dappUrl || dappName)
          setMethod("WalletConnect Session")
        }
      }).catch(console.error)
    } else {
      // Regular injected provider flow
      const originParam = searchParams.get("origin") || "Unknown App"
    const methodParam = searchParams.get("method") || "eth_requestAccounts"
    setOrigin(originParam)
    setMethod(methodParam)
    }

    const allWallets = getWallets()
    setWallets(allWallets)
    const currentId = getCurrentWalletId()
    if (currentId && allWallets.find((w) => w.id === currentId)) {
      setSelectedWalletId(currentId)
    } else if (allWallets.length > 0) {
      setSelectedWalletId(allWallets[0].id)
    }

    // Load VAULT Domains for all wallets so we can show the domain instead of generic wallet name
    const loadDomains = async () => {
      const domainMap: Record<string, string> = {}

      for (const wallet of allWallets) {
        try {
          const domain = await getDomainByWallet(wallet.address)
          if (domain) {
            domainMap[wallet.id] = domain
          }
        } catch (error) {
          console.error("[Connect] Error loading domain for wallet", wallet.address, error)
        }
      }

      setWalletDomains(domainMap)
    }

    void loadDomains()
  }, [router, searchParams])

  const handleApprove = async () => {
    setLoading(true)
    try {
      if (wallets.length === 0) {
        setError("No wallet found")
        setLoading(false)
        return
      }

      const wallet = wallets.find((w) => w.id === selectedWalletId) || wallets[0]
      setCurrentWalletId(wallet.id)

      if (isWalletConnect && wcProposal) {
        // Handle WalletConnect session proposal
        const chainId = 1 // Ethereum mainnet
        const wcMod = await import("@/lib/walletConnect")
        await wcMod.approveSessionProposal(wcProposal.id, [wallet.address.toLowerCase()], chainId)
        
        // Track connection
        const provider = getUnchainedProvider()
        const dappUrl = wcProposal.params.proposer.metadata?.url || origin
        const dappName = wcProposal.params.proposer.metadata?.name || "Unknown dApp"
        provider.addConnectedDApp(dappUrl, dappName)

        setApproved(true)
        // WalletConnect handles the response internally, just close after a delay
        setTimeout(() => {
          window.close() // Close popup if opened in popup, or navigate back
          if (window.opener) {
            window.close()
          } else {
            router.push("/dashboard")
          }
        }, 1500)
      } else {
        // Regular injected provider flow
        const provider = getUnchainedProvider()
        const returnOrigin = localStorage.getItem("unchained_return_origin") || origin
        const dappName = new URL(returnOrigin).hostname
        provider.addConnectedDApp(returnOrigin, dappName)

      const result = {
        approved: true,
          accounts: [wallet.address.toLowerCase()],
        chainId: "0x1",
        timestamp: Date.now(),
      }

        // Check if this is from browser iframe or extension
        const fromBrowser = searchParams.get("from") === "browser"
        const fromExtension = searchParams.get("from") === "extension"
        const requestId = searchParams.get("requestId")
        
        if (fromExtension && requestId) {
          // This is from extension - redirect with result in URL
          setApproved(true)
          
          // Redirect to response page with result in query params
          setTimeout(() => {
            window.location.href = `/extension-response?requestId=${requestId}&result=${encodeURIComponent(JSON.stringify(result.accounts))}`
          }, 1000)
        } else if (fromBrowser && requestId) {
          // This is from browser iframe - store result and redirect back
          setApproved(true)
          
          // Store result in localStorage (iframe will check for it)
          localStorage.setItem(`unchained_result_${requestId}`, JSON.stringify(result))
          
          // Get iframe URL from request storage
          const requestStr = localStorage.getItem(`browser_request_${requestId}`)
          let iframeUrl = window.location.origin
          if (requestStr) {
            try {
              const requestData = JSON.parse(requestStr)
              iframeUrl = requestData.iframeUrl || window.location.origin
            } catch (e) {
              // Use current origin
            }
          }
          
          // Redirect back to browser with iframe URL
          setTimeout(() => {
            if (iframeUrl && iframeUrl !== window.location.origin + '/browser') {
              // Redirect to browser and restore iframe
              window.location.href = `/browser?url=${encodeURIComponent(iframeUrl)}&wallet_status=approved&requestId=${requestId}`
            } else {
              router.push("/browser?wallet_status=approved&requestId=" + requestId)
            }
          }, 1000)
        } else {
          // Regular redirect back to dApp with result (like OAuth callback)
          const returnUrl = localStorage.getItem("unchained_return_url") || returnOrigin
          const returnUrlObj = new URL(returnUrl)
          returnUrlObj.searchParams.set("wallet_result", encodeURIComponent(JSON.stringify(result)))
          returnUrlObj.searchParams.set("wallet_status", "approved")
          
          setApproved(true)
          setTimeout(() => {
            window.location.href = returnUrlObj.toString()
          }, 1000)
        }
      }
    } catch (err: any) {
      setError(err.message || "Connection failed")
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (isWalletConnect && wcProposal) {
      // Handle WalletConnect rejection
      try {
        const wcMod = await import("@/lib/walletConnect")
        await wcMod.rejectSessionProposal(wcProposal.id, "USER_REJECTED")
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
      // Regular injected provider flow
      const fromExtension = searchParams.get("from") === "extension"
      const requestId = searchParams.get("requestId")
      
      if (fromExtension && requestId) {
        // Redirect with rejection error
        setRejected(true)
        setTimeout(() => {
          window.location.href = `/extension-response?requestId=${requestId}&error=${encodeURIComponent("User rejected connection")}`
        }, 1000)
      } else {
        const returnOrigin = localStorage.getItem("unchained_return_origin") || origin
        const returnUrl = localStorage.getItem("unchained_return_url") || returnOrigin
        
        const returnUrlObj = new URL(returnUrl)
        returnUrlObj.searchParams.set("wallet_error", "User rejected connection")
        returnUrlObj.searchParams.set("wallet_status", "rejected")
        
        setRejected(true)
        setTimeout(() => {
          window.location.href = returnUrlObj.toString()
        }, 1000)
      }
    }
  }

  const getDomainName = (origin: string) => {
    try {
      const url = new URL(origin)
      return url.hostname
    } catch {
      return origin
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Card */}
        <div className="glass-card rounded-2xl border border-white/20">
          {/* Header */}
          <div className="border-b border-white/10 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <Globe className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Connection Request</h1>
                <p className="text-xs text-gray-400">App wants to connect</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Wallet Selector */}
            {wallets.length > 0 && (
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <p className="text-xs text-gray-400 mb-2">Select PEPU VAULT WALLET</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {wallets.map((wallet) => (
                    <label key={wallet.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        className="accent-green-500"
                        checked={selectedWalletId === wallet.id}
                        onChange={() => setSelectedWalletId(wallet.id)}
                      />
                      <div>
                        <p className="font-semibold">
                          {walletDomains[wallet.id] || wallet.name || "Wallet"}
                        </p>
                        <p className="font-mono text-[10px] text-gray-400">
                          {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Origin */}
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-xs text-gray-400 mb-2">Requesting App</p>
              {isWalletConnect && wcProposal ? (
                <>
                  <p className="text-sm font-semibold text-green-400">
                    {wcProposal.params.proposer.metadata?.name || "Unknown dApp"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {wcProposal.params.proposer.metadata?.url || ""}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    {wcProposal.params.proposer.metadata?.description || ""}
                  </p>
                </>
              ) : (
                <>
              <p className="text-sm font-mono text-green-400 break-all">{getDomainName(origin)}</p>
              <p className="text-xs text-gray-500 mt-1">{origin}</p>
                </>
              )}
            </div>

            {/* Method */}
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-xs text-gray-400 mb-2">Request Method</p>
              <p className="text-sm font-mono text-blue-400">{method}</p>
            </div>

            {/* Warning */}
            <div className="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/30 flex gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-yellow-400">Be Careful</p>
                <p className="text-xs text-yellow-200 mt-0.5">Only connect to apps you trust.</p>
              </div>
            </div>

            {/* Permissions */}
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-xs font-semibold text-gray-400 mb-3">This app will be able to:</p>
              <ul className="space-y-2 text-xs text-gray-300">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  See your wallet address
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  Request transaction signatures
                </li>
                <li className="flex items-center gap-2">
                  <AlertCircle className="w-3 h-3 text-yellow-500" />
                  This app cannot spend your funds without your approval
                </li>
              </ul>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30 flex gap-2">
                <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* Status Messages */}
            {approved && (
              <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/30 flex gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-green-300">Connection approved. Closing...</p>
              </div>
            )}

            {rejected && (
              <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30 flex gap-2">
                <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">Connection rejected.</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {!approved && !rejected && (
            <div className="border-t border-white/10 p-6 flex gap-3">
              <button
                onClick={handleReject}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded-lg border border-red-500/50 text-red-400 font-semibold hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-green-600 text-black font-bold hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : null}
                {loading ? "Approving..." : "Approve"}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-4">
          <p className="text-xs text-gray-500">Never share your private key with anyone</p>
        </div>
      </div>
    </div>
  )
}
