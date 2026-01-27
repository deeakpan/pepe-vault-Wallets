import { ethers } from "ethers"
import { getWallets, getWalletState, getCurrentWallet, setCurrentWalletId } from "./wallet"
import { getProvider } from "./rpc"

export interface ConnectedDApp {
  id: string
  origin: string
  name: string
  iconUrl?: string
  connectedAt: number
}

const CONNECTED_DAPPS_KEY = "unchained_connected_dapps"
const PENDING_REQUESTS_KEY = "unchained_pending_requests"

export class UnchainedProvider {
  private connectedDApps: ConnectedDApp[] = []
  private requests: Map<string, any> = new Map()
  private currentChainId: number = 97741 // Default to PEPU

  constructor() {
    if (typeof window !== "undefined") {
      this.loadConnectedDApps()
      this.setupWindowEth()
      this.loadChainId()
      this.handleReturnFromRedirect()
    }
  }

  private handleReturnFromRedirect() {
    // Check if we're returning from a redirect with a result
    const urlParams = new URLSearchParams(window.location.search)
    const walletStatus = urlParams.get("wallet_status")
    
    if (walletStatus === "approved" || walletStatus === "rejected") {
      const result = urlParams.get("wallet_result")
      const error = urlParams.get("wallet_error")
      const requestId = urlParams.get("wallet_request_id") || localStorage.getItem("unchained_request_id")
      
      if (requestId) {
        // Store result for retrieval
        this.requests.set(requestId, {
          result: result ? decodeURIComponent(result) : undefined,
          error: error || undefined,
          timestamp: Date.now(),
        })
        
        // Also store in localStorage for persistence across page reloads
        if (result) {
          localStorage.setItem(`unchained_result_${requestId}`, decodeURIComponent(result))
        } else if (error) {
          localStorage.setItem(`unchained_error_${requestId}`, error)
        }
        
        // Clean up URL
        const cleanUrl = window.location.pathname
        window.history.replaceState({}, "", cleanUrl)
        
        // Dispatch event for dApps listening
        window.dispatchEvent(new CustomEvent("wallet_result", {
          detail: { requestId, result: result ? decodeURIComponent(result) : undefined, error }
        }))
      }
    }
  }

  private loadChainId() {
    if (typeof window === "undefined") return
    // CRITICAL: Check both localStorage keys and prefer selected_chain (used by UI)
    // This ensures extension iframe syncs correctly with the web version
    const selectedChain = localStorage.getItem("selected_chain")
    const storedChainId = localStorage.getItem("unchained_chain_id")
    
    // Prefer selected_chain if it exists (used by UI), otherwise use unchained_chain_id
    const chainIdToUse = selectedChain || storedChainId
    
    if (chainIdToUse) {
      const parsed = parseInt(chainIdToUse, 10)
      // Ensure it's a valid chainId (1 for ETH, 97741 for PEPU), default to PEPU if invalid
      this.currentChainId = (parsed === 1 || parsed === 97741) ? parsed : 97741
    } else {
      // Default to PEPU if nothing is stored
      this.currentChainId = 97741
    }
    
    // Sync both keys to ensure consistency
    this.saveChainId()
    localStorage.setItem("selected_chain", this.currentChainId.toString())
  }

  private saveChainId() {
    if (typeof window === "undefined") return
    localStorage.setItem("unchained_chain_id", this.currentChainId.toString())
  }

  public setChainId(chainId: number) {
    this.currentChainId = chainId
    this.saveChainId()
    const hexChainId = `0x${chainId.toString(16)}`
    window.dispatchEvent(
      new CustomEvent("unchained:chainChanged", {
        detail: { chainId: hexChainId },
      }),
    )
  }

  public getChainId(): number {
    return this.currentChainId
  }

