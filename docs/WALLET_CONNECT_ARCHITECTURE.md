# Unchained Wallet Connect Architecture

## How External dApps Connect

### Current Architecture

1. **Same-Origin dApps** (e.g., `/test-wallet-connect`)
   - Provider is initialized automatically
   - `window.ethereum.isUnchained === true`
   - Works directly with `eth_requestAccounts`

2. **External dApps via Browser** (e.g., Uniswap in `/browser`)
   - Loaded in iframe
   - **Problem**: Can't inject provider into cross-origin iframes (CORS)
   - **Solution**: Use WalletConnect or Browser Extension

3. **External dApps via WalletConnect**
   - dApp generates WalletConnect URI
   - User scans/connects via WalletConnect
   - Works for any external dApp

4. **External dApps via Browser Extension** (Recommended)
   - Extension injects `window.ethereum` into all websites
   - Redirects to web wallet for approvals
   - Works on ALL websites (like MetaMask)
   - See `BROWSER_EXTENSION_ARCHITECTURE.md` for implementation

## Why Standalone HTML File Doesn't Work

The standalone `test-wallet-connect.html` file:
- ❌ Doesn't have the Unchained provider initialized
- ❌ Can't access `window.ethereum.isUnchained`
- ✅ Will work with MetaMask/Coinbase if installed
- ✅ Will work if opened as a route in the wallet app (`/test-wallet-connect`)

## How to Test

### Option 1: Test Route (Recommended)
```
1. npm run dev
2. Go to: http://localhost:3000/test-wallet-connect
3. Click "Connect Wallet"
4. Approve on /connect page
5. Test other features
```

### Option 2: External dApps
```
1. Use WalletConnect (recommended for external dApps)
2. Or use the browser feature at /browser
3. dApps in browser will need WalletConnect to connect
```

## For dApp Developers

### If dApp is on Same Origin
- Provider is automatically available
- Just use `window.ethereum.request({ method: 'eth_requestAccounts' })`

### If dApp is External
- Use WalletConnect SDK
- Configure with your WalletConnect Project ID
- Users connect via WalletConnect modal

## Browser Feature Limitation

The browser feature (`/browser`) loads external websites in iframes. Due to browser security (CORS), we cannot inject `window.ethereum` into cross-origin iframes. 

**Solution**: External dApps should use WalletConnect for connection.

