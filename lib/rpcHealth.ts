// RPC Health Tracking System
// Tracks RPC connection status and provides subscription mechanism for UI updates

export interface RpcHealthStatus {
  isHealthy: boolean
  lastError: string | null
  lastChecked: number
  retryCount: number
}

const healthStatus: Map<number, RpcHealthStatus> = new Map()
const subscribers: Set<(chainId: number, status: RpcHealthStatus) => void> = new Set()

// Initialize health status for chains
function initHealthStatus(chainId: number) {
  if (!healthStatus.has(chainId)) {
    healthStatus.set(chainId, {
      isHealthy: true,
      lastError: null,
      lastChecked: Date.now(),
      retryCount: 0,
    })
  }
}

// Report RPC error
export function reportRpcError(chainId: number, error: string) {
  initHealthStatus(chainId)
  const status = healthStatus.get(chainId)!
  status.isHealthy = false
  status.lastError = error
  status.lastChecked = Date.now()
  status.retryCount++
  
  // Notify subscribers
  subscribers.forEach((callback) => {
    try {
      callback(chainId, status)
    } catch (e) {
      console.error("[RPC Health] Error in subscriber callback:", e)
    }
  })
}

// Report RPC success
export function reportRpcSuccess(chainId: number) {
  initHealthStatus(chainId)
  const status = healthStatus.get(chainId)!
  const wasUnhealthy = !status.isHealthy
  status.isHealthy = true
  status.lastError = null
  status.lastChecked = Date.now()
  status.retryCount = 0
  
  // Only notify if status changed from unhealthy to healthy
  if (wasUnhealthy) {
    subscribers.forEach((callback) => {
      try {
        callback(chainId, status)
      } catch (e) {
        console.error("[RPC Health] Error in subscriber callback:", e)
      }
    })
  }
}

// Get current health status
export function getRpcHealthStatus(chainId: number): RpcHealthStatus {
  initHealthStatus(chainId)
  return healthStatus.get(chainId)!
}

// Subscribe to health status changes
export function subscribeToRpcHealth(
  callback: (chainId: number, status: RpcHealthStatus) => void
): () => void {
  subscribers.add(callback)
  
  // Return unsubscribe function
  return () => {
    subscribers.delete(callback)
  }
}

