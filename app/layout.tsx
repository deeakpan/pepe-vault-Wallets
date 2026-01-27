import type React from "react"
import type { Metadata } from "next"
import { Geist } from "next/font/google"
import { AppProviders } from "@/components/AppProviders"
import "./globals.css"

const geist = Geist({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "PEPU VAULT",
  description: "Non-custodial PEPU VAULT WALLET for ETH and PEPU",
  icons: {
    icon: [
      { url: "/pepu-vault-logo.png", type: "image/png" },
      { url: "/pepu-vault-logo.png", sizes: "32x32", type: "image/png" },
      { url: "/pepu-vault-logo.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/pepu-vault-logo.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/pepu-vault-logo.png",
  },
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className={`${geist.className} bg-black text-white h-full w-full`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
