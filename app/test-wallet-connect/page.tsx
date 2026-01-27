"use client"

import { useEffect, useState } from "react"
import { getWallets } from "@/lib/wallet"
import { getUnchainedProvider } from "@/lib/provider"
import { useRouter } from "next/navigation"

const PEPU_CHAIN_ID = 97741
const PEPU_RPC_URL = 'https://rpc-pepu-v2-mainnet-0.t.conduit.xyz'
const PEPU_CHAIN_NAME = 'Pepe Unchained V2'
const PEPU_EXPLORER = 'https://pepuscan.com'

interface LogEntry {
  message: string
  type: 'info' | 'success' | 'error'
  timestamp: string
}

export default function TestWalletConnectPage() {
  const router = useRouter()
  const [currentAccount, setCurrentAccount] = useState<string | null>(null)
  const [currentChainId, setCurrentChainId] = useState<number | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [walletType, setWalletType] = useState<string>('Unknown')

  useEffect(() => {
    // Check if wallet exists
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    // Initialize provider to ensure window.ethereum.isUnchained is set
    getUnchainedProvider()
    
    // Check wallet type
    checkWallet()
    
    // Check if we're returning from /connect page
    checkReturnFromConnect()
    
    // Check if already connected
    checkConnectionStatus()
    
    // Listen for wallet_result events (when returning from /connect)
    const handleWalletResult = (event: any) => {
      const { result } = event.detail || {}
      if (result) {
        try {
          const parsed = typeof result === 'string' ? JSON.parse(result) : result
          if (parsed.accounts && parsed.accounts.length > 0) {
            setCurrentAccount(parsed.accounts[0])
            const chainId = parsed.chainId ? parseInt(parsed.chainId, 16) : null
            setCurrentChainId(chainId)
            log('Connection approved!', 'success')
            log(`Connected: ${parsed.accounts[0]}`, 'success')
          }
        } catch (e) {
          // Try to get accounts directly
          updateConnectionStatus()
        }
      }
    }
    
    window.addEventListener('wallet_result', handleWalletResult)
    
    // Also listen for accountsChanged events
    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts && accounts.length > 0) {
          setCurrentAccount(accounts[0])
          log('Account changed', 'info')
        } else {
          setCurrentAccount(null)
        }
        updateConnectionStatus()
      })
      
      window.ethereum.on('chainChanged', (chainId: string) => {
        const chainIdNum = parseInt(chainId, 16)
        setCurrentChainId(chainIdNum)
        log(`Chain changed: ${chainIdNum}`, 'info')
      })
    }
    
    return () => {
      window.removeEventListener('wallet_result', handleWalletResult)
    }
  }, [router])
  
  const checkReturnFromConnect = () => {
    // Check URL params for return from connect
    if (typeof window === 'undefined') return
    
    const urlParams = new URLSearchParams(window.location.search)
    const walletStatus = urlParams.get('wallet_status')
    
    if (walletStatus === 'approved') {
      const result = urlParams.get('wallet_result')
      if (result) {
        try {
          const parsed = JSON.parse(decodeURIComponent(result))
          if (parsed.accounts && parsed.accounts.length > 0) {
            setCurrentAccount(parsed.accounts[0])
            const chainId = parsed.chainId ? parseInt(parsed.chainId, 16) : null
            setCurrentChainId(chainId)
            log('Connection approved!', 'success')
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname)
          }
        } catch (e) {
          console.error('Error parsing return result:', e)
        }
      }
    }
  }
  
  const checkConnectionStatus = async () => {
    if (typeof window === 'undefined' || !window.ethereum) return
    
    try {
      // Try to get current accounts
      const accounts = await window.ethereum.request({ method: 'eth_accounts' })
      if (accounts && accounts.length > 0) {
        setCurrentAccount(accounts[0])
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' })
        const chainId = parseInt(chainIdHex, 16)
        setCurrentChainId(chainId)
        log('Already connected', 'success')
      }
    } catch (error) {
      // Not connected yet
      console.log('Not connected yet')
    }
  }
  
  const updateConnectionStatus = async () => {
    if (typeof window === 'undefined' || !window.ethereum) return
    
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' })
      if (accounts && accounts.length > 0) {
        setCurrentAccount(accounts[0])
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' })
        const chainId = parseInt(chainIdHex, 16)
        setCurrentChainId(chainId)
      } else {
        setCurrentAccount(null)
        setCurrentChainId(null)
      }
    } catch (error) {
      console.error('Error updating connection status:', error)
    }
  }

  const log = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const entry: LogEntry = {
      message,
      type,
      timestamp: new Date().toLocaleTimeString()
    }
    setLogs(prev => [...prev, entry])
    console.log(message)
  }

  const clearLog = () => {
    setLogs([])
  }

  const checkWallet = () => {
    if (typeof window === 'undefined' || typeof window.ethereum === 'undefined') {
      log('No wallet detected', 'error')
      setWalletType('No Wallet')
      return false
    }

    const ethereum = window.ethereum as any
    let type = 'Unknown'
    
    if (ethereum.isUnchained === true) {
      type = 'Unchained Wallet ✅'
    } else if (ethereum.isMetaMask) {
      type = 'MetaMask'
    } else if (ethereum.isCoinbaseWallet) {
      type = 'Coinbase Wallet'
    } else {
      type = 'Injected Wallet'
    }

    setWalletType(type)
    log(`Wallet detected: ${type}`, 'success')
    return true
  }

  const connectDirect = async () => {
    log('Attempting connection...')
    try {
      if (!checkWallet()) {
        throw new Error('No wallet detected')
      }

      log('Requesting accounts - you will be redirected to approve...', 'info')
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      })

      if (accounts && accounts.length > 0) {
        setCurrentAccount(accounts[0])
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' })
        const chainId = parseInt(chainIdHex, 16)
        setCurrentChainId(chainId)
        log(`Connected: ${accounts[0]}`, 'success')
        log(`Chain ID: ${chainId}`, 'success')
      } else {
        // In some flows (especially with custom wallets), eth_requestAccounts can trigger
        // a redirect + approval UI instead of immediately returning accounts.
        // Treat this as a soft warning instead of a hard failure.
        throw new Error('Wallet did not return any accounts. If you are using PEPU VAULT WALLET, approve the connection in the popup and try again.')
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error'
      if (
        errorMsg.includes('Redirecting') ||
        errorMsg.includes('redirect')
      ) {
        log('✅ Redirecting to approval page...', 'success')
        log('You will be taken to /connect to approve the connection.', 'info')
      } else if (errorMsg.includes('Wallet did not return any accounts')) {
        log('Wallet did not immediately return any accounts.', 'warning')
        log('If PEPU VAULT WALLET opened, approve the connection there, then retry.', 'info')
      } else {
        log(`Connection failed: ${errorMsg}`, 'error')
      }
    }
  }

  const switchToPEPU = async () => {
    log('Switching to PEPU chain...')
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${PEPU_CHAIN_ID.toString(16)}` }],
      })
      log('Switched to PEPU chain', 'success')
      setCurrentChainId(PEPU_CHAIN_ID)
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${PEPU_CHAIN_ID.toString(16)}`,
              chainName: PEPU_CHAIN_NAME,
              nativeCurrency: {
                name: 'PEPU',
                symbol: 'PEPU',
                decimals: 18
              },
              rpcUrls: [PEPU_RPC_URL],
              blockExplorerUrls: [PEPU_EXPLORER]
            }],
          })
          log('PEPU chain added and switched', 'success')
          setCurrentChainId(PEPU_CHAIN_ID)
        } catch (addError: any) {
          log(`Failed to add PEPU chain: ${addError.message}`, 'error')
        }
      } else {
        log(`Failed to switch chain: ${switchError.message}`, 'error')
      }
    }
  }

  const getBalance = async () => {
    log('Fetching balance...')
    try {
      if (!currentAccount) {
        throw new Error('Not connected. Please connect first.')
      }
      const balance = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [currentAccount, 'latest']
      })
      const balanceInEth = parseInt(balance, 16) / Math.pow(10, 18)
      log(`Balance: ${balanceInEth.toFixed(6)} PEPU`, 'success')
    } catch (error: any) {
      log(`Failed to get balance: ${error.message}`, 'error')
    }
  }

  return (
    <div style={{ 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      padding: '20px',
      color: '#fff'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        borderRadius: '20px',
        padding: '30px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '2.5em' }}>🔗 Unchained Wallet Connect Test</h1>
        <p style={{ textAlign: 'center', opacity: 0.8, marginBottom: '30px' }}>Test all wallet connection methods - PEPU Chain Only</p>
        
        <div style={{
          background: 'rgba(59, 130, 246, 0.2)',
          border: '1px solid rgba(59, 130, 246, 0.5)',
          padding: '15px',
          borderRadius: '10px',
          marginBottom: '20px'
        }}>
          <strong style={{ color: '#93c5fd' }}>✅ Running in Wallet App Context</strong><br/>
          The Unchained provider is initialized and ready to use!<br/>
          <br/>
          <strong style={{ color: '#fbbf24' }}>📝 Note for External dApps:</strong><br/>
          • This test page works because it's on the same origin as the wallet app<br/>
          • External dApps (like Uniswap) need to use <strong>WalletConnect</strong> to connect<br/>
          • The browser feature loads external sites in iframes (CORS prevents provider injection)<br/>
          • Your SDK supports WalletConnect - dApps can integrate it easily<br/>
          <br/>
          <strong style={{ color: '#93c5fd' }}>💡 About WalletConnect:</strong><br/>
          • WalletConnect is for external dApps to connect to your wallet<br/>
          • This test page is for testing direct connections (same-origin)<br/>
          • Use "Connect Wallet" button above to test direct connection flow
        </div>

        <div style={{
          background: 'rgba(0, 0, 0, 0.2)',
          padding: '15px',
          borderRadius: '10px',
          marginBottom: '20px',
          fontFamily: '"Courier New", monospace'
        }}>
          <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ opacity: 0.7 }}>Network Name:</span>
            <span style={{ fontWeight: 'bold' }}>Pepe Unchained V2</span>
          </div>
          <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ opacity: 0.7 }}>Chain ID:</span>
            <span style={{ fontWeight: 'bold' }}>97741</span>
          </div>
          <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ opacity: 0.7 }}>RPC URL:</span>
            <span style={{ fontWeight: 'bold', fontSize: '0.9em' }}>https://rpc-pepu-v2-mainnet-0.t.conduit.xyz</span>
          </div>
          <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ opacity: 0.7 }}>Currency Symbol:</span>
            <span style={{ fontWeight: 'bold' }}>PEPU</span>
          </div>
          <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ opacity: 0.7 }}>Block Explorer:</span>
            <span style={{ fontWeight: 'bold' }}>https://pepuscan.com/</span>
          </div>
        </div>

        {/* Connection Status */}
        <div style={{ margin: '30px 0', padding: '20px', background: 'rgba(0, 0, 0, 0.1)', borderRadius: '10px' }}>
          <div style={{ fontSize: '1.3em', marginBottom: '15px', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', paddingBottom: '10px' }}>Connection Status</div>
          <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '15px', borderRadius: '10px', fontFamily: '"Courier New", monospace' }}>
            <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>Wallet Type:</span>
              <span style={{ fontWeight: 'bold' }}>{walletType}</span>
            </div>
            <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>Connection Status:</span>
              <span style={{ fontWeight: 'bold', color: currentAccount ? '#4ade80' : '#f87171' }}>
                {currentAccount ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>Address:</span>
              <span style={{ fontWeight: 'bold' }}>
                {currentAccount ? `${currentAccount.substring(0, 6)}...${currentAccount.substring(38)}` : '-'}
              </span>
            </div>
            <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>Chain ID:</span>
              <span style={{ fontWeight: 'bold' }}>{currentChainId || '-'}</span>
            </div>
          </div>
        </div>

        {/* Connection Methods */}
        <div style={{ margin: '30px 0', padding: '20px', background: 'rgba(0, 0, 0, 0.1)', borderRadius: '10px' }}>
          <div style={{ fontSize: '1.3em', marginBottom: '15px', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', paddingBottom: '10px' }}>Connection Methods</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '15px' }}>
            <button
              onClick={connectDirect}
              style={{
                padding: '15px 20px',
                border: 'none',
                borderRadius: '10px',
                fontSize: '1em',
                fontWeight: 600,
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff',
                transition: 'transform 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              Connect Wallet
            </button>
            <button
              onClick={switchToPEPU}
              style={{
                padding: '15px 20px',
                border: 'none',
                borderRadius: '10px',
                fontSize: '1em',
                fontWeight: 600,
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                transition: 'transform 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              Switch to PEPU
            </button>
            <button
              onClick={getBalance}
              disabled={!currentAccount}
              style={{
                padding: '15px 20px',
                border: 'none',
                borderRadius: '10px',
                fontSize: '1em',
                fontWeight: 600,
                cursor: currentAccount ? 'pointer' : 'not-allowed',
                background: currentAccount ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255, 255, 255, 0.2)',
                color: '#fff',
                opacity: currentAccount ? 1 : 0.5,
                transition: 'transform 0.2s'
              }}
              onMouseOver={(e) => currentAccount && (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              Get Balance
            </button>
          </div>
        </div>

        {/* Event Log */}
        <div style={{ margin: '30px 0', padding: '20px', background: 'rgba(0, 0, 0, 0.1)', borderRadius: '10px' }}>
          <div style={{ fontSize: '1.3em', marginBottom: '15px', borderBottom: '2px solid rgba(255, 255, 255, 0.2)', paddingBottom: '10px' }}>Event Log</div>
          <div style={{
            background: 'rgba(0, 0, 0, 0.3)',
            padding: '15px',
            borderRadius: '10px',
            maxHeight: '300px',
            overflowY: 'auto',
            fontFamily: '"Courier New", monospace',
            fontSize: '0.9em',
            minHeight: '100px'
          }}>
            {logs.length === 0 ? (
              <div style={{ opacity: 0.5 }}>No events yet. Click "Connect Wallet" to start.</div>
            ) : (
              logs.map((log, idx) => (
                <div
                  key={idx}
                  style={{
                    margin: '5px 0',
                    padding: '5px',
                    borderLeft: `3px solid ${
                      log.type === 'error' ? '#ef4444' : log.type === 'success' ? '#10b981' : '#667eea'
                    }`,
                    paddingLeft: '10px',
                    color: log.type === 'error' ? '#fca5a5' : log.type === 'success' ? '#86efac' : '#fff'
                  }}
                >
                  [{log.timestamp}] {log.message}
                </div>
              ))
            )}
          </div>
          <button
            onClick={clearLog}
            style={{
              marginTop: '10px',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.2)',
              color: '#fff',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
          >
            Clear Log
          </button>
        </div>
      </div>
    </div>
  )
}
