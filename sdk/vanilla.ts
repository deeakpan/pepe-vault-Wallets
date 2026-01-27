/**
 * Unchained Wallet SDK - Vanilla JavaScript Version
 * 
 * For use without React. Works with any JavaScript framework or vanilla JS.
 */

import { createUnchainedConfig, type WalletConnectRPC } from './index'

/**
 * Vanilla JS Wallet Manager
 * 
 * Use this class to manage wallet connections without React hooks
 */
export class UnchainedWalletManager {
  private config: any
  private account: string | null = null
  private chainId: number | null = null
  private listeners: Map<string, Set<Function>> = new Map()

  constructor(options?: {
    projectId?: string
    chains?: any[]
    rpcUrls?: Record<number, string>
    walletConnectRPCs?: WalletConnectRPC[]
    enableMetaMask?: boolean
    enableCoinbase?: boolean
    enableWalletConnect?: boolean
  }) {
    this.config = createUnchainedConfig(options)
    this.setupEventListeners()
  }

  private setupEventListeners() {
    if (typeof window === 'undefined') return

    // Listen for account changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        this.account = accounts[0] || null
        this.emit('accountsChanged', accounts)
      })

      window.ethereum.on('chainChanged', (chainId: string) => {
        this.chainId = parseInt(chainId, 16)
        this.emit('chainChanged', this.chainId)
      })

      window.ethereum.on('disconnect', () => {
        this.account = null
        this.chainId = null
        this.emit('disconnect')
      })
    }
  }

  /**
   * Connect to wallet
   */
  async connect(walletType?: 'injected' | 'walletConnect' | 'coinbase'): Promise<string> {
    if (typeof window === 'undefined') {
      throw new Error('Wallet connection requires browser environment')
    }

    try {
      // Get available connectors
      const connectors = this.config.connectors
      let connector = connectors[0] // Default to injected

      if (walletType === 'walletConnect') {
        connector = connectors.find((c: any) => c.id === 'walletConnect')
      } else if (walletType === 'coinbase') {
        connector = connectors.find((c: any) => c.id === 'coinbaseWalletSDK')
      }

      if (!connector) {
        throw new Error(`Connector ${walletType || 'injected'} not available`)
      }

      // Connect using wagmi's connector
      if (!window.ethereum?.request) {
        throw new Error('Wallet provider does not support request method')
      }

      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      })

      if (accounts && accounts[0]) {
        const account = accounts[0]
        this.account = account
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' }) || '0x1'
        this.chainId = parseInt(chainIdHex, 16)
        this.emit('connect', { account, chainId: this.chainId })
        return account
      }

      // Handle case where wallet returns no accounts (user closed popup or denied in a custom way)
      throw new Error('Wallet did not return any accounts. Please make sure you approved the connection in PEPU VAULT WALLET.')
    } catch (error: any) {
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Disconnect wallet
   */
  async disconnect(): Promise<void> {
    if (typeof window === 'undefined') return

    try {
      // Reset state
      this.account = null
      this.chainId = null
      this.emit('disconnect')
    } catch (error: any) {
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Get current account
   */
  getAccount(): string | null {
    return this.account || null
  }

  /**
   * Get current chain ID
   */
  getChainId(): number | null {
    return this.chainId
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.account !== null
  }

  /**
   * Send transaction
   */
  async sendTransaction(to: string, value: string, data?: string): Promise<string> {
    if (!this.account) {
      throw new Error('Wallet not connected')
    }

    if (typeof window === 'undefined') {
      throw new Error('Transaction requires browser environment')
    }

    if (!window.ethereum?.request) {
      throw new Error('Wallet provider does not support request method')
    }

    try {
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: this.account,
          to,
          value,
          data: data || '0x',
        }],
      })

      this.emit('transactionSent', txHash)
      return txHash as string
    } catch (error: any) {
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Sign message
   */
  async signMessage(message: string): Promise<string> {
    if (!this.account) {
      throw new Error('Wallet not connected')
    }

    if (typeof window === 'undefined') {
      throw new Error('Signing requires browser environment')
    }

    if (!window.ethereum?.request) {
      throw new Error('Wallet provider does not support request method')
    }

    try {
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, this.account],
      })

      this.emit('messageSigned', signature)
      return signature as string
    } catch (error: any) {
      this.emit('error', error)
      throw error
    }
  }

  /**
   * Listen to events
   */
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback)
  }

  /**
   * Emit event
   */
  private emit(event: string, data?: any) {
    this.listeners.get(event)?.forEach((callback) => {
      callback(data)
    })
  }
}

/**
 * Create a wallet manager instance
 */
export function createWalletManager(options?: {
  projectId?: string
  chains?: any[]
  rpcUrls?: Record<number, string>
  walletConnectRPCs?: WalletConnectRPC[]
  enableMetaMask?: boolean
  enableCoinbase?: boolean
  enableWalletConnect?: boolean
}): UnchainedWalletManager {
  return new UnchainedWalletManager(options)
}

