# Unchained Wallet SDK

A simple SDK for dApps to connect to **Unchained Wallet**, **MetaMask**, and **Coinbase Wallet** using wagmi and viem.

Automatically detects and prioritizes Unchained Wallet when available (`window.ethereum.isUnchained === true`).

## How Detection Works

The SDK detects wallets through `window.ethereum` flags:

- **Unchained Wallet**: `window.ethereum.isUnchained === true`
- **MetaMask**: `window.ethereum.isMetaMask === true` (and not Unchained)
- **Coinbase Wallet**: `window.ethereum.isCoinbaseWallet === true` (and not Unchained)

**Important**: Unchained Wallet sets all three flags (`isUnchained: true`, `isMetaMask: true`, `isCoinbaseWallet: true`) for compatibility, but the SDK prioritizes Unchained when `isUnchained === true`.

## Installation

```bash
npm install unchainedwallet wagmi viem @tanstack/react-query wagmi/connectors
# or
pnpm add unchainedwallet wagmi viem @tanstack/react-query wagmi/connectors
```

## Quick Start

### Option 1: Simple Connect Button (No UI - Auto-connects to Unchained)

```typescript
import { createUnchainedConfig, WalletSelector } from 'unchainedwallet'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mainnet, polygon } from 'wagmi/chains'

// IMPORTANT: Provide RPC URLs for WalletConnect chains
const wagmiConfig = createUnchainedConfig({
  projectId: 'your-walletconnect-project-id',
  chains: [mainnet, polygon],
  // RPCs are REQUIRED for WalletConnect - pick your chains and provide RPCs
  walletConnectRPCs: [
    {
      chainId: 1, // Ethereum
      rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
    },
    {
      chainId: 137, // Polygon
      rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY',
    },
  ],
})

const queryClient = new QueryClient()

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {/* Simple button - automatically connects to Unchained if available */}
        {/* Set showUI={false} to disable wallet selection UI */}
        <WalletSelector 
          showUI={false} 
          walletConnectRPCs={[
            { chainId: 1, rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY' },
            { chainId: 137, rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY' },
          ]}
        />
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

**Or use the hook directly:**

```typescript
import { useConnectWallet } from 'unchainedwallet'

function ConnectButton() {
  const { connect, disconnect, isConnected, address, isUnchained } = useConnectWallet()

  if (isConnected) {
    return (
      <div>
        <p>Connected: {address}</p>
        <button onClick={disconnect}>Disconnect</button>
      </div>
    )
  }

  return (
    <button onClick={connect}>
      {isUnchained ? 'Connect Unchained' : 'Connect Wallet'}
    </button>
  )
}
```

### Option 2: With UI Component (Shows Wallet Selection - Default)

```typescript
import { createUnchainedConfig, WalletSelector } from 'unchainedwallet'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mainnet, polygon } from 'wagmi/chains'

// IMPORTANT: RPCs are REQUIRED for WalletConnect - pick your chains and provide RPCs
const wagmiConfig = createUnchainedConfig({
  projectId: 'your-walletconnect-project-id',
  chains: [mainnet, polygon],
  // RPCs are REQUIRED for WalletConnect chains
  walletConnectRPCs: [
    {
      chainId: 1, // Ethereum
      rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
      name: 'Ethereum',
    },
    {
      chainId: 137, // Polygon
      rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY',
      name: 'Polygon',
    },
  ],
})

