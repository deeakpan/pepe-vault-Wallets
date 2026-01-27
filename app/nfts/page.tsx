"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getWallets, getWalletState, updateActivity } from "@/lib/wallet"
import { ImageIcon, Loader } from "lucide-react"
import Link from "next/link"
import BottomNav from "@/components/BottomNav"
import { ethers } from "ethers"

const ERC721_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)",
  "function tokenURI(uint256) view returns (string)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function ownerOf(uint256) view returns (address)",
]

const ERC1155_ABI = [
  "function balanceOf(address, uint256) view returns (uint256)",
  "function uri(uint256) view returns (string)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
]

interface NFT {
  contractAddress: string
  tokenId: string
  name: string
  image?: string
  collectionName: string
  collectionSymbol: string
}

export default function NFTsPage() {
  const router = useRouter()
  const [nfts, setNfts] = useState<NFT[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // No password required for viewing NFTs
    updateActivity()
    fetchPEPUNFTs()
  }, [router])

  const fetchPEPUNFTs = async () => {
    setLoading(true)
    try {
      const wallets = getWallets()
      if (wallets.length === 0) {
        setLoading(false)
        return
      }

      const wallet = wallets[0]
      const provider = new ethers.JsonRpcProvider("https://rpc-pepu-v2-mainnet-0.t.conduit.xyz")
      const allNFTs: NFT[] = []

      // Scan for Transfer events to find NFT collections (ERC721 and ERC1155)
      const erc721TransferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
      const erc1155TransferTopic = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62"
      const currentBlock = await provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - 20000) // Scan last 20000 blocks for better coverage

      const [erc721Logs, erc1155Logs] = await Promise.all([
        provider.getLogs({
          fromBlock,
          toBlock: "latest",
          topics: [erc721TransferTopic, null, ethers.getAddress(wallet.address)],
        }).catch(() => []),
        provider.getLogs({
        fromBlock,
        toBlock: "latest",
          topics: [erc1155TransferTopic, null, ethers.getAddress(wallet.address)],
        }).catch(() => []),
      ])

      const logs = [...erc721Logs, ...erc1155Logs]

      // Extract unique contract addresses (potential NFTs)
      const contractAddresses = [...new Set(logs.map((log) => log.address))]

      for (const contractAddress of contractAddresses) {
        try {
          const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider)

          // Try to get collection info
          let collectionName = "Unknown Collection"
          let collectionSymbol = "NFT"

          try {
            collectionName = await contract.name()
            collectionSymbol = await contract.symbol()
          } catch {
            // Not an ERC721, skip
            continue
          }

          // Get balance
          const balance = await contract.balanceOf(wallet.address)
          const balanceNum = Number(balance)

          // Fetch up to 10 NFTs from this collection
          for (let i = 0; i < Math.min(balanceNum, 10); i++) {
            try {
              const tokenId = await contract.tokenOfOwnerByIndex(wallet.address, i)
              const tokenURI = await contract.tokenURI(tokenId)

              // Parse metadata from tokenURI
              let nftName = `${collectionSymbol} #${tokenId}`
              let image = "/placeholder.svg"

              // Enhanced metadata fetching with multiple IPFS gateways
              if (tokenURI.startsWith("ipfs://")) {
                const ipfsHash = tokenURI.replace("ipfs://", "").replace("ipfs/", "")
                const gateways = [
                  `https://ipfs.io/ipfs/${ipfsHash}`,
                  `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
                  `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
                ]
                
                for (const gatewayUrl of gateways) {
                  try {
                    const response = await fetch(gatewayUrl, { signal: AbortSignal.timeout(5000) })
                    if (response.ok) {
                      const metadata = await response.json()
                  nftName = metadata.name || nftName
                  if (metadata.image) {
                    image = metadata.image.startsWith("ipfs://")
                          ? `https://ipfs.io/ipfs/${metadata.image.replace("ipfs://", "").replace("ipfs/", "")}`
                      : metadata.image
                      }
                      break
                    }
                  } catch (e) {
                    continue
                  }
                }
              } else if (tokenURI.startsWith("http")) {
                try {
                  const response = await fetch(tokenURI, { signal: AbortSignal.timeout(5000) })
                  if (response.ok) {
                    const metadata = await response.json()
                  nftName = metadata.name || nftName
                    if (metadata.image) {
                      image = metadata.image.startsWith("ipfs://")
                        ? `https://ipfs.io/ipfs/${metadata.image.replace("ipfs://", "").replace("ipfs/", "")}`
                        : metadata.image
                    }
                  }
                } catch (e) {
                  console.error("Error fetching metadata:", e)
                }
              } else if (tokenURI.startsWith("data:application/json")) {
                // Handle base64 encoded metadata
                try {
                  const base64Data = tokenURI.split(",")[1]
                  const decoded = JSON.parse(atob(base64Data))
                  nftName = decoded.name || nftName
                  image = decoded.image || image
                } catch (e) {
                  console.error("Error parsing base64 metadata:", e)
                }
              }

              allNFTs.push({
                contractAddress,
                tokenId: tokenId.toString(),
                name: nftName,
                image,
                collectionName,
                collectionSymbol,
              })
            } catch (error) {
              console.error("Error fetching NFT:", error)
            }
          }
        } catch (error) {
          console.error("Error processing contract:", error)
        }
      }

      setNfts(allNFTs)
    } catch (error) {
      console.error("Error fetching NFTs:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Header */}
      <div className="glass-card rounded-none p-6 border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">NFT Gallery</h1>
              <p className="text-sm text-gray-400">Your PEPU Collections</p>
            </div>
          </div>
          <Link href="/dashboard" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            ✕
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 mt-8">
        <p className="text-sm text-gray-400 mb-2">Network</p>
        <button className="px-4 py-2 rounded-lg font-semibold bg-green-500/20 text-green-400 cursor-default mb-6">
          PEPU Only
        </button>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader className="w-8 h-8 animate-spin text-green-500" />
              <p className="text-gray-400">Loading NFTs from blockchain...</p>
            </div>
          </div>
        ) : nfts.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <ImageIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No NFTs Found</h3>
            <p className="text-gray-400 mb-2">No ERC721 NFTs detected on PEPU network</p>
            <p className="text-sm text-gray-500">Your NFTs will appear here once they're detected</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {nfts.map((nft, idx) => (
              <div
                key={`${nft.contractAddress}-${nft.tokenId}-${idx}`}
                className="glass-card overflow-hidden hover:border-green-500/50 transition-all group"
              >
                <div className="relative aspect-square bg-white/5 overflow-hidden">
                  <img
                    src={nft.image || "/placeholder.svg"}
                    alt={nft.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      e.currentTarget.src = "/placeholder.svg"
                    }}
                  />
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-400 mb-1">{nft.collectionName}</p>
                  <h3 className="font-bold mb-2 truncate">{nft.name}</h3>
                  <p className="text-xs text-green-400">ID: {nft.tokenId}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="nfts" />
    </div>
  )
}
