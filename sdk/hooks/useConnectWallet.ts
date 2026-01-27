/**
 * React hook for direct wallet connection (no UI)
 * Automatically connects to Unchained if available
 */

import { useState, useCallback } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { connectWallet, disconnectWallet, isUnchainedInstalled, getDetectedWallet } from '../index'

export function useConnectWallet() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const connectDirect = useCallback(async () => {
    setIsConnecting(true)
    setError(null)

    try {
      // Try direct connection first (works with any injected wallet)
      const account = await connectWallet()
      
      // Also connect via wagmi for full integration
      const injectedConnector = connectors.find(c => c.id === 'injected')
      if (injectedConnector) {
        connect({ connector: injectedConnector })
      }

      return account
    } catch (err: any) {
      setError(err)
      throw err
    } finally {
      setIsConnecting(false)
    }
  }, [connect, connectors])

  const disconnectDirect = useCallback(async () => {
    try {
      await disconnect()
      await disconnectWallet()
    } catch (err: any) {
      setError(err)
      throw err
    }
  }, [disconnect])

  const detectedWallet = getDetectedWallet()

  return {
    address,
    isConnected,
    isConnecting,
    error,
    connect: connectDirect,
    disconnect: disconnectDirect,
    detectedWallet,
    isUnchained: isUnchainedInstalled(),
  }
}

