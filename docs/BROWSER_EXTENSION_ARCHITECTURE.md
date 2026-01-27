# Browser Extension Architecture for Unchained Wallet

## Overview

A browser extension can inject `window.ethereum` into all websites and redirect to your web wallet for approvals. This makes **Unchained Wallet** available as the only EVM provider on all websites.

## How It Works

1. **Extension injects `window.ethereum`** into every webpage
2. **dApp calls `window.ethereum.request()`** (e.g., `eth_requestAccounts`)
3. **Extension intercepts the request** and redirects to your web wallet
4. **User approves on web wallet** (`/connect` or `/sign` page)
5. **Web wallet redirects back** with result
6. **Extension returns result** to the dApp

## Extension Structure

```
extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (handles redirects)
├── content-script.js      # Injected into web pages (provides window.ethereum)
├── popup.html            # Extension popup UI (optional)
└── icons/                # Extension icons
```

## Implementation Steps

### 1. Create `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Unchained Wallet",
  "version": "1.0.0",
  "description": "Unchained Web Wallet Extension",
  "permissions": [
    "storage",
    "tabs"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content-script.js"],
      "run_at": "document_start",
      "all_frames": true
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "web_accessible_resources": [
    {
      "resources": ["injected.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

### 2. Create `content-script.js`

This injects `window.ethereum` into all web pages as an **Unchained-only** provider:

```javascript
// Inject the Unchained ethereum provider into the page
(function() {
  // Prevent multiple injections
  if ((window.ethereum && window.ethereum.isUnchained) || window.unchained) {
    return
  }

  // Create the provider object
  const provider = {
    // Mark this provider so dApps know it's Unchained
    isUnchained: true,

    // Request method - intercepts all requests and routes to Unchained
    request: async (args) => {
      const { method, params = [] } = args

      // Generate unique request ID
      const requestId = Math.random().toString(36).substring(7)

      // Store request in chrome.storage
      await chrome.storage.local.set({
        [`unchained_request_${requestId}`]: {
          method,
          params,
          origin: window.location.origin,
          timestamp: Date.now()
        }
      })

      // Your deployed Unchained web wallet URL
      const walletUrl = 'https://uchainwebapp.vercel.app' // or localhost:3000 for dev

      // Redirect to your web wallet with request info
      const redirectUrl = `${walletUrl}/connect?origin=${encodeURIComponent(
        window.location.origin
      )}&method=${encodeURIComponent(method)}&requestId=${requestId}`

      // Ask background script to open the wallet
      chrome.runtime.sendMessage({
        type: 'OPEN_WALLET',
        url: redirectUrl,
        requestId
      })

      // Wait for response from background script
      return new Promise((resolve, reject) => {
        function listener(message) {
          if (message.type === 'WALLET_RESPONSE' && message.requestId === requestId) {
            chrome.runtime.onMessage.removeListener(listener)
            if (message.error) {
              reject(new Error(message.error))
            } else {
              resolve(message.result)
            }
          }
        }
        chrome.runtime.onMessage.addListener(listener)
      })
    },

    // Optional: basic event API for dApps
    on: (event, listener) => {
      if (!window._unchainedListeners) window._unchainedListeners = {}
      if (!window._unchainedListeners[event]) window._unchainedListeners[event] = []
      window._unchainedListeners[event].push(listener)
    },

    removeListener: (event, listener) => {
      if (window._unchainedListeners && window._unchainedListeners[event]) {
        window._unchainedListeners[event] = window._unchainedListeners[event].filter(
          (l) => l !== listener,
        )
      }
    },

    // Optional: expose current chain
    chainId: '0x1', // Default to Ethereum
    networkVersion: '1'
  }

  // Also expose as window.unchained so SDKs can detect explicitly
  window.unchained = provider

  // Inject into page as window.ethereum if it's not already taken
  if (!window.ethereum) {
    Object.defineProperty(window, 'ethereum', {
      value: provider,
      writable: false,
      configurable: false
    })
  }

  // Dispatch connect event
  window.dispatchEvent(new Event('ethereum#initialized'))
})()
```

### 3. Create `background.js`

Handles redirects and communication:

```javascript
// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_WALLET') {
    // Open wallet in new tab
    chrome.tabs.create({
      url: message.url,
      active: true
    }, (tab) => {
      // Store tab ID and request ID mapping
      chrome.storage.local.set({
        [`tab_${tab.id}`]: message.requestId
      })
    })
  }
  
  // Listen for response from wallet
  if (message.type === 'WALLET_APPROVED' || message.type === 'WALLET_REJECTED') {
    // Get the original tab that made the request
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'WALLET_RESPONSE',
          requestId: message.requestId,
          result: message.result,
          error: message.error
        }).catch(() => {
          // Tab might not have content script, ignore
        })
      })
    })
  }
})

// Listen for tab updates (when user returns from wallet)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if returning from wallet with result
    const url = new URL(tab.url)
    if (url.searchParams.get('wallet_status')) {
      const requestId = url.searchParams.get('requestId')
      const result = url.searchParams.get('wallet_result')
      const error = url.searchParams.get('wallet_error')
      
      if (requestId) {
        // Send response to all tabs
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(t => {
            chrome.tabs.sendMessage(t.id, {
              type: 'WALLET_RESPONSE',
              requestId: requestId,
              result: result ? decodeURIComponent(result) : undefined,
              error: error || undefined
            }).catch(() => {})
          })
        })
      }
    }
  }
})
```

### 4. Update Web Wallet to Handle Extension Requests

In your web wallet's `/connect` page, check for `requestId` parameter:

```typescript
// app/connect/page.tsx
const requestId = searchParams.get('requestId')

// After approval, redirect back with result
if (requestId) {
  // This is a request from the extension
  const returnUrl = `${origin}?wallet_status=approved&requestId=${requestId}&wallet_result=${encodeURIComponent(JSON.stringify(result))}`
  // Don't redirect - extension will handle it
  // Instead, send message to extension
  if (window.chrome?.runtime) {
    window.chrome.runtime.sendMessage({
      type: 'WALLET_APPROVED',
      requestId: requestId,
      result: result
    })
  }
}
```

## Benefits

✅ **Works on ALL websites** - No same-origin restrictions  
✅ **No CORS issues** - Extension has full permissions  
✅ **Familiar UX** - dApps just call `window.ethereum.request(...)`  
✅ **Centralized wallet** - All approvals go to your web wallet  
✅ **Easy updates** - Update web wallet, extension stays the same  

## Alternative: Simpler Redirect Approach

Instead of complex messaging, you can:

1. Extension opens wallet in new tab
2. User approves on web wallet
3. Web wallet redirects back to original dApp tab
4. Extension injects result into `window.ethereum.request()` promise

## Next Steps

1. Create extension folder structure
2. Set up manifest.json
3. Build content script to inject `window.ethereum`
4. Build background script to handle redirects
5. Update web wallet to detect extension requests
6. Test with a dApp like Uniswap

Would you like me to create the full extension code?

