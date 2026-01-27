## PEPU VAULT – Full Architecture & Code Walkthrough

PEPU VAULT is a **non‑custodial PEPU VAULT WALLET** for Ethereum and PEPU (Pepe Unchained V2).  
It ships as:

- **Next.js 16 app** (`app/`, `lib/`, `components/`)
- **Chromium extension** (`extension/`)
- **dApp SDK** (`sdk/`)
- **On‑chain contracts + scripts** (`contracts/`, `artifacts/`, `scripts/`)

This README walks through how all the major pieces fit together, with a **line‑by‑line style explanation for the critical flows**: iframe injection, the extension provider, and the core wallet logic.

---

## 1. High‑Level System Overview

- **PEPU VAULT WALLET core (web app)**  
  - Built with Next.js / React (app router)  
  - Stores **encrypted keys in localStorage only**  
  - Handles setup, unlock, signing, sending, swapping, rewards, etc.

- **Built‑in dApp browser (`app/browser/page.tsx`)**  
  - Loads dApps in an `<iframe>`  
  - Injects `window.ethereum` into the iframe using a custom script (`/unchained-inject.js`)  
  - If the dApp is cross‑origin, routes via `/proxy?url=…` so we can inject synchronously.

- **Browser extension (`extension/`)**  
  - Injects `window.ethereum` into *every* site  
  - For wallet‑specific methods (`eth_requestAccounts`, `eth_sendTransaction`, signing) it opens the PEPU VAULT WALLET UI for approval, then returns the result to the dApp.

- **SDK (`sdk/`)**  
  - Makes dApps prefer PEPU VAULT when `window.ethereum.isUnchained === true`  
  - Provides React `WalletSelector` and vanilla helpers.

- **Rewards mechanism (`REWARDS_MECHANISM.md`)**  
  - Users earn **10% of fees paid** as UCHAIN rewards under clear rules for transfers and swaps.

---

## 2. Core Web App: Pages & Wallet Logic

### 2.1 Global Layout (`app/layout.tsx`)

- Imports React types and Next metadata:

```startLine:endLine:app/layout.tsx
import type React from "react"
import type { Metadata } from "next"
import { Geist } from "next/font/google"
import { AppProviders } from "@/components/AppProviders"
import "./globals.css"
```

- Configures the **Geist font** and sets the global `metadata`:

```startLine:endLine:app/layout.tsx
const geist = Geist({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "PEPU VAULT",
  description: "Non-custodial VAULT WALLET for ETH and PEPU",
  icons: {
    icon: "/pepu-vault-logo.png",
    apple: "/pepu-vault-logo.png",
  },
  generator: 'v0.app'
}
```

- Wraps every page in a full‑screen black theme and global providers:

```startLine:endLine:app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className={`${geist.className} bg-black text-white h-full w-full`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
```

**Key idea:** all pages share the same font, theme, and providers (wagmi, React Query, etc.) via `AppProviders`.

---

### 2.2 Wallet Storage & Encryption (`lib/wallet.ts`)

The **wallet model and encryption** live in `lib/wallet.ts`:

- A `Wallet` is a simple TypeScript interface:

```startLine:endLine:lib/wallet.ts
export interface Wallet {
  id: string
  address: string
  encryptedPrivateKey: string
  encryptedMnemonic?: string
  createdAt: number
  name?: string
  chainId: number
  derivationIndex?: number
}
```

- Wallets are stored under a localStorage key:

```startLine:endLine:lib/wallet.ts
const WALLETS_KEY = "unchained_wallets"
```

- `createWallet(password, name?, chainId)`:
  - Generates a random EOA with `ethers.Wallet.createRandom()`
  - Encrypts the private key and mnemonic using `encryptData` (AES + PBKDF2‑style KDF)
  - Returns a `Wallet` object that can be saved to localStorage.

