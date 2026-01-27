/**
 * WalletConnect Wallet SDK Integration
 * 
 * This module provides a Turbopack-safe implementation of WalletConnect
 * by using dynamic imports to only load the SDK client-side.
 * 
 * NOTE: No type imports from WalletConnect packages to avoid Turbopack
 * analyzing dependencies during SSR. All types are inferred or use `any`.
 */

const projectId = "c4999d9eb922d2b83794b896c6abea5a" // User's provided Project ID

// Use any to avoid type imports that trigger Turbopack analysis
let signClient: any = undefined
let initPromise: Promise<any> | null = null

/**
 * Dynamically imports and initializes the WalletConnect SignClient.
 * This is done client-side only to avoid Turbopack build issues.
 */
async function getWalletConnectClient(): Promise<any> {
  if (signClient) return signClient

  if (initPromise) return initPromise

  if (typeof window === "undefined") {
    throw new Error("WalletConnect can only be initialized client-side")
  }

  initPromise = (async () => {
    // Dynamic import to avoid Turbopack parsing issues
    const { SignClient } = await import("@walletconnect/sign-client")

    // Ensure localStorage is available and valid
    if (typeof window === "undefined" || !window.localStorage) {
      throw new Error("localStorage is not available")
    }

    // Create a safe storage adapter
    const storage = {
      getItem: (key: string) => {
        try {
          return window.localStorage.getItem(key) || null
        } catch (e) {
          console.warn("[WalletConnect] Error getting item:", e)
          return null
        }
      },
      setItem: (key: string, value: string) => {
        try {
          window.localStorage.setItem(key, value)
        } catch (e) {
          console.warn("[WalletConnect] Error setting item:", e)
        }
      },
      removeItem: (key: string) => {
        try {
          window.localStorage.removeItem(key)
        } catch (e) {
          console.warn("[WalletConnect] Error removing item:", e)
        }
      },
    }
    
    signClient = await SignClient.init({
      projectId,
      metadata: {
        name: "PEPU VAULT",
        description: "PEPU VAULT - Non-custodial PEPU VAULT WALLET for ETH and PEPU",
        url: window.location.origin,
        icons: [`${window.location.origin}/pepu-vault-logo.png`],
      },
      storage: storage,
    })

    console.log("[WalletConnect] SignClient initialized:", signClient)
    console.log("[WalletConnect] Restored sessions:", signClient.session.getAll().length)

    // Setup event listeners
    setupWalletConnectEventListeners(signClient)

    return signClient
  })()

  return initPromise
}

function setupWalletConnectEventListeners(client: any) {
  client.on("session_proposal", async (proposal: any) => {
    console.log("[WalletConnect] session_proposal received:", proposal)

    // Store proposal in localStorage for /connect page to pick up
    const proposalKey = `wc_proposal_${proposal.id}`
    localStorage.setItem(proposalKey, JSON.stringify(proposal))
    localStorage.setItem("wc_proposal_id", proposal.id.toString())

    // Only redirect if we're not already on the connect page
    if (!window.location.pathname.includes("/connect")) {
      window.location.href = `/connect?wc_proposal=${proposal.id}`
    }
  })

  client.on("session_request", async (request: any) => {
    console.log("[WalletConnect] session_request received:", request)

    // Store request in localStorage for /sign page to pick up
    const requestKey = `wc_request_${request.id}`
    localStorage.setItem(requestKey, JSON.stringify(request))
    localStorage.setItem("wc_request_id", request.id.toString())

    // Only redirect if we're not already on the sign page
    if (!window.location.pathname.includes("/sign")) {
      window.location.href = `/sign?wc_request=${request.id}`
    }
  })

  client.on("session_delete", ({ id, topic }) => {
    console.log("[WalletConnect] session_delete:", { id, topic })
    // Clean up session data
    const sessions = getStoredSessions()
    const updated = sessions.filter((s) => s.topic !== topic)
    localStorage.setItem("wc_sessions", JSON.stringify(updated))
  })

  client.on("session_event", (event) => {
    console.log("[WalletConnect] session_event:", event)
  })

  client.on("session_update", ({ id, topic, params }) => {
    console.log("[WalletConnect] session_update:", { id, topic, params })
  })
}

/**
 * Get stored WalletConnect sessions from localStorage
 */
export function getStoredSessions(): any[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem("wc_sessions")
  return stored ? JSON.parse(stored) : []
}

/**
 * Store a WalletConnect session
 */
export function storeSession(session: any) {
  if (typeof window === "undefined") return
  const sessions = getStoredSessions()
  const existing = sessions.findIndex((s: any) => s.topic === session.topic)
  if (existing >= 0) {
    sessions[existing] = session
  } else {
    sessions.push(session)
  }
  localStorage.setItem("wc_sessions", JSON.stringify(sessions))
}

/**
 * Get a stored WalletConnect proposal by ID (without removing it)
 */
export function getStoredProposal(id: string, remove: boolean = false): any | null {
  if (typeof window === "undefined") return null
  const key = `wc_proposal_${id}`
  const stored = localStorage.getItem(key)
  if (stored) {
    const proposal = JSON.parse(stored)
    if (remove) {
      localStorage.removeItem(key) // Only remove if explicitly requested
    }
    return proposal
  }
  return null
}

/**
 * Get a stored WalletConnect request by ID
 */
export function getStoredRequest(id: string): any | null {
  if (typeof window === "undefined") return null
  const key = `wc_request_${id}`
  const stored = localStorage.getItem(key)
  if (stored) {
    localStorage.removeItem(key) // Clean up after reading
    return JSON.parse(stored)
  }
  return null
}

/**
 * Approve a WalletConnect session proposal
 */
