"use client"

import { useState, useEffect } from "react"
import { getRpcHealthStatus, subscribeToRpcHealth } from "@/lib/rpcHealth"
import { getChainName } from "@/lib/rpc"
import { AlertCircle, Loader2 } from "lucide-react"

interface RpcConnectionNotificationProps {
  chainId: number
}

export default function RpcConnectionNotification({ chainId }: RpcConnectionNotificationProps) {
  const [isUnhealthy, setIsUnhealthy] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    // Check initial status
    const status = getRpcHealthStatus(chainId)
    setIsUnhealthy(!status.isHealthy)
    setRetryCount(status.retryCount)

    // Subscribe to health status changes
    const unsubscribe = subscribeToRpcHealth((updatedChainId, updatedStatus) => {
      if (updatedChainId === chainId) {
        setIsUnhealthy(!updatedStatus.isHealthy)
        setRetryCount(updatedStatus.retryCount)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [chainId])

  if (!isUnhealthy) {
    return null
  }

  const chainName = getChainName(chainId)

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4">
      <div className="glass-card p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 flex items-center gap-2">
        <Loader2 className="w-4 h-4 text-yellow-400 animate-spin flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs text-yellow-300 font-medium">
            Having issues connecting to the blockchain but funds are safe
          </p>
        </div>
      </div>
    </div>
  )
}


