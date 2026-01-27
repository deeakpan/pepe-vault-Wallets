"use client"

import { Code, Book, Wallet } from "lucide-react"

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
            <Code className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Unchained dApp Integration</h1>
            <p className="text-xs text-gray-400">Single, simple way to connect only to Unchained Wallet</p>
          </div>
        </header>

        {/* Overview */}
        <section className="glass-card p-6 space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-300">
            <Book className="w-3 h-3" />
            Unchained SDK · wagmi · viem · Vanilla JS
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            This page shows **two ways** to connect a dApp to **Unchained Wallet**:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
              <h3 className="text-sm font-semibold text-green-400 mb-2">1. Unchained SDK (Recommended)</h3>
              <p className="text-xs text-gray-300 mb-2">
                Use the <span className="font-semibold text-green-400">Unchained SDK</span> if you're building a React app with wagmi/viem.
              </p>
              <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                <li>React components included</li>
                <li>wagmi/viem integration</li>
                <li>TypeScript support</li>
                <li>WalletConnect support</li>
              </ul>
            </div>
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-400 mb-2">2. Vanilla JavaScript</h3>
              <p className="text-xs text-gray-300 mb-2">
                Use <span className="font-semibold text-blue-400">raw EIP-1193</span> if you're not using React or want full control.
              </p>
              <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                <li>No dependencies</li>
                <li>Direct provider access</li>
                <li>Works with any framework</li>
                <li>Full EIP-1193 standard</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Installation */}
        <section className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Code className="w-4 h-4 text-green-500" />
            Installation
          </h2>
          <p className="text-xs text-gray-300">
            Install the Unchained SDK:
          </p>
          <pre className="text-[11px] bg-black/70 rounded p-3 border border-white/10 overflow-x-auto">
            <code>npm install unchainedwallet</code>
          </pre>
          <p className="text-xs text-gray-400 mt-2">The SDK wraps wagmi + viem and is focused on Unchained only.</p>
        </section>

        {/* React Example (Only Unchained) */}
        <section className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="w-4 h-4 text-green-500" />
            React · Connect Only to Unchained
          </h2>
          <p className="text-xs text-gray-300">
            Drop this into your React app to get a **single “Connect Unchained” button**. The dApp must provide its own
            RPC URL when creating the config.
          </p>
          <pre className="text-[11px] bg-black/70 rounded p-3 border border-white/10 overflow-x-auto">
            <code>{`import { createUnchainedConfig, WalletSelector } from "unchainedwallet"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { mainnet } from "wagmi/chains"

// 1. Your own RPC URL for mainnet (required)
const RPC_URL = "https://your-ethereum-rpc.example.com";

// 2. Create a wagmi config that prefers ONLY Unchained Wallet
const config = createUnchainedConfig({
  chains: [mainnet],
  // DApp must provide its own RPC config
  rpcUrls: {
    1: RPC_URL,
  },
  // Mark that you only want Unchained as the wallet
  onlyUnchained: true,
})

const queryClient = new QueryClient()

export function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* 3. Simple button – always connects to Unchained Wallet */}
        <WalletSelector onlyUnchained showUI={false} />
      </QueryClientProvider>
    </WagmiProvider>
  )
}`}</code>
          </pre>
          <p className="text-xs text-gray-300">
            After this, you can use normal wagmi + viem hooks (`useAccount`, `useSendTransaction`, etc.) the same way
            you would with any EVM wallet – but all connections go through Unchained.
          </p>
        </section>

        {/* Wallet Connect Features */}
        <section className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="w-4 h-4 text-green-500" />
            Wallet Connect Features
          </h2>
          <p className="text-xs text-gray-300 mb-4">
            Unchained Wallet supports all standard WalletConnect features, similar to MetaMask:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-green-400">Connection Features</h3>
              <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                <li>Session Proposals (dApp connection requests)</li>
                <li>Session Management (approve/reject connections)</li>
                <li>Multi-chain support (Ethereum Mainnet)</li>
                <li>Account switching</li>
                <li>Chain switching</li>
                <li>Session persistence</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-green-400">Transaction & Signing</h3>
              <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                <li>eth_sendTransaction</li>
                <li>eth_signTransaction</li>
                <li>eth_sign (legacy message signing)</li>
                <li>personal_sign (EIP-191)</li>
                <li>eth_signTypedData (EIP-712)</li>
                <li>eth_signTypedData_v4</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-green-400">Event Handling</h3>
              <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                <li>chainChanged events</li>
                <li>accountsChanged events</li>
                <li>Session disconnect events</li>
                <li>Session update events</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-green-400">Advanced Features</h3>
              <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                <li>WalletConnect URI pairing</li>
                <li>Deep linking support</li>
                <li>Session restoration</li>
                <li>Request approval/rejection</li>
                <li>Multi-session support</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-xs text-green-300">
              ✅ <strong>Full Compatibility:</strong> Unchained Wallet supports all standard WalletConnect methods that MetaMask supports, 
              making it a drop-in replacement for dApp integrations.
            </p>
          </div>
        </section>

        {/* Custom Connect Button Example */}
        <section className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="w-4 h-4 text-green-500" />
            Custom Connect Button · Use Unchained Extension
          </h2>
          <p className="text-xs text-gray-300">
            Since RainbowKit v2 requires wagmi v2 (and this project uses wagmi v3), we provide a simple custom connect button 
            that works directly with the Unchained Wallet extension. The extension exposes a standard injected <code>window.ethereum</code> 
            with <code>isUnchained: true</code>.
          </p>
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-4">
            <p className="text-xs text-yellow-300">
              💡 <strong>Note:</strong> RainbowKit v2 is incompatible with wagmi v3. Use this custom solution or wait for RainbowKit v3 support.
            </p>
          </div>
          <pre className="text-[11px] bg-black/70 rounded p-3 border border-white/10 overflow-x-auto">
            <code>{`"use client"

import { useState, useEffect } from "react"

export function ConnectUnchainedButton() {
  const [isInstalled, setIsInstalled] = useState(false)
  const [connected, setConnected] = useState(false)
  const [account, setAccount] = useState<string | null>(null)

  useEffect(() => {
    // Check if Unchained Wallet extension is installed
    if (typeof window !== 'undefined') {
      const ethereum = (window as any).ethereum
      if (ethereum?.isUnchained) {
        setIsInstalled(true)
      }
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
    <div>
      {!connected ? (
        <button onClick={handleConnect} className="connect-button">
          {isInstalled ? 'Connect Unchained Wallet' : 'Connect Wallet'}
        </button>
      ) : (
        <div>
          <p>Connected: {account}</p>
          <button onClick={handleDisconnect}>Disconnect</button>
        </div>
      )}
    </div>
  )
}`}</code>
          </pre>
          <p className="text-xs text-gray-300">
            This simple custom connect button works directly with the Unchained Wallet extension via <code>window.ethereum</code>. 
            It detects when the extension is installed and allows users to connect seamlessly.
          </p>
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-xs text-blue-300">
              🔍 <strong>How it works:</strong> The button checks for <code>window.ethereum.isUnchained</code> to detect the extension. 
              When users click connect, it calls <code>eth_requestAccounts</code> which opens the Unchained Wallet approval UI.
            </p>
          </div>
        </section>

        {/* Plain JavaScript Example */}
        <section className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Code className="w-4 h-4 text-green-500" />
            Vanilla JS · Complete Integration (No SDK)
          </h2>
          <p className="text-xs text-gray-300">
            If you are not using React or the SDK, you can connect directly to Unchained from plain JavaScript. The extension
            injects <code>window.unchained</code> and <code>window.ethereum</code> as the Unchained provider. This is the
            same approach used in the test page.
          </p>
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg mb-4">
            <p className="text-xs text-blue-300">
              💡 <strong>Note:</strong> This is the raw EIP-1193 provider interface. No SDK, no React, just pure JavaScript.
            </p>
          </div>
          <pre className="text-[11px] bg-black/70 rounded p-3 border border-white/10 overflow-x-auto">
            <code>{`// Helper to get the Unchained provider (extension or iframe)
function getUnchainedProvider() {
  if (typeof window === 'undefined') return null;
  
  // Check window.unchained first (extension's primary namespace)
  if (window.unchained && window.unchained.isUnchained) {
    return window.unchained;
  }
  
  // Check window.ethereum for Unchained provider
  if (window.ethereum) {
    // Check if it's the Unchained provider
    if (window.ethereum.isUnchained) {
      return window.ethereum;
    }
    // Check if it has Unchained metadata
    if (window.ethereum._unchainedMetadata) {
      return window.ethereum;
    }
  }
  
  return null;
}

// Check if wallet is available
function checkWallet() {
  const provider = getUnchainedProvider();
  if (!provider) {
    console.log('Unchained Wallet not detected');
    return false;
  }
  console.log('Unchained Wallet detected!');
  return true;
}

// Setup event listeners for wallet events
function setupEventListeners() {
  const provider = getUnchainedProvider();
  if (!provider || !provider.on) return;

  // Listen for account changes
  provider.on('accountsChanged', (accounts) => {
    if (accounts.length > 0) {
      console.log('Account changed:', accounts[0]);
      // Update your UI with new account
    } else {
      console.log('Account disconnected');
      // Clear your UI
    }
  });

  // Listen for chain changes
  provider.on('chainChanged', (chainId) => {
    const chainIdDecimal = parseInt(chainId, 16);
    console.log('Chain changed:', chainIdDecimal);
    // Update your UI with new chain
  });

  // Listen for disconnect
  provider.on('disconnect', () => {
    console.log('Wallet disconnected');
    // Clear your UI
  });
}

// Connect to Unchained Wallet
async function connectUnchained() {
  const provider = getUnchainedProvider();
  if (!provider || !provider.request) {
    alert('Unchained Wallet not detected. Make sure the Unchained extension is installed and enabled.');
    return;
  }

  try {
    // Request accounts (this will open Unchained's /connect page if needed)
    const accounts = await provider.request({ 
      method: 'eth_requestAccounts' 
    });
    
    if (accounts && accounts.length > 0) {
      console.log('Connected to Unchained:', accounts[0]);
      // Store account and update UI
      return accounts[0];
    }
  } catch (error) {
    console.error('Unchained connect failed:', error);
    if (error.code === 4001) {
      alert('User rejected connection request');
    } else {
      alert('Connection failed: ' + error.message);
    }
  }
}

// Get current account (if already connected)
async function getCurrentAccount() {
  const provider = getUnchainedProvider();
  if (!provider) return null;
  
  try {
    const accounts = await provider.request({ method: 'eth_accounts' });
    return accounts && accounts.length > 0 ? accounts[0] : null;
  } catch (error) {
    console.error('Failed to get accounts:', error);
    return null;
  }
}

// Get current chain ID
async function getChainId() {
  const provider = getUnchainedProvider();
  if (!provider) return null;
  
  try {
    const chainIdHex = await provider.request({ method: 'eth_chainId' });
    return parseInt(chainIdHex, 16);
  } catch (error) {
    console.error('Failed to get chain ID:', error);
    return null;
  }
}

// Send a transaction
async function sendTransaction(to, valueInEth) {
  const provider = getUnchainedProvider();
  if (!provider) {
    throw new Error('Wallet not connected');
  }

  // Convert ETH amount to wei (hex)
  const valueInWei = BigInt(Math.floor(Number.parseFloat(valueInEth) * 1e18));
  const valueHex = '0x' + valueInWei.toString(16);

  try {
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: await getCurrentAccount(),
        to: to,
        value: valueHex,
      }]
    });
    console.log('Transaction sent:', txHash);
    return txHash;
  } catch (error) {
    console.error('Transaction failed:', error);
    throw error;
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  // Check wallet availability
  checkWallet();
  setupEventListeners();
  
  // Re-check after delays (extension might load at different times)
  setTimeout(checkWallet, 500);
  setTimeout(checkWallet, 1500);
  setTimeout(checkWallet, 3000);
});

// Listen for provider initialization events
window.addEventListener('ethereum#initialized', () => {
  console.log('Ethereum provider initialized');
  checkWallet();
  setupEventListeners();
});

window.addEventListener('unchained#initialized', () => {
  console.log('Unchained provider initialized');
  checkWallet();
  setupEventListeners();
});

window.addEventListener('unchainedProviderReady', () => {
  console.log('Unchained provider ready');
  checkWallet();
  setupEventListeners();
});

// Example: Connect button
document.getElementById('connect-btn')?.addEventListener('click', async () => {
  const account = await connectUnchained();
  if (account) {
    document.getElementById('status').textContent = \`Connected: \${account}\`;
  }
});`}</code>
          </pre>
          <p className="text-xs text-gray-300 mt-4">
            This complete example includes:
          </p>
          <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside mt-2">
            <li>Provider detection (checks both <code>window.unchained</code> and <code>window.ethereum</code>)</li>
            <li>Event listeners for initialization events</li>
            <li>Account and chain change listeners</li>
            <li>Connection, transaction, and balance functions</li>
            <li>Retry logic for extension loading</li>
            <li>Error handling</li>
          </ul>
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-xs text-green-300">
              ✅ <strong>Full EIP-1193 Support:</strong> This uses the standard Ethereum Provider interface, so it works with any EIP-1193 compatible wallet, but prioritizes Unchained when available.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}


