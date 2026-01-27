'use client'

import { useState, useEffect } from 'react'
import { useConnect, useAccount, useDisconnect } from 'wagmi'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { 
  isUnchainedInstalled, 
  isMetaMaskInstalled, 
  isCoinbaseWalletInstalled,
  getDetectedWallet,
  connectWallet
} from '../index'

import type { WalletConnectRPC } from '../index'

interface WalletSelectorProps {
  /** Show only Unchained Wallet */
  onlyUnchained?: boolean
  /** Disable MetaMask */
  disableMetaMask?: boolean
  /** Disable Coinbase Wallet */
  disableCoinbase?: boolean
  /** Disable WalletConnect */
  disableWalletConnect?: boolean
  /** WalletConnect Project ID (required if WalletConnect enabled) */
  walletConnectProjectId?: string
  /** Custom RPC configurations for WalletConnect (like RainbowKit) */
  walletConnectRPCs?: WalletConnectRPC[]
  /** Auto-connect to Unchained on mount (no UI, just connect directly) */
  autoConnect?: boolean
  /** Show UI or just a simple connect button */
  showUI?: boolean
  /** Custom styling */
  className?: string
  /** Callback when wallet is connected */
  onConnect?: (address: string, walletType: string) => void
  /** Callback when wallet is disconnected */
  onDisconnect?: () => void
}