export async function approveSessionProposal(
  proposalId: number,
  accounts: string[],
  chainId: number = 1
): Promise<void> {
  const client = await getWalletConnectClient()
  
  // Try to get proposal from storage first
  let proposal = getStoredProposal(proposalId.toString(), false)
  
  // If not in storage, try to get it from the client's pending proposals
  if (!proposal) {
    try {
      const pendingProposals = client.session.proposal.getAll()
      proposal = pendingProposals.find((p: any) => p.id === proposalId)
    } catch (e) {
      console.warn("[WalletConnect] Could not get proposal from client:", e)
    }
  }

  if (!proposal) {
    throw new Error(`Proposal ${proposalId} not found`)
  }

  const { id, params } = proposal
  console.log("[WalletConnect] Approving proposal:", { id, params })

  const namespaces: any = {}
  
  // Handle required and optional namespaces
  const requiredNamespaces = params.requiredNamespaces || {}
  const optionalNamespaces = params.optionalNamespaces || {}
  
  // Get EIP155 chains from required and optional
  const eip155Required = requiredNamespaces.eip155 || {}
  const eip155Optional = optionalNamespaces.eip155 || {}
  const requiredChains = eip155Required.chains || []
  const optionalChains = eip155Optional.chains || []
  const allChains = [...requiredChains, ...optionalChains]

  // Support Ethereum mainnet (eip155:1)
  const supportedChains = ["eip155:1"]
  const chains = allChains.filter((chain: string) => supportedChains.includes(chain))

  namespaces.eip155 = {
    accounts: accounts.map((addr: string) => `eip155:${chainId}:${addr}`),
    chains: chains.length > 0 ? chains : ["eip155:1"],
    methods: eip155Required.methods || [
      "eth_sendTransaction",
      "eth_signTransaction",
      "eth_sign",
      "personal_sign",
      "eth_signTypedData",
    ],
    events: eip155Required.events || ["chainChanged", "accountsChanged"],
  }

  try {
    const session = await client.approve({
      id,
      namespaces,
    })

    // Store the approved session
    storeSession(session)
    
    // Remove proposal from storage after successful approval
    getStoredProposal(proposalId.toString(), true)
    
    console.log("[WalletConnect] Session approved successfully:", { id, accounts, chainId, topic: session.topic })
  } catch (error) {
    console.error("[WalletConnect] Error approving session:", error)
    throw error
  }
}

/**
 * Reject a WalletConnect session proposal
 */
export async function rejectSessionProposal(proposalId: number, reason?: string): Promise<void> {
  const client = await getWalletConnectClient()
  const proposal = getStoredProposal(proposalId.toString())

  if (!proposal) {
    throw new Error("Proposal not found")
  }

  // Dynamic import to avoid Turbopack build issues
  const { getSdkError } = await import("@walletconnect/utils")

  await client.reject({
    id: proposal.id,
    reason: reason ? getSdkError(reason as any) : getSdkError("USER_REJECTED"),
  })

  console.log("[WalletConnect] Session rejected:", proposalId)
}

/**
 * Approve a WalletConnect session request (sign transaction/message)
 */
export async function approveSessionRequest(
  requestId: number,
  result: string
): Promise<void> {
  const client = await getWalletConnectClient()
  const request = getStoredRequest(requestId.toString())

  if (!request) {
    throw new Error("Request not found")
  }

  await client.respond({
    topic: request.topic,
    response: {
      id: request.id,
      jsonrpc: "2.0",
      result,
    },
  })

  console.log("[WalletConnect] Request approved:", requestId)
}

/**
 * Reject a WalletConnect session request
 */
export async function rejectSessionRequest(
  requestId: number,
  reason?: string
): Promise<void> {
  const client = await getWalletConnectClient()
  const request = getStoredRequest(requestId.toString())

  if (!request) {
    throw new Error("Request not found")
  }

  // Dynamic import to avoid Turbopack build issues
  const { getSdkError } = await import("@walletconnect/utils")

  await client.respond({
    topic: request.topic,
    response: {
      id: request.id,
      jsonrpc: "2.0",
      error: reason ? getSdkError(reason as any) : getSdkError("USER_REJECTED"),
    },
  })

  console.log("[WalletConnect] Request rejected:", requestId)
}

/**
 * Pair with a WalletConnect URI (deeplink)
 * This allows connecting to dApps via WalletConnect deeplink
 */
export async function pair(uri: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("WalletConnect pairing requires browser environment")
  }

  if (!uri || !uri.startsWith("wc:")) {
    throw new Error("Invalid WalletConnect URI. Must start with 'wc:'")
  }

  try {
    const client = await getWalletConnectClient()
    
    // Pair with the URI
    await client.pair({ uri })
    
    console.log("[WalletConnect] Pairing initiated with URI:", uri.substring(0, 50) + "...")
    
    // The session_proposal event will be triggered automatically
    // and handled by setupWalletConnectEventListeners, which will redirect to /connect
  } catch (error: any) {
    console.error("[WalletConnect] Pairing failed:", error)
    throw new Error(error.message || "Failed to pair with WalletConnect URI")
  }
}

/**
 * Initialize WalletConnect client (called on app startup)
 */
export async function initWalletConnect(): Promise<void> {
  if (typeof window === "undefined") return

  try {
    const client = await getWalletConnectClient()
    console.log("[WalletConnect] Initialization complete. Active sessions:", client.session.getAll().length)
    
    // Log any existing sessions
    const sessions = client.session.getAll()
    if (sessions.length > 0) {
      console.log("[WalletConnect] Restored sessions:", sessions.map((s: any) => ({
        topic: s.topic,
        peer: s.peer.metadata?.name || "Unknown",
      })))
    }
  } catch (error) {
    console.error("[WalletConnect] Failed to initialize:", error)
  }
}

// Export the client getter for advanced usage
export { getWalletConnectClient }

