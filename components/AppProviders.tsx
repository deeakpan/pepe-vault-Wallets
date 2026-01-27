"use client"

import type React from "react"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Analytics } from "@vercel/analytics/next"
import ProviderInit from "@/components/ProviderInit"
import { wagmiConfig } from "@/lib/wagmi"

const queryClient = new QueryClient()

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ProviderInit />
        {children}
        <Analytics />
      </QueryClientProvider>
    </WagmiProvider>
  )
}