- Utility functions (high‑level):
  - **`addWallet(wallet)`**: append to encoded JSON in localStorage  
  - **`getWallets()`**: read and parse localStorage, return array  
  - **`getCurrentWallet()` / `getCurrentWalletId()`**: track active wallet  
  - **`unlockWallet(password)`** / `getSessionPassword()`:
    - Store the current session password in memory / secure localStorage so signing pages can decrypt keys  
  - **`getPrivateKey(wallet, password)` / `getMnemonic(wallet, password)`**:
    - Decrypt the corresponding encrypted fields.

The **security model** is:

- Keys *never* leave the browser.  
- Everything is encrypted at rest with a user password.  
- Lock/unlock and auto‑lock are handled in `app/unlock/page.tsx` and `app/settings/page.tsx` using these helpers.

---

### 2.3 Setup Flow (`app/setup/page.tsx`)

`SetupPage` is where a new user creates or imports a PEPU VAULT WALLET.

Key state and hooks:

```startLine:endLine:app/setup/page.tsx
type SetupMode = "menu" | "create" | "import-seed" | "import-key"

export default function SetupPage() {
  const router = useRouter()
  useEffect(() => {
    const wallets = getWallets()
    if (wallets.length > 0) {
      router.push("/dashboard")
    }
  }, [router])
  const [mode, setMode] = useState<SetupMode>("menu")
  const [password, setPassword] = useState("")
  const [walletName, setWalletName] = useState("")
  const [seedPhrase, setSeedPhrase] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [derivedAddress, setDerivedAddress] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [mnemonic, setMnemonic] = useState("")
  const [quizIndices, setQuizIndices] = useState<number[]>([])
  const [quizAnswers, setQuizAnswers] = useState<string[]>([])
  const [quizError, setQuizError] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
```

#### 2.3.1 Creating a PEPU VAULT WALLET

```startLine:endLine:app/setup/page.tsx
const handleCreateWallet = async () => {
  if (!password || password.length < 4) {
    setError("Password must be exactly 4 digits")
    return
  }

  setLoading(true)
  try {
    const wallet = await createWallet(password, walletName || "My PEPU VAULT WALLET", 1)
    addWallet(wallet)
    const savedWallets = getWallets()
    const saved = savedWallets.find(w => w.id === wallet.id)
    if (!saved) {
      throw new Error("Failed to save PEPU VAULT WALLET - PEPU VAULT WALLET not found after save")
    }
    unlockWallet(password)
    const mnemonic = getMnemonic(wallet, password)
    setMnemonic(mnemonic || "")
    // then it prepares the 3‑word quiz to confirm backup
  } catch (err: any) {
    console.error("[Setup] Error creating wallet:", err)
    setError(err.message || "Failed to create PEPU VAULT WALLET. Please try again.")
  } finally {
    setLoading(false)
  }
}
```

**What’s happening:**

- Validates the 4‑digit passcode.
- Calls `createWallet`, persists it, verifies save.
- Unlocks the session with `unlockWallet(password)` so following flows don’t re‑prompt.
- Reads the mnemonic, shows backup + quiz.

#### 2.3.2 Importing from Seed or Private Key

Both flows are similar:

- Validate password + input  
- Use `importWalletFromMnemonic` or `importWalletFromPrivateKey`  
- Save wallet, verify it exists in localStorage  
- Unlock and route to `/dashboard`.

---

### 2.4 Dashboard, Send, Swap, Rewards

The main balance and transaction logic lives in:

- `app/dashboard/page.tsx` – portfolio, tokens, recent TXs, active PEPU VAULT WALLET, rewards summary.
- `app/send/page.tsx` – build and send ERC‑20 / native PEPU transactions using `lib/transactions.ts` and `lib/provider.ts`.
- `app/swap/page.tsx` – integrates swap routes (Uniswap style) and applies the **0.85% fee + 10% reward** structure described in `REWARDS_MECHANISM.md`.
- `app/rewards/page.tsx` – shows accumulated UCHAIN rewards, checks eligibility, allows claiming via `lib/rewards.ts`.

Rewards math is fully documented in `REWARDS_MECHANISM.md` (already very detailed), and the code follows that spec (fee rate, min rewards, CoinGecko pricing, Quoter usage).

