# Iframe Injection Architecture

## How `window.ethereum` Injection Works

### The Problem

When a dApp runs inside an iframe, it needs access to `window.ethereum` to connect to wallets. However, browsers have security restrictions (Same-Origin Policy) that prevent JavaScript injection into cross-origin iframes.

### The Solution

We use a **proxy approach** for cross-origin iframes:

1. **Same-Origin Iframes** (e.g., `https://yourdomain.com/dapp`):
   - Direct injection works ✅
   - We can access `iframe.contentDocument` and inject our script directly
   - Script loads synchronously before dApp code runs

2. **Cross-Origin Iframes** (e.g., `https://uniswap.org`):
   - Direct injection blocked ❌
   - Browser security prevents accessing `iframe.contentDocument`
   - **Solution**: Route through `/proxy?url=...` to make it same-origin

### How It Works

#### Step 1: URL Detection
When you navigate to a URL in the browser:
```javascript
// Browser detects if URL is cross-origin
const targetOrigin = new URL(targetUrl).origin
const currentOrigin = window.location.origin

if (targetOrigin !== currentOrigin) {
  // Route through proxy
  targetUrl = `${currentOrigin}/proxy?url=${encodeURIComponent(targetUrl)}`
}
```

#### Step 2: Proxy Page Loads
The `/proxy` page:
- Loads the dApp URL in an iframe
- Since the proxy page is on the same origin, we can inject into the iframe
- Injects `unchained-inject.js` synchronously before dApp code runs

#### Step 3: Provider Injection
The `unchained-inject.js` script:
- Creates `window.ethereum` provider object
- Implements `request()`, `on()`, `removeListener()` methods
- Dispatches `ethereum#initialized` event
- Handles all wallet requests via `postMessage` to parent

#### Step 4: Request Flow
When dApp calls `window.ethereum.request()`:
1. Request sent via `postMessage` to parent (browser page)
2. Browser page redirects to `/connect` or `/sign` for approval
3. After approval, result sent back via `postMessage`
4. Promise resolves with the result

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Page                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  /proxy?url=https://uniswap.org                   │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │  iframe: https://uniswap.org                 │ │  │
│  │  │  ┌─────────────────────────────────────────┐ │ │  │
│  │  │  │  unchained-inject.js                    │ │ │  │
│  │  │  │  → window.ethereum = { ... }            │ │ │  │
│  │  │  └─────────────────────────────────────────┘ │ │  │
│  │  │  ┌─────────────────────────────────────────┐ │ │  │
│  │  │  │  dApp code                              │ │ │  │
│  │  │  │  → window.ethereum.request()            │ │ │  │
│  │  │  │  → postMessage to parent                │ │ │  │
│  │  │  └─────────────────────────────────────────┘ │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
│                                                           │
│  Listens for postMessage                                 │
│  → Redirects to /connect or /sign                        │
│  → Sends result back via postMessage                     │
└─────────────────────────────────────────────────────────┘
```

### Key Points

1. **Synchronous Loading**: The inject script loads with `async=false` to ensure it runs before dApp code
2. **Early Injection**: Script is inserted at the very beginning of `<head>` to be available immediately
3. **Event Dispatch**: `ethereum#initialized` event is dispatched so dApps can detect the provider
4. **PostMessage Communication**: All requests use `postMessage` for cross-frame communication
5. **Automatic Routing**: Browser automatically routes cross-origin URLs through proxy

### Why This Works

- **Proxy makes it same-origin**: By loading the dApp through our proxy page, the iframe becomes same-origin with our wallet
- **Synchronous injection**: Script loads before dApp code, so `window.ethereum` is available when dApp checks for it
- **Event-based detection**: dApps listen for `ethereum#initialized` event, which we dispatch immediately

### Limitations

- **CORS restrictions**: Some dApps may block being loaded in iframes (X-Frame-Options header)
- **Content Security Policy**: Some dApps have CSP that prevents script injection
- **Performance**: Proxy adds one extra hop, but minimal impact

### Testing

To test if injection is working:
1. Open browser console in the iframe (if possible)
2. Check: `window.ethereum.isUnchained` should be `true`
3. Check: `window.ethereum` should exist and have `request()` method
4. Check console for: `[Unchained Wallet] ✅ Provider injected and ready`