const queryClient = new QueryClient()

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {/* Default: showUI={true} - Shows wallet selection UI */}
        <WalletSelector 
          showUI={true} // Default - shows wallet selection UI
          onlyUnchained={false} // Set to true to only show Unchained
          disableMetaMask={false} // Set to true to hide MetaMask
          disableCoinbase={false} // Set to true to hide Coinbase
          walletConnectProjectId="your-project-id"
          walletConnectRPCs={[
            { chainId: 1, rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY' },
            { chainId: 137, rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY' },
          ]}
          onConnect={(address, walletType) => {
            console.log('Connected:', address, walletType)
          }}
          onDisconnect={() => {
            console.log('Disconnected')
          }}
        />
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

### Option 2: Vanilla JavaScript (No React)

```typescript
import { createWalletManager } from 'unchainedwallet'

// Create wallet manager
const wallet = createWalletManager({
  projectId: 'your-walletconnect-project-id',
  walletConnectRPCs: [
    {
      chainId: 1,
      rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
      name: 'Ethereum',
    },
    {
      chainId: 137,
      rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY',
      name: 'Polygon',
    },
  ],
})

// Listen to events
wallet.on('connect', ({ account, chainId }) => {
  console.log('Connected:', account, chainId)
})

wallet.on('disconnect', () => {
  console.log('Disconnected')
})

wallet.on('accountsChanged', (accounts) => {
  console.log('Accounts changed:', accounts)
})

// Connect
document.getElementById('connect-btn')?.addEventListener('click', async () => {
  try {
    const address = await wallet.connect()
    console.log('Connected to:', address)
  } catch (error) {
    console.error('Connection failed:', error)
  }
})

// Disconnect
document.getElementById('disconnect-btn')?.addEventListener('click', async () => {
  await wallet.disconnect()
})

// Send transaction
document.getElementById('send-btn')?.addEventListener('click', async () => {
  if (!wallet.isConnected()) {
    alert('Please connect wallet first')
    return
  }
  
  try {
    const txHash = await wallet.sendTransaction(
      '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      '0x2386f26fc10000', // 0.01 ETH in wei
    )
    console.log('Transaction sent:', txHash)
  } catch (error) {
    console.error('Transaction failed:', error)
  }
})
```

### Option 3: Without UI (Custom Implementation)

```typescript
import { createUnchainedConfig } from 'unchainedwallet'
import { useConnect, useAccount } from 'wagmi'
import { injected } from 'wagmi/connectors'

// Create config
const wagmiConfig = createUnchainedConfig({
  chains: [mainnet],
})

function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()

  // Find available wallets
  const injectedConnector = connectors.find(c => c.id === 'injected')

  if (isConnected) {
    return <div>Connected: {address}</div>
  }

  return (
    <button onClick={() => connect({ connector: injectedConnector })}>
      Connect Wallet
    </button>
  )
}
```

## WalletSelector Component

The `WalletSelector` component provides a ready-to-use UI for wallet connection.

### Props

```typescript
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
  
  /** Custom CSS class */
  className?: string
  
  /** Callback when wallet is connected */
  onConnect?: (address: string, walletType: string) => void
  
  /** Callback when wallet is disconnected */
  onDisconnect?: () => void
}
```

### Examples

**Only Unchained Wallet:**
```tsx
<WalletSelector onlyUnchained={true} />
```

**Unchained + MetaMask (no Coinbase):**
```tsx
<WalletSelector disableCoinbase={true} />
```

**All wallets with WalletConnect:**
```tsx
<WalletSelector 
  walletConnectProjectId="your-project-id"
  disableWalletConnect={false}
/>
```

## Using Transactions (Normal wagmi/viem)

Once connected, use standard wagmi hooks for transactions:

```typescript
import { useSendTransaction, useWriteContract, useBalance } from 'wagmi'
import { parseEther } from 'viem'

function SendTransaction() {
  const { address } = useAccount()
  const { data: balance } = useBalance({ address })
  const { sendTransaction, isPending } = useSendTransaction()

  const handleSend = async () => {
    await sendTransaction({
      to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      value: parseEther('0.1'),
    })
  }

  return (
    <div>
      <p>Balance: {balance?.formatted} ETH</p>
      <button onClick={handleSend} disabled={isPending}>
        {isPending ? 'Sending...' : 'Send 0.1 ETH'}
      </button>
    </div>
  )
}
```

## API Reference

### `isUnchainedInstalled()`

Check if Unchained wallet is installed.

```typescript
import { isUnchainedInstalled } from 'unchainedwallet'

if (isUnchainedInstalled()) {
  console.log('Unchained wallet is available!')
}
```

### `getDetectedWallet()`

Get information about the currently detected wallet.

```typescript
import { getDetectedWallet } from 'unchainedwallet'

const wallet = getDetectedWallet()
console.log(wallet.name) // "Unchained Wallet", "MetaMask", "Coinbase Wallet", etc.
console.log(wallet.type) // "unchained", "metamask", "coinbase", "injected"
```

### `createUnchainedConfig(options)`

Create a wagmi config optimized for Unchained, MetaMask, and Coinbase.

**Options:**
- `projectId` (string, optional): WalletConnect Project ID
- `chains` (Chain[], optional): Array of chains (defaults to mainnet)
- `rpcUrls` (Record<number, string>, optional): Custom RPC URLs
- `enableMetaMask` (boolean, optional): Enable MetaMask (default: true)
- `enableCoinbase` (boolean, optional): Enable Coinbase Wallet (default: true)
- `enableWalletConnect` (boolean, optional): Enable WalletConnect (default: true if projectId provided)

## Detection & Priority

The SDK automatically detects wallets in this priority order:

1. **Unchained Wallet** - Detected via `window.ethereum.isUnchained === true`
2. **MetaMask** - Detected via `window.ethereum.isMetaMask === true` (and not Unchained)
3. **Coinbase Wallet** - Detected via `window.ethereum.isCoinbaseWallet === true` (and not Unchained)
4. **Generic Injected** - Any other `window.ethereum` provider
5. **WalletConnect** - If projectId is provided

**Note**: Unchained Wallet sets `isUnchained: true`, `isMetaMask: true`, and `isCoinbaseWallet: true` to ensure compatibility, but the SDK prioritizes Unchained when `isUnchained === true`.

## Complete Example

```typescript
'use client'

import { createUnchainedConfig, WalletSelector } from 'unchainedwallet'
import { mainnet } from 'wagmi/chains'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAccount, useSendTransaction, useBalance } from 'wagmi'
import { parseEther, formatEther } from 'viem'

// 1. Create config
const wagmiConfig = createUnchainedConfig({
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  chains: [mainnet],
})

const queryClient = new QueryClient()

// 2. Setup providers
function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <DApp />
      </QueryClientProvider>
    </WagmiProvider>
  )
}

// 3. Your dApp component
function DApp() {
  const { address, isConnected } = useAccount()
  const { data: balance } = useBalance({ address })
  const { sendTransaction, isPending } = useSendTransaction()

  const handleSend = async () => {
    await sendTransaction({
      to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      value: parseEther('0.001'),
    })
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>My dApp</h1>
      
      {/* Wallet Selector UI */}
      <div style={{ marginBottom: '2rem' }}>
        <WalletSelector 
          onConnect={(address, walletType) => {
            console.log(`Connected to ${walletType}: ${address}`)
          }}
        />
      </div>

      {/* Transaction UI (only shown when connected) */}
      {isConnected && (
        <div>
          <p>Address: {address}</p>
          <p>Balance: {balance ? formatEther(balance.value) : '0'} ETH</p>
          <button onClick={handleSend} disabled={isPending}>
            {isPending ? 'Sending...' : 'Send 0.001 ETH'}
          </button>
        </div>
      )}
    </div>
  )
}
```

## License

MIT