---

## 3. Iframe Browser & `window.ethereum` Injection

The **built‑in dApp browser** is in `app/browser/page.tsx`. This is where the iframe logic and provider injection live.

### 3.1 Browser State & History

```startLine:endLine:app/browser/page.tsx
export default function BrowserPage() {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [currentUrl, setCurrentUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [tabs, setTabs] = useState<{ id: string; url: string; title: string }[]>([])
  const [activeTab, setActiveTab] = useState<string>("")
  const [desktopMode, setDesktopMode] = useState(false)
  const [history, setHistory] = useState<{ url: string; title: string; timestamp: number }[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showHeader, setShowHeader] = useState(true)
  const [showNavBar, setShowNavBar] = useState(true)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
```

On mount it restores browser history from localStorage:

```startLine:endLine:app/browser/page.tsx
useEffect(() => {
  const savedHistory = localStorage.getItem("browser_history")
  if (savedHistory) {
    setHistory(JSON.parse(savedHistory))
  }

  // then defines injectEthereumProvider() and event listeners...
}, [currentUrl])
```

### 3.2 `injectEthereumProvider` – Main Injection Logic

```startLine:endLine:app/browser/page.tsx
const injectEthereumProvider = () => {
  if (!iframeRef.current || !currentUrl) return

  try {
    const iframe = iframeRef.current
    const iframeDoc = iframe.contentDocument
    const iframeWindow = iframe.contentWindow

    if (!iframeDoc || !iframeWindow) {
      // Cross-origin: should be /proxy?url=...
      const iframeSrc = iframe.src || '';
      if (iframeSrc.includes('/proxy?url=')) {
        console.log('[Browser] Iframe is loaded through proxy - injection should work in proxy page');
      } else {
        console.warn('[Browser] Cross-origin iframe detected but NOT using proxy - window.ethereum will NOT be available');
      }
      return;
    }

    if (iframeWindow.ethereum?.isUnchained) {
      console.log('[Browser] Provider already injected');
      return;
    }
```

**Step‑by‑step:**

1. **Checks `iframeRef` + `currentUrl`** – bail early if iframe not ready.
2. **Gets `contentDocument` / `contentWindow`** – only available if iframe is same‑origin.
3. If **cross‑origin** and not proxied, logs a warning and cannot inject (browser security).
4. If provider already injected (`ethereum.isUnchained`), it stops to avoid duplicates.

Now it injects the script:

```startLine:endLine:app/browser/page.tsx
    const script = iframeDoc.createElement('script');
    script.src = `${window.location.origin}/unchained-inject.js?t=${Date.now()}`;
    script.async = false; // critical: sync load
    script.defer = false;
    script.setAttribute('data-unchained-inject', 'true');
    
    script.onload = () => {
      console.log('[Browser] ✅ Unchained provider successfully injected into iframe');
    };
    
    script.onerror = () => {
      console.warn('[Browser] Failed to load inject script, using inline fallback');
      // (see below)
    };
```

- Uses `async = false` and `defer = false` to ensure **synchronous** execution before dApp JS.
- Adds a cache‑busting `?t=…` to avoid stale versions.
- Logs success or falls back to inline injection.

#### 3.2.1 Inline Fallback

On error, it creates an inline `<script>` with a full provider implementation:

