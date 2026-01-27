"use client"

import { useState, useEffect } from "react"
import { X, Loader, ExternalLink } from "lucide-react"
import { ethers } from "ethers"
import { getProvider } from "@/lib/rpc"
import { fetchGeckoTerminalData, getPepuTokenPriceFromQuoter } from "@/lib/gecko"
import { getWallets } from "@/lib/wallet"

interface TokenDetailsModalProps {
  tokenAddress: string
  tokenSymbol: string
  tokenName: string
  tokenDecimals: number
  isOpen: boolean
  onClose: () => void
  chainId?: number
}

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]

export default function TokenDetailsModal({
  tokenAddress,
  tokenSymbol,
  tokenName,
  tokenDecimals,
  isOpen,
  onClose,
  chainId = 97741,
}: TokenDetailsModalProps) {
  const [loading, setLoading] = useState(true)
  const [totalSupply, setTotalSupply] = useState<string>("")
  const [userBalance, setUserBalance] = useState<string>("")
  const [geckoData, setGeckoData] = useState<any>(null)
  const [blockNumber, setBlockNumber] = useState<number>(0)

  useEffect(() => {
    if (isOpen && (chainId === 97741 || chainId === 1)) {
      loadTokenDetails()
    }
  }, [isOpen, tokenAddress, chainId])

  const loadTokenDetails = async () => {
    if (chainId !== 97741 && chainId !== 1) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const provider = getProvider(chainId)
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)

      const wallets = getWallets()
      const userAddress = wallets.length > 0 ? wallets[0].address : null

      // Determine network for GeckoTerminal
      const network = chainId === 1 ? "ethereum" : "pepe-unchained"

      // Fetch data in parallel
      // For PEPU chain: Get token details from GeckoTerminal, but price from Quoter
      // For ETH chain: Get everything from GeckoTerminal
      const [supply, balance, blockNum, gecko, quoterPrice] = await Promise.all([
        tokenContract.totalSupply().catch(() => ethers.parseUnits("0", tokenDecimals)),
        userAddress
          ? tokenContract.balanceOf(userAddress).catch(() => ethers.parseUnits("0", tokenDecimals))
          : Promise.resolve(ethers.parseUnits("0", tokenDecimals)),
        provider.getBlockNumber().catch(() => 0),
        fetchGeckoTerminalData(tokenAddress, network), // Still get details from GeckoTerminal
        // For PEPU chain ERC20 tokens, get price from Quoter
        chainId === 97741 && tokenAddress !== "0x0000000000000000000000000000000000000000"
          ? getPepuTokenPriceFromQuoter(tokenAddress, tokenDecimals)
          : Promise.resolve(null),
      ])

      setTotalSupply(ethers.formatUnits(supply, tokenDecimals))
      setUserBalance(ethers.formatUnits(balance, tokenDecimals))
      setBlockNumber(blockNum)
      
      // For PEPU chain: Override price from GeckoTerminal with Quoter price
      // But keep other details (market cap, volume, etc.) from GeckoTerminal
      if (gecko && chainId === 97741 && quoterPrice !== null && quoterPrice > 0) {
        // Override price_usd with Quoter price
        gecko.price_usd = quoterPrice.toString()
        console.log(`[TokenDetails] Using Quoter price for ${tokenAddress}: $${quoterPrice}`)
      }
      
      setGeckoData(gecko)
    } catch (error) {
      console.error("Error loading token details:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const isBonded = geckoData && geckoData.price_usd !== null && geckoData.price_usd !== undefined
  const priceUsd = geckoData?.price_usd ? parseFloat(geckoData.price_usd) : null
  const marketCapUsd = geckoData?.market_cap_usd
    ? parseFloat(geckoData.market_cap_usd)
    : geckoData?.fdv_usd
      ? parseFloat(geckoData.fdv_usd)
      : null
  const fdvUsd = geckoData?.fdv_usd ? parseFloat(geckoData.fdv_usd) : null
  const volume24h = geckoData?.volume_usd?.h24 ? parseFloat(geckoData.volume_usd.h24) : null
  const balanceValue = priceUsd && userBalance ? parseFloat(userBalance) * priceUsd : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 glass-card rounded-3xl border border-white/20 overflow-hidden">
        {/* Header */}
        <div className="relative p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {geckoData?.image_url ? (
              <img
                src={geckoData.image_url}
                alt={tokenSymbol}
                className="w-12 h-12 rounded-full"
                onError={(e) => {
                  e.currentTarget.style.display = "none"
                }}
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <span className="font-bold text-green-500 text-lg">{tokenSymbol[0]}</span>
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{tokenName}</h2>
              <p className="text-sm text-gray-400">{tokenSymbol}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-green-500 mb-3" />
              <p className="text-gray-400">Loading token details...</p>
            </div>
          ) : (
            <>
              {/* Contract Address */}
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Contract Address</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-black/30 px-3 py-2 rounded flex-1 break-all">
                    {tokenAddress}
                  </code>
                  <a
                    href={
                      chainId === 1
                        ? `https://etherscan.io/address/${tokenAddress}`
                        : `https://pepuscan.com/address/${tokenAddress}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Bond Status */}
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Bond Status</p>
                <div
                  className={`px-4 py-3 rounded-lg ${
                    isBonded ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"
                  }`}
                >
                  <p className={`font-semibold ${isBonded ? "text-green-400" : "text-red-400"}`}>
                    {isBonded ? "✅ BONDED" : "❌ NOT BONDED"}
                  </p>
                  {!isBonded && (
                    <p className="text-xs text-gray-400 mt-1">No USD price available</p>
                  )}
                </div>
              </div>

              {/* Price Information */}
              {isBonded && priceUsd && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">Price Information</p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Price (USD)</span>
                      <span className="font-bold text-lg">${priceUsd.toFixed(8)}</span>
                    </div>
                    {marketCapUsd && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Market Cap (USD)</span>
                        <span className="font-semibold">
                          ${marketCapUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    {fdvUsd && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">FDV (USD)</span>
                        <span className="font-semibold">
                          ${fdvUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    {volume24h && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">24h Volume (USD)</span>
                        <span className="font-semibold">
                          ${volume24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Token Info */}
              <div className="space-y-4">
                <p className="text-sm text-gray-400">Token Information</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Decimals</span>
                    <span className="font-semibold">{tokenDecimals}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Total Supply</span>
                    <span className="font-semibold">
                      {Number.parseFloat(totalSupply).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {tokenSymbol}
                    </span>
                  </div>
                  {blockNumber > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Current Block</span>
                      <span className="font-semibold">{blockNumber.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* User Balance */}
              {userBalance && Number.parseFloat(userBalance) > 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">Your Balance</p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Balance</span>
                      <span className="font-bold text-lg">
                        {Number.parseFloat(userBalance).toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}{" "}
                        {tokenSymbol}
                      </span>
                    </div>
                    {balanceValue && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Value (USD)</span>
                        <span className="font-semibold text-green-400">
                          ${balanceValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