  private setupWindowEth() {
    const self = this
    
    const provider: any = {
      // Pretend to be multiple popular wallets so any choice routes to Unchained
      isMetaMask: true,
      isCoinbaseWallet: true,
      isUnchained: true,
      
      // Custom metadata for RainbowKit and other wallet connectors
      _unchainedMetadata: {
        name: 'Unchained Wallet',
        iconUrl: 'https://pbs.twimg.com/profile_images/1990713242805506049/IL1CQ-9l_400x400.jpg',
      },

      request: async (args: { method: string; params?: any[] }) => {
        return self.handleRequest(args)
      },

      send: (method: string, params: any[] = []) => {
        return self.handleRequest({ method, params })
      },

      sendAsync: (payload: any, callback: (error: any, result: any) => void) => {
        self.handleRequest({ method: payload.method, params: payload.params || [] })
          .then((result) => callback(null, { result }))
          .catch((error) => callback(error, null))
      },

      on: (event: string, listener: (...args: any[]) => void) => {
        if (event === "accountsChanged") {
          window.addEventListener("unchained:accountsChanged", () => {
            listener(self.getAccounts())
          })
        }
        if (event === "chainChanged") {
          window.addEventListener("unchained:chainChanged", (e: any) => {
            listener(e.detail?.chainId || `0x${self.currentChainId.toString(16)}`)
          })
        }
        if (event === "connect") {
          window.addEventListener("unchained:connect", (e: any) => {
            listener(e.detail)
          })
        }
        if (event === "disconnect") {
          window.addEventListener("unchained:disconnect", () => {
            listener()
          })
        }
      },

      removeListener: (event: string, listener: (...args: any[]) => void) => {
        // Remove listener implementation
      },

      removeAllListeners: (event?: string) => {
        // Remove all listeners implementation
      },
    }

    // Make chainId reactive
    Object.defineProperty(provider, "chainId", {
      get: () => `0x${self.currentChainId.toString(16)}`,
      configurable: true,
      enumerable: true,
    })

    Object.defineProperty(provider, "networkVersion", {
      get: () => self.currentChainId.toString(),
      configurable: true,
      enumerable: true,
    })

    // Always override window.ethereum so any injected-wallet choice (MetaMask, Coinbase, etc.)
    // inside this window will route through Unchained
    ;(provider as any).providers = [provider]

    // Try to set window.ethereum, but handle cases where it's already defined
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, "ethereum");
      if (!descriptor) {
        // No existing property, safe to define
        Object.defineProperty(window, "ethereum", {
          value: provider,
          writable: true,
          configurable: true,
        });
      } else if (descriptor.configurable) {
        // Property exists but is configurable, safe to redefine
        Object.defineProperty(window, "ethereum", {
          value: provider,
          writable: true,
          configurable: true,
        });
      } else {
        // Property exists and is non-configurable (e.g., MetaMask), can't override
        console.warn("[Unchained Provider] window.ethereum is already defined and non-configurable. Cannot override.");
      }
    } catch (e) {
      // If defineProperty fails, try simple assignment
      try {
        if (!window.ethereum) {
          window.ethereum = provider as any;
        }
      } catch (e2) {
        console.warn("[Unchained Provider] Could not set window.ethereum:", e2);
      }
    }
  }

  private async handleRequest(args: { method: string; params?: any[] }) {
    const { method, params = [] } = args

    switch (method) {
      case "eth_requestAccounts":
        return this.requestAccounts()
      case "eth_accounts":
        return this.getAccounts()
      case "eth_chainId":
        return `0x${this.currentChainId.toString(16)}`
      case "net_version":
        return this.currentChainId.toString()
      case "wallet_switchEthereumChain":
        if (params[0]?.chainId) {
          const chainId = parseInt(params[0].chainId, 16)
          this.setChainId(chainId)
          return null
        }
        throw new Error("Invalid chain ID")
      case "wallet_addEthereumChain":
        // Just approve, don't actually add
        return null
      case "personal_sign":
        return this.personalSign(params[0], params[1])
      case "eth_sign":
        return this.ethSign(params[0], params[1])
      case "eth_signTypedData":
      case "eth_signTypedData_v4":
        return this.signTypedData(params[0], params[1], params[2])
      case "eth_sendTransaction":
        return this.sendTransaction(params[0])
      case "eth_call":
      case "eth_getBalance":
      case "eth_getCode":
      case "eth_getStorageAt":
      case "eth_getTransactionCount":
      case "eth_estimateGas":
      case "eth_getBlockByNumber":
      case "eth_getBlockByHash":
      case "eth_getTransactionByHash":
      case "eth_getTransactionReceipt":
      case "eth_blockNumber":
      case "eth_gasPrice":
        return this.forwardToProvider(method, params)
      default:
        throw new Error(`Method ${method} not supported`)
    }
  }

  private async requestAccounts() {
    const currentOrigin = window.location.origin

    // If we're on the connect page, we've already been redirected
    if (window.location.pathname === "/connect") {
    const accounts = this.getAccounts()
    if (accounts.length === 0) {
      throw new Error("No accounts available")
    }
    return accounts
    }

    // Redirect to connect page (like OAuth flow)
    // No password required - user can approve connection directly
    const returnOrigin = currentOrigin
    const returnUrl = window.location.href
    localStorage.setItem("unchained_return_url", returnUrl)
    localStorage.setItem("unchained_return_origin", returnOrigin)
    
    const connectUrl = `${currentOrigin}/connect?origin=${encodeURIComponent(returnOrigin)}&method=eth_requestAccounts`
    window.location.href = connectUrl
    
    throw new Error("Redirecting to connect page")
  }

  private getAccounts() {
    const wallets = getWallets()
    if (wallets.length === 0) {
      return []
    }
    // No lock check - allow connection even if wallet is locked
    // Password is only required for signing transactions, not for connecting
    const wallet = getCurrentWallet() || wallets[0]
    return [wallet.address.toLowerCase()]
  }

  private async personalSign(message: string, address: string) {
    const wallet = getCurrentWallet() || getWallets()[0]
    if (!wallet || wallet.address.toLowerCase() !== address.toLowerCase()) {
      throw new Error("Account not found")
    }

    // Check if we have a result from a previous redirect
    const storedRequestId = localStorage.getItem("unchained_request_id")
    if (storedRequestId) {
      const cachedResult = this.requests.get(storedRequestId)
      const storedResult = localStorage.getItem(`unchained_result_${storedRequestId}`)
      const storedError = localStorage.getItem(`unchained_error_${storedRequestId}`)
      
      if (cachedResult || storedResult || storedError) {
        // Clean up
        localStorage.removeItem("unchained_request_id")
        localStorage.removeItem(`unchained_result_${storedRequestId}`)
        localStorage.removeItem(`unchained_error_${storedRequestId}`)
        this.requests.delete(storedRequestId)
        
        if (storedError || cachedResult?.error) {
          throw new Error(storedError || cachedResult.error)
        }
        return storedResult || cachedResult?.result
      }
    }
    
    const requestId = Math.random().toString(36).substring(7)

    // Redirect to sign page (like OAuth flow)
    const currentOrigin = window.location.origin
    const returnUrl = window.location.origin + window.location.pathname
    
    localStorage.setItem("unchained_return_url", returnUrl)
    localStorage.setItem("unchained_return_origin", currentOrigin)
    localStorage.setItem("unchained_request_id", requestId)
    
    const signUrl = `${currentOrigin}/sign?method=personal_sign&message=${encodeURIComponent(message)}&address=${encodeURIComponent(address)}&requestId=${requestId}&origin=${encodeURIComponent(currentOrigin)}`
    window.location.href = signUrl
    
    return new Promise(() => {})
  }

  private async ethSign(address: string, data: string) {
    return this.personalSign(data, address)
  }

  private async signTypedData(domain: any, types: any, value: any) {
    const wallet = getCurrentWallet() || getWallets()[0]
    if (!wallet) {
      throw new Error("No wallet found")
    }

    // Check if we have a result from a previous redirect
    const storedRequestId = localStorage.getItem("unchained_request_id")
    if (storedRequestId) {
      const cachedResult = this.requests.get(storedRequestId)
      const storedResult = localStorage.getItem(`unchained_result_${storedRequestId}`)
      const storedError = localStorage.getItem(`unchained_error_${storedRequestId}`)
      
      if (cachedResult || storedResult || storedError) {
        // Clean up
        localStorage.removeItem("unchained_request_id")
        localStorage.removeItem(`unchained_result_${storedRequestId}`)
        localStorage.removeItem(`unchained_error_${storedRequestId}`)
        this.requests.delete(storedRequestId)
        
        if (storedError || cachedResult?.error) {
          throw new Error(storedError || cachedResult.error)
        }
        return storedResult || cachedResult?.result
      }
    }
    
    const requestId = Math.random().toString(36).substring(7)
    const currentOrigin = window.location.origin
    const returnUrl = window.location.origin + window.location.pathname
    const params = encodeURIComponent(JSON.stringify([domain, types, value]))
    
    localStorage.setItem("unchained_return_url", returnUrl)
    localStorage.setItem("unchained_return_origin", currentOrigin)
    localStorage.setItem("unchained_request_id", requestId)
    
    const signUrl = `${currentOrigin}/sign?method=eth_signTypedData_v4&params=${params}&requestId=${requestId}&origin=${encodeURIComponent(currentOrigin)}`
    window.location.href = signUrl
    
    return new Promise(() => {})
  }

  private async sendTransaction(tx: any) {
    const wallet = getCurrentWallet() || getWallets()[0]
    if (!wallet) {
      throw new Error("No wallet found")
    }

    // Check if we have a result from a previous redirect
    const storedRequestId = localStorage.getItem("unchained_request_id")
    if (storedRequestId) {
      const cachedResult = this.requests.get(storedRequestId)
      const storedResult = localStorage.getItem(`unchained_result_${storedRequestId}`)
      const storedError = localStorage.getItem(`unchained_error_${storedRequestId}`)
      
      if (cachedResult || storedResult || storedError) {
        // Clean up
        localStorage.removeItem("unchained_request_id")
        localStorage.removeItem(`unchained_result_${storedRequestId}`)
        localStorage.removeItem(`unchained_error_${storedRequestId}`)
        this.requests.delete(storedRequestId)
        
        if (storedError || cachedResult?.error) {
          throw new Error(storedError || cachedResult.error)
        }
        return storedResult || cachedResult?.result
      }
    }
    
    const requestId = Math.random().toString(36).substring(7)
    const currentOrigin = window.location.origin
    const returnUrl = window.location.origin + window.location.pathname
    const params = encodeURIComponent(JSON.stringify([tx]))
    
    localStorage.setItem("unchained_return_url", returnUrl)
    localStorage.setItem("unchained_return_origin", currentOrigin)
    localStorage.setItem("unchained_request_id", requestId)
    
    const signUrl = `${currentOrigin}/sign?method=eth_sendTransaction&params=${params}&requestId=${requestId}&origin=${encodeURIComponent(currentOrigin)}`
    window.location.href = signUrl
    
    return new Promise(() => {})
  }

  private async forwardToProvider(method: string, params: any[]) {
    const provider = getProvider(this.currentChainId)
    return provider.send(method, params)
  }

  public addConnectedDApp(origin: string, name: string, iconUrl?: string): ConnectedDApp {
    const dapp: ConnectedDApp = {
      id: Math.random().toString(36).substring(7),
      origin,
      name,
      iconUrl,
      connectedAt: Date.now(),
    }
    this.connectedDApps.push(dapp)
    this.saveConnectedDApps()
    return dapp
  }

  public getConnectedDApps(): ConnectedDApp[] {
    return this.connectedDApps
  }

  public removeConnectedDApp(id: string) {
    this.connectedDApps = this.connectedDApps.filter((d) => d.id !== id)
    this.saveConnectedDApps()
  }

  private loadConnectedDApps() {
    if (typeof window === "undefined") return
    const stored = localStorage.getItem(CONNECTED_DAPPS_KEY)
    this.connectedDApps = stored ? JSON.parse(stored) : []
  }

  private saveConnectedDApps() {
    if (typeof window === "undefined") return
    localStorage.setItem(CONNECTED_DAPPS_KEY, JSON.stringify(this.connectedDApps))
  }
}

// Singleton instance
let provider: UnchainedProvider | null = null

export function getUnchainedProvider(): UnchainedProvider {
  if (!provider && typeof window !== "undefined") {
    provider = new UnchainedProvider()
  }
  return provider!
}