```startLine:endLine:app/browser/page.tsx
    script.onerror = () => {
      console.warn('[Browser] Failed to load inject script, using inline fallback');
      try {
        const inlineScript = iframeDoc.createElement('script');
        inlineScript.textContent = `
          (function() {
            if (window.ethereum && window.ethereum.isUnchained) return;
            const walletOrigin = '${window.location.origin}';
            const provider = {
              isUnchained: true,
              isMetaMask: true,
              isCoinbaseWallet: true,
              request: async (args) => {
                const { method, params = [] } = args;
                const requestId = Math.random().toString(36).substring(7);
                return new Promise((resolve, reject) => {
                  window._unchainedPendingRequests = window._unchainedPendingRequests || {};
                  window._unchainedPendingRequests[requestId] = { resolve, reject };
                  window.parent.postMessage({
                    type: 'UNCHAINED_WALLET_REQUEST',
                    requestId,
                    method,
                    params,
                    origin: window.location.origin
                  }, walletOrigin);
                  const messageListener = (event) => {
                    if (event.origin !== walletOrigin) return;
                    if (event.data.type === 'UNCHAINED_WALLET_RESPONSE' && event.data.requestId === requestId) {
                      window.removeEventListener('message', messageListener);
                      delete window._unchainedPendingRequests[requestId];
                      if (event.data.error) {
                        reject(new Error(event.data.error));
                      } else {
                        resolve(event.data.result);
                      }
                    }
                  };
                  window.addEventListener('message', messageListener);
                  setTimeout(() => {
                    window.removeEventListener('message', messageListener);
                    delete window._unchainedPendingRequests[requestId];
                    reject(new Error('Request timeout'));
                  }, 300000);
                });
              },
              on: (event, listener) => {
                window._unchainedListeners = window._unchainedListeners || {};
                window._unchainedListeners[event] = window._unchainedListeners[event] || [];
                window._unchainedListeners[event].push(listener);
              },
              removeListener: (event, listener) => {
                if (window._unchainedListeners && window._unchainedListeners[event]) {
                  window._unchainedListeners[event] = window._unchainedListeners[event].filter(l => l !== listener);
                }
              },
              removeAllListeners: (event) => {
                if (event) {
                  if (window._unchainedListeners) delete window._unchainedListeners[event];
                } else {
                  window._unchainedListeners = {};
                }
              },
              get chainId() { return '0x1'; },
              get networkVersion() { return '1'; }
            };
            // Try to set window.ethereum...
            // (same pattern as extension injected provider)
          })();
        `;
        iframeDoc.head.insertBefore(inlineScript, iframeDoc.head.firstChild);
        console.log('[Browser] ✅ Provider injected via inline fallback');
      } catch (e) {
        console.error('[Browser] Inline injection failed:', e);
      }
    };
```

**Flow:**

- Defines an EIP‑1193‑like provider:
  - `request({ method, params })` posts a message upward to the parent window.
  - The parent listens for `UNCHAINED_WALLET_REQUEST` and opens `/connect` or `/sign`.
  - When approval is done, the parent posts back `UNCHAINED_WALLET_RESPONSE`, resolving the promise.
- Includes listener management (`on`, `removeListener`, etc.).
- Sets `window.ethereum` if possible, or leaves it on a custom namespace if not.
- Dispatches `ethereum#initialized` so dApps that wait for the event still work.

#### 3.2.2 Ensuring Early Injection

To guarantee the script runs *before* the dApp:

```startLine:endLine:app/browser/page.tsx
    if (iframeDoc.head) {
      if (iframeDoc.head.firstChild) {
        iframeDoc.head.insertBefore(script, iframeDoc.head.firstChild);
      } else {
        iframeDoc.head.appendChild(script);
      }
    } else {
      const observer = new MutationObserver(() => {
        if (iframeDoc.head) {
          iframeDoc.head.insertBefore(script, iframeDoc.head.firstChild);
          observer.disconnect();
        }
      });
      observer.observe(iframeDoc.documentElement, { childList: true });
    }
```

This:

- Inserts the script as **the first child of `<head>`** when possible.  
- If `<head>` isn’t ready yet, uses a `MutationObserver` to wait and then insert.

#### 3.2.3 Event Wiring

`useEffect` connects the injection to iframe lifecycle:

