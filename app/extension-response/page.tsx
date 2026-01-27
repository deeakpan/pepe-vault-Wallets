"use client"

import { useEffect } from "react"

export default function ExtensionResponsePage() {
  useEffect(() => {
    // This page is just a marker for the extension background script.
    // The background script reads the URL query params and closes the window.
    const timer = setTimeout(() => {
      if (window.opener) {
        window.close()
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Processing...</p>
      </div>
    </div>
  )
}

