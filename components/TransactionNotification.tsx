"use client"

import { useEffect, useState } from "react"
import { CheckCircle, X, ExternalLink } from "lucide-react"

interface TransactionNotificationProps {
  message: string
  txHash?: string
  explorerUrl?: string
  onClose: () => void
  duration?: number // Duration in milliseconds (default: 10000 = 10 seconds)
}

export default function TransactionNotification({
  message,
  txHash,
  explorerUrl,
  onClose,
  duration = 10000,
}: TransactionNotificationProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    // Auto-close after duration
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300) // Wait for fade-out animation
    }, duration)

    // Progress bar animation
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const decrement = (100 / duration) * 50 // Update every 50ms
        return Math.max(0, prev - decrement)
      })
    }, 50)

    return () => {
      clearTimeout(timer)
      clearInterval(progressInterval)
    }
  }, [duration, onClose])

  if (!isVisible) return null

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md mx-4 transition-all duration-300 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      }`}
    >
      <div className="glass-card p-4 border border-green-500/50 bg-gradient-to-r from-green-500/20 to-green-500/10 backdrop-blur-xl shadow-2xl shadow-green-500/20">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-green-500/30 rounded-t-2xl overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-50 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-start gap-3 pt-1">
          {/* Success Icon */}
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-500/30 flex items-center justify-center border border-green-500/50">
            <CheckCircle className="w-6 h-6 text-green-400" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm mb-1">{message}</p>
            {txHash && (
              <p className="text-xs text-gray-400 font-mono truncate mb-2">
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </p>
            )}
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
              >
                View on Explorer
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={() => {
              setIsVisible(false)
              setTimeout(onClose, 300)
            }}
            className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  )
}