export function WalletSelector({
  onlyUnchained = false,
  disableMetaMask = false,
  disableCoinbase = false,
  disableWalletConnect = true,
  walletConnectProjectId,
  autoConnect = false,
  showUI = true,
  className = '',
  onConnect,
  onDisconnect,
}: WalletSelectorProps) {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const [availableWallets, setAvailableWallets] = useState<Array<{
    id: string
    name: string
    icon: string
    installed: boolean
    connector: any
  }>>([])
  const [isAutoConnecting, setIsAutoConnecting] = useState(false)

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && !isConnected && !isAutoConnecting) {
      setIsAutoConnecting(true)
      const injectedConn = connectors.find(c => c.id === 'injected')
      if (injectedConn) {
        connect({ connector: injectedConn })
      }
    }
  }, [autoConnect, isConnected, isAutoConnecting, connect, connectors])

  useEffect(() => {
    // Build list of available wallets
    const wallets: Array<{
      id: string
      name: string
      icon: string
      installed: boolean
      connector: any
    }> = []

    // Check Unchained
    const hasUnchained = isUnchainedInstalled()
    if (!onlyUnchained || hasUnchained) {
      const injectedConn = connectors.find(c => c.id === 'injected')
      if (injectedConn && (hasUnchained || !onlyUnchained)) {
        wallets.push({
          id: 'unchained',
          name: 'Unchained Wallet',
          icon: '🔗',
          installed: hasUnchained,
          connector: injectedConn,
        })
      }
    }

    // Check MetaMask (only if not only Unchained and not disabled)
    if (!onlyUnchained && !disableMetaMask) {
      const hasMetaMask = isMetaMaskInstalled()
      if (hasMetaMask) {
        const injectedConn = connectors.find(c => c.id === 'injected')
        if (injectedConn) {
          wallets.push({
            id: 'metamask',
            name: 'MetaMask',
            icon: '🦊',
            installed: true,
            connector: injectedConn,
          })
        }
      }
    }

    // Check Coinbase Wallet (only if not only Unchained and not disabled)
    if (!onlyUnchained && !disableCoinbase) {
      const hasCoinbase = isCoinbaseWalletInstalled()
      const coinbaseConn = connectors.find(c => c.id === 'coinbaseWalletSDK')
      if (hasCoinbase || coinbaseConn) {
        wallets.push({
          id: 'coinbase',
          name: 'Coinbase Wallet',
          icon: '🟦',
          installed: hasCoinbase,
          connector: coinbaseConn || connectors.find(c => c.id === 'injected'),
        })
      }
    }

    // Check WalletConnect (only if not only Unchained and not disabled)
    if (!onlyUnchained && !disableWalletConnect && walletConnectProjectId) {
      const wcConn = connectors.find(c => c.id === 'walletConnect')
      if (wcConn) {
        wallets.push({
          id: 'walletconnect',
          name: 'WalletConnect',
          icon: '🔷',
          installed: true,
          connector: wcConn,
        })
      }
    }

    setAvailableWallets(wallets)
  }, [connectors, onlyUnchained, disableMetaMask, disableCoinbase, disableWalletConnect, walletConnectProjectId])

  const handleConnect = async (connector: any, walletName: string) => {
    try {
      await connect({ connector })
      // Connection success will be handled by useEffect watching isConnected
    } catch (error) {
      console.error('Connection failed:', error)
    }
  }

  // Call onConnect when connection succeeds
  useEffect(() => {
    if (isConnected && address && onConnect) {
      const detected = getDetectedWallet()
      onConnect(address, detected.name || 'Wallet')
    }
  }, [isConnected, address, onConnect])

  const handleDisconnect = () => {
    disconnect()
    if (onDisconnect) {
      onDisconnect()
    }
  }

  // Simple connect button (no UI) - auto-connects to detected wallet
  if (!showUI) {
    if (isConnected && address) {
      const detected = getDetectedWallet()
      return (
        <button
          onClick={handleDisconnect}
          className={`wallet-selector-simple disconnect ${className}`}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#333',
            border: '1px solid #444',
            borderRadius: '8px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#444'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#333'
          }}
        >
          Disconnect {detected.name}
        </button>
      )
    }

    // Auto-connect button - connects to Unchained if available, otherwise first available wallet
    return (
      <button
        onClick={async () => {
          try {
            // Try to connect via wagmi first (handles WalletConnect properly)
            const injectedConn = connectors.find(c => c.id === 'injected')
            if (injectedConn) {
              await connect({ connector: injectedConn })
            } else {
              // Fallback to direct connection
              await connectWallet()
            }
            // Connection success will be handled by useEffect watching isConnected
          } catch (err: any) {
            console.error('Connection failed:', err)
          }
        }}
        disabled={isPending || isAutoConnecting}
        className={`wallet-selector-simple connect ${className}`}
        style={{
          padding: '0.75rem 1.5rem',
          background: '#4a9eff',
          border: 'none',
          borderRadius: '8px',
          color: 'white',
          cursor: isPending || isAutoConnecting ? 'not-allowed' : 'pointer',
          fontSize: '0.875rem',
          fontWeight: 500,
          opacity: isPending || isAutoConnecting ? 0.6 : 1,
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!isPending && !isAutoConnecting) {
            e.currentTarget.style.background = '#5aaeff'
          }
        }}
        onMouseLeave={(e) => {
          if (!isPending && !isAutoConnecting) {
            e.currentTarget.style.background = '#4a9eff'
          }
        }}
      >
        {isPending || isAutoConnecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
    )
  }

  if (isConnected && address) {
    const detected = getDetectedWallet()
    return (
      <div className={`wallet-selector connected ${className}`}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          background: '#1a1a1a',
          borderRadius: '8px',
          border: '1px solid #333'
        }}>
          <span>{detected.name === 'Unchained Wallet' ? '🔗' : detected.name === 'MetaMask' ? '🦊' : '🟦'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              {detected.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>
              {address.slice(0, 6)}...{address.slice(-4)}
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            style={{
              padding: '0.5rem 1rem',
              background: '#333',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  if (availableWallets.length === 0) {
    return (
      <div className={`wallet-selector empty ${className}`}>
        <p style={{ color: '#888', fontSize: '0.875rem' }}>
          {onlyUnchained 
            ? 'Unchained Wallet not detected. Please install it to continue.'
            : 'No wallets detected. Please install a wallet to continue.'}
        </p>
      </div>
    )
  }

  return (
    <div className={`wallet-selector ${className}`}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: '#888' }}>
        Connect Wallet
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {availableWallets.map((wallet) => (
          <button
            key={wallet.id}
            onClick={() => handleConnect(wallet.connector, wallet.name)}
            disabled={isPending || !wallet.connector}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.875rem 1rem',
              background: wallet.installed ? '#1a1a1a' : '#0f0f0f',
              border: `1px solid ${wallet.installed ? '#333' : '#222'}`,
              borderRadius: '8px',
              color: wallet.installed ? 'white' : '#666',
              cursor: wallet.installed && !isPending ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'all 0.2s',
              opacity: wallet.installed ? 1 : 0.6,
            }}
            onMouseEnter={(e) => {
              if (wallet.installed && !isPending) {
                e.currentTarget.style.background = '#222'
                e.currentTarget.style.borderColor = '#444'
              }
            }}
            onMouseLeave={(e) => {
              if (wallet.installed && !isPending) {
                e.currentTarget.style.background = wallet.installed ? '#1a1a1a' : '#0f0f0f'
                e.currentTarget.style.borderColor = wallet.installed ? '#333' : '#222'
              }
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>{wallet.icon}</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div>{wallet.name}</div>
              {!wallet.installed && (
                <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.25rem' }}>
                  Not installed
                </div>
              )}
            </div>
            {isPending && wallet.connector && (
              <span style={{ fontSize: '0.75rem' }}>Connecting...</span>
            )}
          </button>
        ))}
      </div>
      {error && (
        <div style={{ 
          marginTop: '0.75rem', 
          padding: '0.5rem', 
          background: '#3a1a1a', 
          border: '1px solid #5a2a2a',
          borderRadius: '6px',
          color: '#ff6b6b',
          fontSize: '0.75rem'
        }}>
          {error.message}
        </div>
      )}
    </div>
  )
}