```startLine:endLine:app/browser/page.tsx
// Inject when iframe loads - try multiple times
if (iframeRef.current) {
  const iframe = iframeRef.current;

  const handleLoad = () => {
    injectEthereumProvider();
    setTimeout(injectEthereumProvider, 50);
    setTimeout(injectEthereumProvider, 200);
  };

  iframe.addEventListener('load', handleLoad);

  if (iframe.contentDocument?.readyState === 'complete') {
    handleLoad();
  }

  try {
    if (iframe.contentDocument) {
      iframe.contentDocument.addEventListener('DOMContentLoaded', injectEthereumProvider);
    }
  } catch (e) {
    // cross-origin
  }
}
```

It also listens for `postMessage` from the iframe (`UNCHAINED_STORE_REQUEST` / `UNCHAINED_WALLET_REQUEST`), stores request metadata in `localStorage`, and routes to the PEPU VAULT WALLET approval pages.

---

## 4. Extension Architecture (Manifest v3)

The extension makes PEPU VAULT WALLET behave like a browser‑wide wallet (MetaMask‑style).

### 4.1 Manifest (`extension/manifest.json`)

```startLine:endLine:extension/manifest.json
{
  "manifest_version": 3,
  "name": "PEPU VAULT",
  "version": "1.0.0",
  "description": "You're Identity You're Finance on Pepu L2 - Pepu's First Native wallet",
  "permissions": ["tabs", "storage", "activeTab", "scripting"],
  "optional_host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "icons": { "16": "icon.png", "48": "icon.png", "128": "icon.png" },
  "action": {
    "default_title": "PEPU VAULT",
    "default_popup": "popup.html",
    "default_icon": { "16": "icon.png", "48": "icon.png", "128": "icon.png" }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["contentScript.js"],
      "run_at": "document_start",
      "all_frames": false
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["injectedProvider.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

**Important points:**

- Uses **MV3 service worker** `background.js`.
- `contentScript.js` runs on `<all_urls>` at `document_start` to inject the provider ASAP.
- `injectedProvider.js` is loaded into the page context via `chrome.runtime.getURL`.

### 4.2 Content Script (`extension/contentScript.js`)

Two responsibilities:

1. **Inject the real provider script into the page** so it runs in page context, not the isolated content script world.
2. **Bridge messages between page ↔ background** using `window.postMessage` and `chrome.runtime.sendMessage`.

Provider injection:

```startLine:endLine:extension/contentScript.js
(function () {
  function injectProvider() {
    try {
      if (window.__unchainedProviderInjected) {
        return;
      }

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injectedProvider.js');
      script.async = false;
      (document.head || document.documentElement).prepend(script);
      script.onload = () => {
        script.remove();
        console.log('[Unchained Extension] Provider script injected successfully');
      };
    } catch (e) {
      console.warn('[Unchained Extension] Failed to inject provider script:', e);
    }
  }

  if (document.head || document.documentElement) {
    injectProvider();
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectProvider);
    } else {
      injectProvider();
    }
  }
```

Message bridge:

```startLine:endLine:extension/contentScript.js
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'UNCHAINED_EXTENSION_REQUEST') return;

    chrome.runtime.sendMessage(
      {
        type: 'UNCHAINED_EXTENSION_REQUEST',
        requestId: event.data.requestId,
        method: event.data.method,
        params: event.data.params
      },
      function (response) {
        window.postMessage(
          {
            type: 'UNCHAINED_EXTENSION_RESPONSE',
            requestId: event.data.requestId,
            result: response && response.result,
            error: response && response.error
          },
          '*'
        );
      }
    );
  });
