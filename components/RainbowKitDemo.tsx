"use client"

import { useState, useEffect } from "react"

export function RainbowKitDemo() {
  const [isInstalled, setIsInstalled] = useState(false)
  const [connected, setConnected] = useState(false)
  const [account, setAccount] = useState<string | null>(null)

  useEffect(() => {
    // Check if Unchained Wallet extension is installed
    if (typeof window !== 'undefined') {
      const checkWallet = () => {
        const ethereum = (window as any).ethereum
        if (ethereum?.isUnchained) {
          setIsInstalled(true)
        }
      }
      checkWallet()
      
      // Listen for wallet injection
      const interval = setInterval(checkWallet, 1000)
      return () => clearInterval(interval)
    }
  }, [])

  const handleConnect = async () => {
    try {
      const ethereum = (window as any).ethereum
      if (!ethereum) {
        alert('Unchained Wallet not detected. Please install the extension.')
        return
      }

      // Request connection
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
      if (accounts && accounts.length > 0) {
        setConnected(true)
        setAccount(accounts[0])
      }
    } catch (error: any) {
      console.error('Connection failed:', error)
      alert(error.message || 'Failed to connect to Unchained Wallet')
    }
  }

  const handleDisconnect = () => {
    setConnected(false)
    setAccount(null)
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-black/50 rounded-lg border border-white/10">
        <p className="text-xs text-gray-300 mb-3">
          {isInstalled 
            ? 'Unchained Wallet extension detected! Click the button below to connect.'
            : 'Note: RainbowKit integration requires wagmi v2, but this project uses wagmi v3. Below is a simple custom connect button that works with the Unchained Wallet extension.'}
        </p>
        <div className="flex justify-center">
          {!connected ? (
            <button
              onClick={handleConnect}
              className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold text-sm transition-colors"
            >
              {isInstalled ? 'Connect Unchained Wallet' : 'Connect Wallet'}
            </button>
          ) : (
            <div className="space-y-2 text-center">
              <div className="px-4 py-2 bg-green-500/20 border border-green-500/50 rounded-lg">
                <p className="text-xs text-green-300 mb-1">Connected</p>
                <p className="text-xs text-gray-300 font-mono break-all">{account}</p>
              </div>
              <button
                onClick={handleDisconnect}
                className="px-4 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-xs transition-colors"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-xs text-blue-300">
          💡 <strong>Tip:</strong> The Unchained Wallet extension injects <code>window.ethereum</code> with 
          <code>isUnchained: true</code>. For full RainbowKit support, consider using wagmi v2 or wait for RainbowKit v3 compatibility.
        </p>
      </div>
    </div>
  )
}

