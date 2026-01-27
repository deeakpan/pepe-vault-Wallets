"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWalletState } from "@/lib/wallet"
import { ArrowLeft, Home, RefreshCw, Plus, X, Monitor, History, Trash2 } from "lucide-react"
import BottomNav from "@/components/BottomNav"
import Link from "next/link"

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

  useEffect(() => {
    // No password required for browser
    const savedHistory = localStorage.getItem("browser_history")
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory))
    }

    // Inject window.ethereum into iframe - must happen BEFORE dApp code runs
    const injectEthereumProvider = () => {
      if (!iframeRef.current || !currentUrl) return

      try {
        const iframe = iframeRef.current
        const iframeDoc = iframe.contentDocument
        const iframeWindow = iframe.contentWindow

        if (!iframeDoc || !iframeWindow) {
          // Cross-origin iframe - cannot inject directly due to browser security (Same-Origin Policy)
          // The iframe should have been loaded through /proxy?url=... which makes it same-origin
          // If we still can't access it, check if it's actually going through proxy
          const iframeSrc = iframe.src || '';
          if (iframeSrc.includes('/proxy?url=')) {
            console.log('[Browser] Iframe is loaded through proxy - injection should work in proxy page');
          } else {
            console.warn('[Browser] Cross-origin iframe detected but NOT using proxy - window.ethereum will NOT be available');
            console.warn('[Browser] To fix: The URL should be routed through /proxy?url=...');
          }
          return;
        }

        // Check if already injected
        if (iframeWindow.ethereum?.isUnchained) {
          console.log('[Browser] Provider already injected');
          return;
        }

        // Load inject script from our origin - MUST load synchronously before dApp code
        const script = iframeDoc.createElement('script');
        script.src = `${window.location.origin}/unchained-inject.js?t=${Date.now()}`;
        script.async = false; // CRITICAL: Load synchronously to ensure it runs before dApp code
        script.defer = false; // Don't defer - load immediately
        script.setAttribute('data-unchained-inject', 'true');
        
        script.onload = () => {
          console.log('[Browser] ✅ Unchained provider successfully injected into iframe');
        };
        
        script.onerror = () => {
          console.warn('[Browser] Failed to load inject script, using inline fallback');
          // Fallback: inject inline
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
                    console.warn('[Browser] window.ethereum is already defined and non-configurable. Cannot override.');
                  }
                } catch (e) {
                  // If defineProperty fails, try simple assignment
                  try {
                    if (!window.ethereum) {
                      window.ethereum = provider;
                    }
                  } catch (e2) {
                    console.warn('[Browser] Could not set window.ethereum:', e2);
                  }
                }
                window.dispatchEvent(new Event('ethereum#initialized'));
                console.log('[Unchained Wallet] Provider injected (inline fallback)');
              })();
            `;
            iframeDoc.head.insertBefore(inlineScript, iframeDoc.head.firstChild);
            console.log('[Browser] ✅ Provider injected via inline fallback');
          } catch (e) {
            console.error('[Browser] Inline injection failed:', e);
          }
        };
        
        // Insert at the VERY beginning of head to ensure it loads first
        if (iframeDoc.head) {
          if (iframeDoc.head.firstChild) {
            iframeDoc.head.insertBefore(script, iframeDoc.head.firstChild);
          } else {
            iframeDoc.head.appendChild(script);
          }
        } else {
          // If head doesn't exist yet, wait for it
          const observer = new MutationObserver(() => {
            if (iframeDoc.head) {
              iframeDoc.head.insertBefore(script, iframeDoc.head.firstChild);
              observer.disconnect();
            }
          });
          observer.observe(iframeDoc.documentElement, { childList: true });
        }
      } catch (error: any) {
        console.error('[Browser] Injection error:', error);
      }
    };

    // Inject when iframe loads - try multiple times to ensure it happens
    if (iframeRef.current) {
      const iframe = iframeRef.current;
      
      const handleLoad = () => {
        // Try immediately
        injectEthereumProvider();
        // Also try after a short delay in case DOM isn't ready
        setTimeout(injectEthereumProvider, 50);
        setTimeout(injectEthereumProvider, 200);
      };
      
      iframe.addEventListener('load', handleLoad);
      
      // Also try immediately if already loaded
      if (iframe.contentDocument?.readyState === 'complete') {
        handleLoad();
      }
      
      // Also listen for DOMContentLoaded
      try {
        if (iframe.contentDocument) {
          iframe.contentDocument.addEventListener('DOMContentLoaded', injectEthereumProvider);
        }
      } catch (e) {
        // Cross-origin - can't access
      }
    }

    // Listen for messages from iframe
    const handleMessage = async (event: MessageEvent) => {
      // Accept messages from iframe
      if (!iframeRef.current) return;
      
      // Check if message is from our iframe (relaxed check for cross-origin)
      const isFromIframe = event.source === iframeRef.current.contentWindow || 
                          (event.source && (event.source as any).frameElement === iframeRef.current);

      if (event.data.type === 'UNCHAINED_STORE_REQUEST') {
        const { requestId, method, params, origin, iframeUrl } = event.data;
        
        // Store request info for when we return
        localStorage.setItem(`browser_request_${requestId}`, JSON.stringify({
          method,
          params,
          origin,
          iframeUrl,
          timestamp: Date.now()
        }));
        
        // The iframe will redirect the parent window, so we don't need to do anything here
        // The redirect happens in the injected script
      } else if (event.data.type === 'UNCHAINED_WALLET_REQUEST') {
        // Legacy support - redirect to wallet
        const { requestId, method, params, origin } = event.data;
        
        localStorage.setItem(`browser_request_${requestId}`, JSON.stringify({
          method,
          params,
          origin,
          timestamp: Date.now()
        }));
        
        if (method === 'eth_requestAccounts') {
          window.location.href = `${window.location.origin}/connect?origin=${encodeURIComponent(origin)}&method=${encodeURIComponent(method)}&requestId=${requestId}&from=browser`;
        } else if (method === 'eth_sendTransaction' || method === 'eth_sign' || method === 'personal_sign') {
          window.location.href = `${window.location.origin}/sign?method=${encodeURIComponent(method)}&params=${encodeURIComponent(JSON.stringify(params))}&origin=${encodeURIComponent(origin)}&requestId=${requestId}&from=browser`;
        } else {
          window.location.href = `${window.location.origin}/connect?origin=${encodeURIComponent(origin)}&method=${encodeURIComponent(method)}&requestId=${requestId}&from=browser`;
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [router, currentUrl])

  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem("browser_history", JSON.stringify(history.slice(0, 50)))
    }
  }, [history])

  // Check for return from wallet approval and send result to iframe
  useEffect(() => {
    if (!currentUrl || !iframeRef.current) return

    // Check URL params for wallet result
    const urlParams = new URLSearchParams(window.location.search)
    const walletStatus = urlParams.get("wallet_status")
    const requestId = urlParams.get("requestId")

    if (walletStatus === "approved" && requestId) {
      // Get result from localStorage (set by connect/sign page)
      const resultStr = localStorage.getItem(`unchained_result_${requestId}`)
      if (resultStr) {
        try {
          const result = JSON.parse(resultStr)
          
          // Send result to iframe via postMessage
          if (iframeRef.current.contentWindow) {
            try {
              iframeRef.current.contentWindow.postMessage({
                type: "UNCHAINED_WALLET_RESPONSE",
                requestId,
                result: result.accounts || result
              }, "*") // Use * for cross-origin
              
              console.log("[Browser] Sent result to iframe:", requestId)
            } catch (e) {
              console.error("[Browser] Error sending message to iframe:", e)
            }
          }
          
          // Clean up
          localStorage.removeItem(`unchained_result_${requestId}`)
          localStorage.removeItem(`unchained_error_${requestId}`)
          localStorage.removeItem(`browser_request_${requestId}`)
          
          // Clean URL
          const cleanUrl = window.location.pathname + window.location.search
            .replace(/[?&]wallet_status=[^&]*/, '')
            .replace(/[?&]requestId=[^&]*/, '')
            .replace(/^&/, '?')
            .replace(/\?$/, '')
          window.history.replaceState({}, "", cleanUrl || window.location.pathname)
        } catch (e) {
          console.error("[Browser] Error parsing result:", e)
        }
      }
    }
  }, [currentUrl])

  // Hide both header and nav bar when searching
  useEffect(() => {
    if (isSearchFocused || url.length > 0) {
      setShowNavBar(false)
      setShowHeader(false)
    }
  }, [isSearchFocused, url])

  const handleNavigate = (targetUrl: string) => {
    if (!targetUrl.startsWith("http")) {
      targetUrl = "https://" + targetUrl
    }

    // Check if URL is cross-origin (different domain)
    try {
      const targetOrigin = new URL(targetUrl).origin
      const currentOrigin = window.location.origin
      
      // If cross-origin, use proxy to enable injection
      if (targetOrigin !== currentOrigin && !targetUrl.includes('/proxy?')) {
        // Route through proxy for cross-origin URLs
        const proxyUrl = `${currentOrigin}/proxy?url=${encodeURIComponent(targetUrl)}`
        targetUrl = proxyUrl
        console.log('[Browser] Cross-origin detected, routing through proxy:', targetUrl)
      }
    } catch (e) {
      console.error('[Browser] Error checking origin:', e)
    }

    setCurrentUrl(targetUrl)
    setUrl(targetUrl)
    setLoading(true)
    setShowHistory(false)
    setIsSearchFocused(false) // Reset search focus after navigation

    try {
      const urlObj = new URL(targetUrl.includes('/proxy?') ? new URLSearchParams(targetUrl.split('?')[1]).get('url') || targetUrl : targetUrl)
      const newEntry = {
        url: targetUrl.includes('/proxy?') ? new URLSearchParams(targetUrl.split('?')[1]).get('url') || targetUrl : targetUrl,
        title: urlObj.hostname,
        timestamp: Date.now(),
      }
      setHistory((prev) => [newEntry, ...prev.filter((h) => h.url !== newEntry.url)])
    } catch (e) {
      // If URL parsing fails, use original URL
    const newEntry = {
      url: targetUrl,
        title: targetUrl,
      timestamp: Date.now(),
    }
    setHistory((prev) => [newEntry, ...prev.filter((h) => h.url !== targetUrl)])
    }

    setTimeout(() => setLoading(false), 1000)
  }

  const openNewTab = (url: string) => {
    const tabId = Math.random().toString(36).substring(7)
    const newTab = { id: tabId, url, title: url }
    setTabs([...tabs, newTab])
    setActiveTab(tabId)
    handleNavigate(url)
  }

  const closeTab = (tabId: string) => {
    const newTabs = tabs.filter((t) => t.id !== tabId)
    setTabs(newTabs)
    if (activeTab === tabId && newTabs.length > 0) {
      setActiveTab(newTabs[0].id)
      handleNavigate(newTabs[0].url)
    } else if (newTabs.length === 0) {
      setCurrentUrl("")
      setUrl("")
      setIsSearchFocused(false)
      setShowHeader(true)
      setShowNavBar(true)
    }
  }

  const goHome = () => {
    setCurrentUrl("")
    setUrl("")
    setIsSearchFocused(false)
    setShowHeader(true)
    setShowNavBar(true)
  }

  const clearHistory = () => {
    if (confirm("Clear all browser history?")) {
      setHistory([])
      localStorage.removeItem("browser_history")
    }
  }

  const toggleHeader = () => {
    // When clicking screen, show both header and nav bar if they're hidden
    if (!showHeader || !showNavBar) {
      setShowHeader(true)
      setShowNavBar(true)
      setIsSearchFocused(false)
    } else if (currentUrl) {
      // If both are visible and we have a URL, hide them
      setShowHeader(false)
      setShowNavBar(false)
    }
  }

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden">
      {/* Header - Just the search bar, no extra space */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ${
          showHeader ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        {/* Just the search bar - minimal padding */}
        <div className="flex gap-2 items-center px-2 py-1.5 bg-black/80 backdrop-blur-sm">
          {currentUrl && (
            <Link href="/dashboard" className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}
          <div className="flex gap-1 items-center bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 flex-1 min-w-0">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleNavigate(url)
                }
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => {
                setTimeout(() => {
                  if (url.length === 0) {
                    setIsSearchFocused(false)
                  }
                }, 200)
              }}
              placeholder="Enter URL..."
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/60 min-w-0"
            />
            <button 
              onClick={(e) => {
                e.stopPropagation()
                handleNavigate(url)
              }} 
              className="p-1 hover:bg-white/20 rounded transition-colors flex-shrink-0"
            >
              {loading ? <RefreshCw className="w-4 h-4 text-white" /> : <Home className="w-4 h-4 text-white" />}
            </button>
          </div>
          {currentUrl && (
            <button
              onClick={() => setDesktopMode(!desktopMode)}
              className={`p-1.5 rounded transition-colors flex items-center flex-shrink-0 ${
                desktopMode ? "bg-green-500/30 text-green-400" : "hover:bg-white/10 text-white"
              }`}
            >
              <Monitor className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tabs - Only show if there are tabs, minimal space */}
        {tabs.length > 0 && (
          <div className="flex gap-1 overflow-x-auto px-2 pb-1 bg-black/80 backdrop-blur-sm">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                handleNavigate(tab.url)
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs whitespace-nowrap cursor-pointer transition-colors flex-shrink-0 ${
                activeTab === tab.id ? "bg-green-500/30 text-green-400" : "bg-white/10 hover:bg-white/20 text-white"
              }`}
            >
              <span className="truncate max-w-xs">{tab.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className="p-0.5 hover:bg-white/20 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => openNewTab("")}
            className="px-2 py-0.5 rounded text-xs bg-white/10 hover:bg-white/20 flex items-center flex-shrink-0 text-white"
          >
            <Plus className="w-3 h-3" />
          </button>
          {currentUrl && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-2 py-0.5 rounded text-xs bg-white/10 hover:bg-white/20 flex items-center flex-shrink-0 text-white"
            >
              <History className="w-3 h-3" />
            </button>
          )}
        </div>
        )}
      </div>

      {/* Floating Search Bar - Shows when header is hidden */}
      {!showHeader && (
        <div className="fixed top-4 left-4 right-4 z-[60] max-w-2xl mx-auto">
          <div className="flex gap-2 items-center glass-card border border-white/10 rounded-lg px-3 py-2 shadow-2xl">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleNavigate(url)
                }
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => {
                setTimeout(() => {
                  if (url.length === 0) {
                    setIsSearchFocused(false)
                  }
                }, 200)
              }}
              placeholder="Enter URL..."
              className="flex-1 bg-transparent outline-none text-sm"
              onClick={(e) => e.stopPropagation()}
            />
            <button 
              onClick={(e) => {
                e.stopPropagation()
                handleNavigate(url)
              }} 
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Home className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      <div className={`flex-1 w-full overflow-hidden transition-all duration-300 ${!showHeader ? "pt-0" : tabs.length > 0 ? "pt-20" : "pt-12"} ${!showNavBar ? "pb-0" : ""}`}>
        {currentUrl ? (
          <div className="w-full h-full bg-white/5 overflow-hidden relative">
            {/* Clickable areas to show header/nav when hidden - larger areas for easier clicking */}
            {!showHeader && (
              <div 
                className="absolute top-0 left-0 right-0 h-24 z-50"
                onClick={toggleHeader}
                onTouchStart={toggleHeader}
              />
            )}
            {!showNavBar && (
              <div 
                className="absolute bottom-0 left-0 right-0 h-24 z-50"
                onClick={toggleHeader}
                onTouchStart={toggleHeader}
              />
            )}
            {/* Floating button to show UI when hidden */}
            {(!showHeader || !showNavBar) && (
              <button
                onClick={toggleHeader}
                className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[60] glass-card border border-white/20 rounded-full p-3 shadow-2xl hover:bg-white/10 transition-all"
                style={{ pointerEvents: 'auto' }}
              >
                <Monitor className="w-5 h-5 text-white" />
              </button>
            )}
            
            {showHistory && (
              <div className="absolute top-0 left-0 right-0 bg-black border-b border-white/10 z-40 max-h-96 overflow-y-auto">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm">History</h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        clearHistory()
                      }}
                      className="p-1 hover:bg-white/10 rounded text-xs flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear
                    </button>
                  </div>
                  {history.length === 0 ? (
                    <p className="text-xs text-gray-400">No history</p>
                  ) : (
                    <div className="space-y-2">
                      {history.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleNavigate(item.url)
                            setShowHistory(false)
                          }}
                          className="w-full text-left p-2 rounded hover:bg-white/10 transition-colors text-xs"
                        >
                          <p className="font-semibold text-green-400 truncate">{item.title}</p>
                          <p className="text-gray-400 text-xs truncate">{item.url}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <iframe
              key={`${currentUrl}-${desktopMode}`}
              ref={iframeRef}
              src={currentUrl}
              className="w-full h-full border-0 bg-white"
              title="PEPU VAULT Browser"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-presentation allow-pointer-lock"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center max-w-md">
              <h2 className="text-xl font-bold mb-2">Unchained Browser</h2>
              <p className="text-gray-400 text-sm mb-6">Enter a URL in the search bar above to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav - Fixed at bottom, can be hidden */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ${
          showNavBar ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <BottomNav active="browser" />
      </div>
    </div>
  )
}