```

### 4.3 Injected Provider (`extension/injectedProvider.js`)

This file defines the **EIP‑1193 provider** that dApps see as `window.ethereum`.

Key features:

- Marks itself as **Unchained**:

```startLine:endLine:extension/injectedProvider.js
const provider = {
  isUnchained: true,
  isMetaMask: true,
  _unchainedMetadata: {
    name: 'Unchained Wallet',
    iconUrl: 'https://pbs.twimg.com/profile_images/1990713242805506049/IL1CQ-9l_400x400.jpg',
  },
```

- Implements `request({ method, params })` with several layers:
  - **Cheap local methods** (`eth_accounts`, `eth_chainId`, `net_version`) return cached values.
  - **RPC passthrough** (e.g. `eth_getBalance`, `eth_call`, `eth_getLogs`) call **PEPU RPC** directly via `fetch(PEPU_RPC_URL, ...)`.
  - **Wallet methods** (`eth_requestAccounts`, signing, `eth_sendTransaction`) send a `UNCHAINED_EXTENSION_REQUEST` message to contentScript:

```startLine:endLine:extension/injectedProvider.js
const requestId = Math.random().toString(36).slice(2);
return new Promise(function (resolve, reject) {
  window.postMessage(
    {
      type: 'UNCHAINED_EXTENSION_REQUEST',
      requestId: requestId,
      method: method,
      params: params
    },
    '*'
  );

  function listener(event) {
    var data = event.data || {};
    if (data.type !== 'UNCHAINED_EXTENSION_RESPONSE' || data.requestId !== requestId) {
      return;
    }
    window.removeEventListener('message', listener);

    if (data.error) {
      reject(new Error(data.error));
    } else {
      // update caches, emit events, etc.
      resolve(data.result);
    }
  }

  window.addEventListener('message', listener);

  setTimeout(function () {
    window.removeEventListener('message', listener);
    reject(new Error('Unchained extension request timeout'));
  }, 5 * 60 * 1000);
});
```

- Provides **event APIs** (`on`, `removeListener`, `removeAllListeners`) and **legacy methods** (`send`, `sendAsync`, `enable`) for compatibility.
- Exposes itself as:
  - `window.unchained`
  - `window.ethereum` (when possible – tries `window.ethereum = provider` or `Object.defineProperty`).
- Dispatches:
  - `ethereum#initialized`
  - `unchained#initialized`
  - `unchainedProviderReady` custom event.

---

### 4.4 Background Service Worker (`extension/background.js`)

Handles **opening PEPU VAULT WALLET UIs** and **returning results**.

Main responsibilities:

1. **Inject contentScript on allowed tabs** when pages finish loading (`tabs.onUpdated`).
2. **Receive wallet requests** from `contentScript` via `chrome.runtime.onMessage`.
3. **Open a popup window** to `/connect` or `/sign` on `WALLET_URL`.
4. **Watch the `/extension-response` route** for results and resolve the original request.

Routing logic:

```startLine:endLine:extension/background.js
chrome.runtime.onMessage.addListener(async function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'UNCHAINED_EXTENSION_REQUEST') {
    return false;
  }

  const requestId = msg.requestId;
  const method = msg.method;
  const params = msg.params || [];
  // derive origin from sender.tab.url ...

  // choose approval page
  if (method === 'eth_requestAccounts') {
    approvalUrl = `${WALLET_URL}/connect?from=extension&requestId=${requestId}&origin=${encodeURIComponent(
      tabUrl || origin
    )}`;
  } else if (method === 'eth_sendTransaction') {
    approvalUrl = `${WALLET_URL}/sign?from=extension&requestId=${requestId}&method=${encodeURIComponent(method)}&params=${encodeURIComponent(JSON.stringify(params))}&origin=${encodeURIComponent(origin)}`;
  } else if ( /* signing methods */ ) {
    approvalUrl = `${WALLET_URL}/sign?...`;
  } else {
    sendResponse({ result: null, error: `Method ${method} not yet supported by extension` });
    return true;
  }
```

Then it opens a popup and listens for `/extension-response`:

```startLine:endLine:extension/background.js
chrome.windows.create(
  {
    url: approvalUrl,
    type: 'popup',
    width: 520,
    height: 760
  },
  function (window) {
    // listen for tabs.onUpdated to see /extension-response?requestId=...
    // parse result / error from query params
    // call sendResponse({ result, error })
    // close window and clean up listeners / timeouts
  }
);
```

---

### 4.5 Popup UI (`extension/popup.html` + `extension/popup.js`)

The popup simply loads an iframe pointing at the PEPU VAULT WALLET, with optional password gating.

- `popup.html` defines a small black card layout with title, subtitle, inputs, and a root `<div id="root">`.
- `popup.js`:
  - Handles hashing the password with `crypto.subtle.digest('SHA‑256')`.
  - Stores the hash in `chrome.storage.local`.
  - Renders either:
    - Password creation card  
    - Unlock card  
    - Or a direct iframe pointing at `WALLET_URL`.

In the current setup, the **final path is:**

```startLine:endLine:extension/popup.js
document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('root');
  if (!root) return;

  // No password required - directly load the wallet iframe
  try {
    renderIframe(root);
  } catch (e) {
    console.error('[PEPU VAULT Extension] Failed to init popup', e);
    renderIframe(root);
  }
});
```

So the popup **always** shows PEPU VAULT WALLET inside an iframe, and the optional password code is in place if you want to re‑enable it.

---

## 5. SDK: Making dApps Prefer PEPU VAULT

The SDK (`sdk/`) is a small TypeScript package that:

- Exports a `WalletSelector` React component (`sdk/components/WalletSelector.tsx`).
- Exposes hooks like `useConnectWallet` for React dApps.
- Detects PEPU VAULT via:

```startLine:endLine:sdk/index.ts
coinbaseWallet({
  appName: 'PEPU VAULT',
  appLogoUrl: typeof window !== 'undefined' ? `${window.location.origin}/pepu-vault-logo.png` : undefined,
})
```

It prefers a provider where `window.ethereum.isUnchained === true` or `window.unchained` is present, falling back to MetaMask / Coinbase when necessary.

---

## 6. Rewards Mechanism (Business Logic)

Rewards are fully described in `REWARDS_MECHANISM.md` and implemented in `lib/rewards.ts` + `app/rewards/page.tsx`.

Key numbers:

- **ERC‑20 transfers & swaps**
  - Fee: **0.85%** of amount
  - Reward: **10% of that fee** in UCHAIN (using on‑chain Quoter)
- **Native PEPU transfers**
  - If value ≥ $1: **$0.05** fee
  - If value < $1: **5%** fee
  - Reward: **$0.005** worth of UCHAIN (fixed)
- **Native PEPU swaps**
  - Fee: **0.85%**
  - Reward: **10% of fee** in UCHAIN using CoinGecko prices.

Rewards accumulate per address; users can claim in the **Rewards** page once they hold at least **1 UCHAIN**.

For exact formulas and examples, see:

```startLine:endLine:REWARDS_MECHANISM.md
# PEPU VAULT WALLET Rewards Mechanism
...
```

---

## 7. Development & Local Setup

- **Install dependencies**

```bash
npm install
```

- **Run dev server**

```bash
npm run dev
```

The web app will start on the default Next.js port (usually `http://localhost:3000`).

- **Build & run production**

```bash
npm run build
npm start
```

---

## 8. Extension Dev Setup

1. Run the web app locally (`npm run dev`) and note the URL (e.g. `http://localhost:3000`).
2. Update `WALLET_URL` in:
   - `extension/background.js`
   - `extension/popup.js`
3. In Chrome:
   - Go to `chrome://extensions`
   - Enable Developer Mode
   - “Load unpacked” → select the `extension/` folder.
4. Open a dApp (e.g. Uniswap) and check `window.ethereum.isUnchained` or try `eth_requestAccounts` to see the PEPU VAULT popup.

---

## 9. Security Model Summary

- **Non‑custodial**: keys only exist in browser memory + encrypted localStorage.
- **No backend**: all signing, encryption, and RPC happen client‑side.
- **Extension**:
  - Injects only a provider shim
  - Does not scrape page content
  - Uses permissions minimally (`tabs`, `storage`, `activeTab`, `scripting`, optional `<all_urls>`).
- **Iframe browser**:
  - Obeys Same Origin Policy and uses a proxy approach only when allowed.
  - Uses `postMessage` and custom events, never evals untrusted code.

You are responsible for **backing up your seed phrase and private keys**. Losing them means permanently losing access to funds.

---

## 10. License

**MIT**
