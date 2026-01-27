"use client"

/**
 * Proxy page that wraps dApp URLs and injects Unchained Wallet
 * This allows window.ethereum to be available in cross-origin iframes
 */

import { useEffect, useRef, Suspense } from "react"
import { useSearchParams } from "next/navigation"

function ProxyContent() {
  const searchParams = useSearchParams()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const url = searchParams.get("url") || ""

  useEffect(() => {
    if (!url || !iframeRef.current) return

    // Inject our script into the iframe when it loads
    const injectScript = () => {
      try {
        const iframe = iframeRef.current
        if (!iframe?.contentDocument) return

        // Check if already injected
        if (iframe.contentWindow?.ethereum?.isUnchained) {
          console.log("[Proxy] Provider already injected")
          return
        }

        // Load inject script - MUST be synchronous to load before dApp code
        const script = iframe.contentDocument.createElement("script")
        script.src = `${window.location.origin}/unchained-inject.js?t=${Date.now()}`
        script.async = false // CRITICAL: Load synchronously before dApp code
        script.defer = false
        script.setAttribute('data-unchained-inject', 'true')
        script.onload = () => {
          console.log("[Proxy] ✅ Unchained provider injected successfully")
        }
        script.onerror = () => {
          console.error("[Proxy] Failed to load inject script, trying inline fallback")
          // Fallback: inject inline
          try {
            const inlineScript = iframe.contentDocument.createElement("script")
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
                  on: () => {},
                  removeListener: () => {},
                  chainId: '0x1',
                  networkVersion: '1'
                };
                // Try to set window.ethereum, but handle cases where it's already defined
                try {
                  const descriptor = Object.getOwnPropertyDescriptor(window, 'ethereum');
                  if (!descriptor) {
                    // No existing property, safe to define
                    Object.defineProperty(window, 'ethereum', {
                      value: provider,
                      writable: false,
                      configurable: false
                    });
                  } else if (descriptor.configurable) {
                    // Property exists but is configurable, safe to redefine
                    Object.defineProperty(window, 'ethereum', {
                      value: provider,
                      writable: false,
                      configurable: false
                    });
                  } else {
                    // Property exists and is non-configurable, can't override
                    console.warn('[Proxy] window.ethereum is already defined and non-configurable. Cannot override.');
                  }
                } catch (e) {
                  // If defineProperty fails, try simple assignment
                  try {
                    if (!window.ethereum) {
                      window.ethereum = provider;
                    }
                  } catch (e2) {
                    console.warn('[Proxy] Could not set window.ethereum:', e2);
                  }
                }
                window.dispatchEvent(new Event('ethereum#initialized'));
                console.log('[Unchained Wallet] Provider injected (inline fallback in proxy)');
              })();
            `;
            iframe.contentDocument.head.insertBefore(inlineScript, iframe.contentDocument.head.firstChild);
            console.log("[Proxy] ✅ Provider injected via inline fallback");
          } catch (e) {
            console.error("[Proxy] Inline injection also failed:", e);
          }
        }

        // Insert at the beginning of head
        if (iframe.contentDocument.head) {
          if (iframe.contentDocument.head.firstChild) {
            iframe.contentDocument.head.insertBefore(script, iframe.contentDocument.head.firstChild)
          } else {
            iframe.contentDocument.head.appendChild(script)
          }
        }
      } catch (error) {
        console.error("[Proxy] Injection error:", error)
      }
    }

    const iframe = iframeRef.current
    if (iframe) {
      iframe.addEventListener("load", () => {
        setTimeout(injectScript, 100)
      })

      // Also try immediately if already loaded
      if (iframe.contentDocument?.readyState === "complete") {
        setTimeout(injectScript, 100)
      }
    }
  }, [url])

  if (!url) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">No URL provided</p>
      </div>
    )
  }

  return (
    <div className="w-full h-screen">
      <iframe
        ref={iframeRef}
        src={url}
        className="w-full h-full border-0"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        allow="ethereum"
      />
    </div>
  )
}

export default function ProxyPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    }>
      <ProxyContent />
    </Suspense>
  )
}

