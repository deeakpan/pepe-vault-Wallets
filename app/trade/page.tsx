"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { ethers } from "ethers"
import { getWallets, getWalletState, updateActivity, getCurrentWallet } from "@/lib/wallet"
import { getSwapQuote, approveToken, executeSwap, checkAllowance } from "@/lib/swap"
import { getNativeBalance, getTokenBalance, getProviderWithFallback, getTokenInfo } from "@/lib/rpc"
import { calculateSwapFee, sendSwapFee } from "@/lib/fees"
import { ArrowDownUp, ChevronDown, Loader, Settings, AlertCircle, CheckCircle2, X } from "lucide-react"
import BottomNav from "@/components/BottomNav"
import TransactionNotification from "@/components/TransactionNotification"

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]

interface Token {
  address: string
  decimals: number
  symbol: string
  name: string
  balance?: string
  isNative?: boolean
}

const PEPU_NATIVE: Token = {
  address: "0x0000000000000000000000000000000000000000",
  decimals: 18,
  symbol: "PEPU",
  name: "Pepe Unchained",
  isNative: true,
}

const TOKENS_API = "https://explorer-pepu-v2-mainnet-0.t.conduit.xyz/api/v2/tokens"

// Fee percentage from the bot code
const FEE_PERCENTAGE = 0.8 // 0.8%

export default function TradePage() {
  const router = useRouter()
  const [fromToken, setFromToken] = useState<Token>(PEPU_NATIVE)
  const [toToken, setToToken] = useState<Token>({
    address: "0xf9cf4a16d26979b929be7176bac4e7084975fcb8",
    decimals: 18,
    symbol: "WPEPU",
    name: "Wrapped PEPU",
  })
  const [amountIn, setAmountIn] = useState("")
  const [amountOut, setAmountOut] = useState("")
  const [password, setPassword] = useState("")
  const [chainId, setChainId] = useState(97741)
  const [loading, setLoading] = useState(false)
  const [quoting, setQuoting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [needsApproval, setNeedsApproval] = useState(false)
  const [allTokens, setAllTokens] = useState<Token[]>([])
  const [tokensWithBalances, setTokensWithBalances] = useState<Map<string, string>>(new Map())
  const [walletAddress, setWalletAddress] = useState<string>("")
  const [loadingTokens, setLoadingTokens] = useState(true)
  const [loadingBalances, setLoadingBalances] = useState(false)
  const [showFromSelector, setShowFromSelector] = useState(false)
  const [showToSelector, setShowToSelector] = useState(false)
  const [slippage, setSlippage] = useState(0.5)
  const [showSlippageSettings, setShowSlippageSettings] = useState(false)
  const [swapFee, setSwapFee] = useState<string>("0")
  const [amountAfterFee, setAmountAfterFee] = useState<string>("")
  const [showNotification, setShowNotification] = useState(false)
  const [notificationData, setNotificationData] = useState<{ message: string; txHash?: string; explorerUrl?: string } | null>(null)
  const [fromSearchCA, setFromSearchCA] = useState("")
  const [toSearchCA, setToSearchCA] = useState("")
  const [searchingCA, setSearchingCA] = useState(false)
  const fromSelectorRef = useRef<HTMLDivElement>(null)
  const toSelectorRef = useRef<HTMLDivElement>(null)

  // Update wallet address when current wallet changes
  useEffect(() => {
    const updateWalletAddress = () => {
      const wallets = getWallets()
      if (wallets.length === 0) {
        router.push("/setup")
        return
      }

      const active = getCurrentWallet() || wallets[0]
      if (active.address !== walletAddress) {
        setWalletAddress(active.address)
      }
    }

    updateWalletAddress()
    const interval = setInterval(updateWalletAddress, 2000)
    return () => clearInterval(interval)
  }, [walletAddress, router])

  // Load initial data and reload when wallet or chain changes
  useEffect(() => {
    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    updateActivity()
    
    const loadData = async () => {
      try {
        const active = getCurrentWallet() || wallets[0]
        const currentAddress = active.address
        setWalletAddress(currentAddress)
        
        const balance = await getNativeBalance(currentAddress, chainId)
        setFromToken((prev) => ({ ...prev, balance }))
      } catch (error) {
        console.error("[Trade] Error loading balance:", error)
      }
    }
    
    loadData()
    loadTokens()
  }, [chainId, router, walletAddress])

  // Scan wallet for all tokens using RPC (Transfer events) - Comprehensive scan
  const scanWalletForTokens = async (address: string, chain: number): Promise<Token[]> => {
    const foundTokens: Token[] = []
    
    try {
      const provider = await getProviderWithFallback(chain)
      
      // Get native balance
      try {
        const nativeBalance = await getNativeBalance(address, chain)
        if (Number.parseFloat(nativeBalance) > 0) {
          foundTokens.push({ ...PEPU_NATIVE, balance: nativeBalance })
        }
      } catch (error) {
        console.error("[Trade] Error getting native balance:", error)
      }
      
      // Scan for ERC20 tokens via Transfer events - scan both TO and FROM the wallet
      const transferTopic = ethers.id("Transfer(address,address,uint256)")
      const currentBlock = await provider.getBlockNumber()
      const lookback = 50000 // Increased to 50,000 blocks for more comprehensive scanning
      const fromBlock = Math.max(0, currentBlock - lookback)
      
      const addressTopic = ethers.zeroPadValue(address, 32)
      const allTokenAddresses = new Set<string>()
      
      try {
        // Scan for tokens received (TO address)
        const receivedLogs = await provider.getLogs({
          fromBlock,
          toBlock: "latest",
          topics: [
            transferTopic,
            null, // from address (any)
            addressTopic, // to address (user's wallet)
          ],
        })
        
        receivedLogs.forEach((log) => {
          allTokenAddresses.add(log.address.toLowerCase())
        })
        
        console.log(`[Trade] Found ${receivedLogs.length} Transfer events TO wallet`)
        
        // Also scan for tokens sent (FROM address) - user might still have balance
        const sentLogs = await provider.getLogs({
          fromBlock,
          toBlock: "latest",
          topics: [
            transferTopic,
            addressTopic, // from address (user's wallet)
            null, // to address (any)
          ],
        })
        
        sentLogs.forEach((log) => {
          allTokenAddresses.add(log.address.toLowerCase())
        })
        
        console.log(`[Trade] Found ${sentLogs.length} Transfer events FROM wallet`)
        console.log(`[Trade] Total unique token addresses found: ${allTokenAddresses.size}`)
        
        // Get token info and balance for each unique token
        const tokenAddressesArray = Array.from(allTokenAddresses)
        for (const tokenAddress of tokenAddressesArray) {
          try {
            // Check balance first - if balance is 0, skip fetching token info
            const balance = await getTokenBalance(tokenAddress, address, chain)
            if (Number.parseFloat(balance) > 0) {
              // Only fetch token info if user has balance
              const tokenInfo = await getTokenInfo(tokenAddress, chain)
              if (tokenInfo) {
                foundTokens.push({
                  address: tokenAddress,
                  decimals: tokenInfo.decimals,
                  symbol: tokenInfo.symbol,
                  name: tokenInfo.name,
                  balance,
                  isNative: false,
                })
                console.log(`[Trade] Found token with balance: ${tokenInfo.symbol} (${tokenAddress}) - Balance: ${balance}`)
              }
            }
          } catch (error) {
            // Skip invalid tokens or tokens we can't query
            continue
          }
        }
      } catch (error) {
        console.error("[Trade] Error scanning Transfer events:", error)
      }
      
      console.log(`[Trade] Scanned wallet: Found ${foundTokens.length} tokens with balance > 0`)
      return foundTokens
    } catch (error) {
      console.error("[Trade] Error scanning wallet for tokens:", error)
      return []
    }
  }

  // Load balances for all tokens (for sorting in dropdown)
  const loadAllTokenBalances = async (address: string, tokens: Token[], chain: number) => {
    if (!address) return
    
    setLoadingBalances(true)
    const balanceMap = new Map<string, string>()
    
    try {
      // Load native PEPU balance first
      try {
        const nativeBalance = await getNativeBalance(address, chain)
        if (Number.parseFloat(nativeBalance) > 0) {
          balanceMap.set(PEPU_NATIVE.address.toLowerCase(), nativeBalance)
        }
      } catch (error) {
        console.error("[Trade] Error loading native balance:", error)
      }
      
      // First, scan wallet for all tokens using RPC
      const walletTokens = await scanWalletForTokens(address, chain)
      
      // Add scanned tokens to balance map - ALL tokens found via RPC
      walletTokens.forEach(token => {
        if (token.balance && Number.parseFloat(token.balance) > 0) {
          balanceMap.set(token.address.toLowerCase(), token.balance)
          console.log(`[Trade] Added RPC token to balance map: ${token.symbol} - ${token.balance}`)
        }
      })
      
      // Also check balances for all tokens (hardcoded + API) to find any we might have missed
      const batchSize = 10
      for (let i = 0; i < tokens.length; i += batchSize) {
        const batch = tokens.slice(i, i + batchSize)
        await Promise.allSettled(
          batch.map(async (token) => {
            if (token.isNative) return // Already loaded above
            
            // Skip if already found in wallet scan
            if (balanceMap.has(token.address.toLowerCase())) return
            
            try {
              const balance = await getTokenBalance(token.address, address, chain)
              if (Number.parseFloat(balance) > 0) {
                balanceMap.set(token.address.toLowerCase(), balance)
              }
            } catch (error) {
              // Silently fail for individual tokens
            }
          })
        )
        
        if (i + batchSize < tokens.length) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }
      
      // Add scanned tokens to allTokens if not already there
      // This ensures ALL tokens found via RPC are available in the dropdown
      // Use a single state update to avoid race conditions
      const tokensToAdd: Token[] = []
      walletTokens.forEach(walletToken => {
        if (!tokens.find(t => t.address.toLowerCase() === walletToken.address.toLowerCase())) {
          tokensToAdd.push(walletToken)
        }
      })
      
      if (tokensToAdd.length > 0) {
        setAllTokens(prev => {
          const existingAddresses = new Set(prev.map(t => t.address.toLowerCase()))
          const newTokens = tokensToAdd.filter(t => !existingAddresses.has(t.address.toLowerCase()))
          if (newTokens.length > 0) {
            console.log(`[Trade] Adding ${newTokens.length} RPC-scanned tokens to allTokens`)
            newTokens.forEach(t => console.log(`  - ${t.symbol} (${t.address})`))
            return [...prev, ...newTokens]
          }
          return prev
        })
      }
      
      console.log(`[Trade] Total tokens with balance: ${balanceMap.size}`)
      console.log(`[Trade] Wallet tokens found: ${walletTokens.length}`)
      setTokensWithBalances(balanceMap)
    } catch (error) {
      console.error("[Trade] Error loading all token balances:", error)
    } finally {
      setLoadingBalances(false)
    }
  }

  const loadTokens = async () => {
    try {
      setLoadingTokens(true)
      const wallets = getWallets()
      if (wallets.length === 0) return

      const active = getCurrentWallet() || wallets[0]
      const currentWalletAddress = active.address
      
      if (currentWalletAddress !== walletAddress) {
        setWalletAddress(currentWalletAddress)
      }

      let allApiTokens: any[] = []
      let apiTokens: Token[] = []
      
      try {
        let nextPageParams: any = null
        let hasMore = true
        let pageCount = 0
        const maxPages = 500

        console.log("[Trade] Starting token fetch from API...")
        
        while (hasMore && pageCount < maxPages) {
          try {
            let url = TOKENS_API
            if (nextPageParams) {
              const params = new URLSearchParams()
              Object.keys(nextPageParams).forEach(key => {
                if (nextPageParams[key] !== null && nextPageParams[key] !== undefined) {
                  params.append(key, nextPageParams[key].toString())
                }
              })
              url = `${TOKENS_API}?${params.toString()}`
            }
            
            const response = await fetch(url, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
              },
            })
            
            if (!response.ok) {
              throw new Error(`API returned ${response.status}`)
            }
            
            const data = await response.json()
            
            if (data.items && Array.isArray(data.items)) {
              allApiTokens = [...allApiTokens, ...data.items]
              console.log(`[Trade] Fetched page ${pageCount + 1}: ${data.items.length} tokens (Total: ${allApiTokens.length})`)
            }

            if (data.next_page_params && Object.keys(data.next_page_params).length > 0) {
              nextPageParams = data.next_page_params
              pageCount++
              await new Promise(resolve => setTimeout(resolve, 100))
            } else {
              hasMore = false
              console.log(`[Trade] Finished fetching tokens. Total: ${allApiTokens.length}`)
            }
          } catch (fetchError) {
            console.warn("[Trade] API fetch error:", fetchError)
            hasMore = false
          }
        }

        apiTokens = allApiTokens
          .filter((item: any) => item.type === "ERC-20" && item.decimals)
          .map((item: any) => ({
            address: (item.address_hash || item.address || "").toLowerCase(),
            decimals: Number.parseInt(item.decimals || "18"),
            symbol: item.symbol || "TOKEN",
            name: item.name || "Unknown Token",
            isNative: false,
          }))
          .filter((token) => token.address && token.address !== "0x0000000000000000000000000000000000000000")
      } catch (apiError) {
        console.warn("[Trade] Failed to fetch tokens from API:", apiError)
      }

      // Hardcoded tokens list - All ERC-20 tokens from PEPU explorer API (48 tokens)
      const hardcodedTokens: Token[] = [
        PEPU_NATIVE,
        {
          address: "0xc824bb59ca79e708c2c74ea5a0c23c0579845725",
          decimals: 18,
          symbol: "CKOM",
          name: "Chimp King Of Meme",
        },
        {
          address: "0xf9cf4a16d26979b929be7176bac4e7084975fcb8",
          decimals: 18,
          symbol: "WPEPU",
          name: "Wrapped PEPU",
        },
        {
          address: "0x99c5f05d0c46ec0e2fc3a58cfd3ea78761fd8ddd",
          decimals: 18,
          symbol: "TT",
          name: "TT",
        },
        {
          address: "0x910c1acdbefc866f2cb2c482e044582e44395152",
          decimals: 18,
          symbol: "Booost",
          name: "Bobby Booost",
        },
        {
          address: "0x82144c93bd531e46f31033fe22d1055af17a514c",
          decimals: 18,
          symbol: "$PENK",
          name: "PEPU BANK",
        },
        {
          address: "0x0b52dfa17542f30f3072c53ca5061120c74d86e9",
          decimals: 18,
          symbol: "TOSH",
          name: "TOSH",
        },
        {
          address: "0xd42fabf08d04d1eb5c69f770c6e049832b69d788",
          decimals: 18,
          symbol: "HoRa",
          name: "HolderRadar",
        },
        {
          address: "0xb7fbb045a14a5d7d6e55dbbf7005ec138eaddde9",
          decimals: 18,
          symbol: "YASH",
          name: "YASHIX",
        },
        {
          address: "0x3cb51202e41890c89b2a46bd5c921e2d55665637",
          decimals: 18,
          symbol: "DGT",
          name: "Degen Time",
        },
        {
          address: "0x434dd2afe3baf277ffcfe9bef9787eda6b4c38d5",
          decimals: 18,
          symbol: "MFG",
          name: "MatrixFrog",
        },
        {
          address: "0x8746d6fc80708775461226657a6947497764bbe6",
          decimals: 18,
          symbol: "$VAULT",
          name: "PEPU VAULT",
        },
        {
          address: "0x10e3a356bcf3aa779cc5ef0be13f2b112fb20e8a",
          decimals: 18,
          symbol: "EAU",
          name: "Eaucooling",
        },
        {
          address: "0xbfa627b2ce0dc7b73717d4cc02ca732c38f24012",
          decimals: 18,
          symbol: "AWF",
          name: "f-caw-f",
        },
        {
          address: "0x421402ffc649d2ba0f2655c42bcde1e7dcc6f3970",
          decimals: 18,
          symbol: "FINPEPE",
          name: "Finnish Pepe",
        },
        {
          address: "0x153b5ae0ff770ebe5c30b1de751d8820b2505774",
          decimals: 18,
          symbol: "DAWGZ",
          name: "D.A.W.G.Z",
        },
        {
          address: "0xf5cb0ffe8df1e931bd8c1cd5be84ed4d8e1400f7",
          decimals: 18,
          symbol: "$LUXURIOUS",
          name: "Big Crypto Bull",
        },
        {
          address: "0xf548a177f50c4be31dcd5762d07aa98c6ecf1d4e",
          decimals: 18,
          symbol: "JONNY",
          name: "Locker Room",
        },
        {
          address: "0xef528d8db1bca0f0f8c63c78f62f692c1e449b94",
          decimals: 18,
          symbol: "PEPP",
          name: "PEPE PUNCH",
        },
        {
          address: "0xe8f1d533ce13463ac4d208568b24d2c5af9b0db7",
          decimals: 18,
          symbol: "BRO",
          name: "Brodo Beats",
        },
        {
          address: "0xf8ad4fcfa809e7d788533107ccba8f917e8375dc",
          decimals: 18,
          symbol: "TRPE",
          name: "TRADER PEPU",
        },
        {
          address: "0x28dd14d951cc1b9ff32bdc27dcc7da04fbfe3af6",
          decimals: 18,
          symbol: "$SPRING",
          name: "Springfield",
        },
        {
          address: "0x20fb684bfc1abaad3acec5712f2aa30bd494df74",
          decimals: 6,
          symbol: "USDC",
          name: "USD Coin",
        },
        {
          address: "0x3e7f421dc6f79a0b9268f6c90ffc54a32cbe10e6",
          decimals: 18,
          symbol: "$ANON",
          name: "$ANON UNCHAINED",
        },
        {
          address: "0x74ded13443829a08eb912f7a7f4f1a0f3906d387",
          decimals: 18,
          symbol: "PLOCK",
          name: "PepuLock",
        },
        {
          address: "0xd2e6a84bed4fd60c3387c7f487d9748f94b35c23",
          decimals: 18,
          symbol: "Zen",
          name: "Zenmonkey",
        },
        {
          address: "0xc2fc08b595d9333fa7d641e526d15c6a37d8d44d",
          decimals: 18,
          symbol: "SafeF",
          name: "Safeyield Falcon SYC",
        },
        {
          address: "0x2e709a0771203c3e7ac6bcc86c38557345e8164c",
          decimals: 18,
          symbol: "VCPEPU",
          name: "VenturePEPU",
        },
        {
          address: "0x473e280563fe023d45e256af977f2cce2d88638c",
          decimals: 18,
          symbol: "BOG",
          name: "BOGLORD",
        },
        {
          address: "0x7ccc51754216c04d4bb1210630cca16e5430aa70",
          decimals: 18,
          symbol: "WETH",
          name: "Wrapped Ether",
        },
        {
          address: "0x5f8974172f353d6c255c89a7b92420d6357622f9",
          decimals: 18,
          symbol: "ToshLove",
          name: "I love Tosh",
        },
        {
          address: "0xa085c13facf80a63edea328b3474543d0bbc0197",
          decimals: 18,
          symbol: "LQS",
          name: "Liquids",
        },
        {
          address: "0x008e4509280c812648409cf4e40a11289c0910aa",
          decimals: 18,
          symbol: "UCHAIN",
          name: "Unchained",
        },
        {
          address: "0x9007d8c13c0f2cd544bd7e6ed7e5f44a1318d2f2",
          decimals: 18,
          symbol: "MMT",
          name: "Market Maker Token",
        },
        {
          address: "0x631420b5cd6342b3609e59e6e41b4c8aaddf93af",
          decimals: 18,
          symbol: "GYD",
          name: "Gameyard",
        },
        {
          address: "0x0ddc98c6f8a8356977770ed8972b7bfd777d40b4",
          decimals: 18,
          symbol: "dSafe",
          name: "Diamond Safeyield CST",
        },
        {
          address: "0x812a4653da823eb06977b87a07a7f8691eb307c3",
          decimals: 18,
          symbol: "PEPEXAI",
          name: "PepeX-AI",
        },
        {
          address: "0xcc4510e0c2276b76c09f493c110f09df60c13192",
          decimals: 18,
          symbol: "HAM",
          name: "Cutest Hammer",
        },
        {
          address: "0x8fe6436498d4ed9560da2c9072ed0ece26045146",
          decimals: 18,
          symbol: "BOBBY",
          name: "LEGENDARY BOBBY!",
        },
        {
          address: "0x06f69a40c33c5a4cd038bbe1da689d4d636ec448",
          decimals: 6,
          symbol: "USDT",
          name: "Tether USD",
        },
        {
          address: "0xdb0976d5edc9bd329d354dabdeae00e4de11c941",
          decimals: 18,
          symbol: "PLINK",
          name: "PEPULink",
        },
        {
          address: "0xa115d9ccbdedd86d47a188e866cf51b51762b0e4",
          decimals: 18,
          symbol: "PepOra",
          name: "PepOra",
        },
        {
          address: "0x901db3533a321e64f3da4468138935ed01e19345",
          decimals: 18,
          symbol: "PSTARS",
          name: "PepuStars",
        },
        {
          address: "0xca795797e1b38318e6fc1173975e146355fdae80",
          decimals: 18,
          symbol: "NONZ",
          name: "TestTokenbyHoRa",
        },
        {
          address: "0x7c533c1d9b054f18f85413d2a113e84f921cf7b6",
          decimals: 18,
          symbol: "PREDICTX",
          name: "PREDICT X",
        },
        {
          address: "0x1c1bd105e03129a5909e935aaf4a77f21285148d",
          decimals: 18,
          symbol: "EDGE",
          name: "SilverEdge",
        },
        {
          address: "0x59ffa32152303cf8cc75e5630eb57ab3e1f2804e",
          decimals: 18,
          symbol: "JARS",
          name: "Monkey Jars",
        },
        {
          address: "0x9592be924a69f88ef9c2b26d9d649fe19c6771d4",
          decimals: 18,
          symbol: "ULAB",
          name: "Unchained Lab",
        },
      ]

      // Combine hardcoded tokens with API tokens (avoid duplicates)
      const allTokensMap = new Map<string, Token>()
      
      // First, add hardcoded tokens (these should always be available)
      hardcodedTokens.forEach(token => {
        allTokensMap.set(token.address.toLowerCase(), token)
      })
      
      // Then, add API tokens (these may fail, but hardcoded tokens should still work)
      apiTokens.forEach(token => {
        if (!allTokensMap.has(token.address.toLowerCase())) {
          allTokensMap.set(token.address.toLowerCase(), token)
        }
      })
      
      const tokens: Token[] = Array.from(allTokensMap.values())
      
      console.log(`[Trade] Total tokens loaded: ${tokens.length} (Hardcoded: ${hardcodedTokens.length}, API: ${apiTokens.length})`)

      // Always set tokens, even if API fails - hardcoded tokens should work
      setAllTokens(tokens)
      
      if (currentWalletAddress) {
        loadAllTokenBalances(currentWalletAddress, tokens, chainId)
      }
    } catch (error) {
      console.error("[Trade] Error loading tokens:", error)
    } finally {
      setLoadingTokens(false)
    }
  }

  // Load balances when tokens or wallet changes
  useEffect(() => {
    const loadBalances = async () => {
      const wallets = getWallets()
      if (wallets.length === 0) return
      
      const active = getCurrentWallet() || wallets[0]
      const currentWalletAddress = active.address
      
      if (currentWalletAddress !== walletAddress) {
        setWalletAddress(currentWalletAddress)
      }

      try {
        if (fromToken.isNative) {
          const balance = await getNativeBalance(currentWalletAddress, chainId)
          setFromToken((prev) => ({ ...prev, balance }))
        } else {
          const balance = await getTokenBalance(fromToken.address, currentWalletAddress, chainId)
          setFromToken((prev) => ({ ...prev, balance }))
        }

        if (toToken.isNative) {
          const balance = await getNativeBalance(currentWalletAddress, chainId)
          setToToken((prev) => ({ ...prev, balance }))
        } else {
          const balance = await getTokenBalance(toToken.address, currentWalletAddress, chainId)
          setToToken((prev) => ({ ...prev, balance }))
        }
      } catch (error) {
        console.error("[Trade] Error loading balances:", error)
      }
    }

    loadBalances()
  }, [fromToken.address, toToken.address, walletAddress, chainId])

  // Fetch quote when amount changes
  useEffect(() => {
    const fetchQuote = async () => {
      if (!amountIn || Number.parseFloat(amountIn) === 0) {
        setAmountOut("")
        setSwapFee("0")
        setAmountAfterFee("")
        return
      }

      try {
        setQuoting(true)
        setError("")

        // Swap full amount (no fee deducted from input)
        const quote = await getSwapQuote(
          fromToken,
          toToken,
          amountIn,
          chainId
        )

        setAmountOut(quote)
        
        // Calculate fee from output amount (0.8% of received tokens)
        const feeAmount = (Number.parseFloat(quote) * FEE_PERCENTAGE) / 100
        setSwapFee(feeAmount.toFixed(6))
        setAmountAfterFee(amountIn) // No fee deducted from input
      } catch (error: any) {
        console.error("[Trade] Quote error:", error)
        setError(error.message || "Failed to get quote")
        setAmountOut("")
        setSwapFee("0")
      } finally {
        setQuoting(false)
      }
    }

    const timeoutId = setTimeout(fetchQuote, 500)
    return () => clearTimeout(timeoutId)
  }, [amountIn, fromToken, toToken, chainId])

  // Check allowance - always use current wallet
  useEffect(() => {
    const checkTokenAllowance = async () => {
      const wallets = getWallets()
      if (wallets.length === 0) {
        setNeedsApproval(false)
        return
      }
      
      const active = getCurrentWallet() || wallets[0]
      const currentWalletAddress = active.address
      
      if (!fromToken.isNative && amountIn && Number.parseFloat(amountIn) > 0) {
        try {
          const allowance = await checkAllowance(
            fromToken.address,
            currentWalletAddress,
            "0x150c3F0f16C3D9EB34351d7af9c961FeDc97A0fb",
            amountAfterFee || amountIn,
            fromToken.decimals,
            chainId
          )
          setNeedsApproval(allowance.needsApproval)
        } catch (error) {
          console.error("[Trade] Error checking allowance:", error)
        }
      } else {
        setNeedsApproval(false)
      }
    }

    checkTokenAllowance()
  }, [fromToken, amountIn, amountAfterFee, walletAddress, chainId])

  const handleSwap = async () => {
    if (!amountIn || Number.parseFloat(amountIn) === 0) {
      setError("Please enter an amount")
      return
    }

    if (!amountOut || Number.parseFloat(amountOut) === 0) {
      setError("Please wait for quote to load")
      return
    }

    const wallets = getWallets()
    if (wallets.length === 0) {
      router.push("/setup")
      return
    }

    const active = getCurrentWallet() || wallets[0]
    const currentWalletAddress = active.address
    
    if (currentWalletAddress !== walletAddress) {
      setWalletAddress(currentWalletAddress)
    }

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      // Check balance BEFORE executing swap (fee is collected AFTER swap in output token)
      if (fromToken.isNative) {
        // For native token, check we have enough for: swap amount + gas
        const provider = await getProviderWithFallback(chainId)
        const balance = await provider.getBalance(currentWalletAddress)
        const swapAmountWei = ethers.parseEther(amountIn)
        
        // Estimate gas (conservative estimate)
        const feeData = await provider.getFeeData()
        const estimatedGas = BigInt(500000)
        const gasCost = estimatedGas * (feeData.gasPrice || BigInt(0))
        
        const totalNeeded = swapAmountWei + gasCost
        
        if (balance < totalNeeded) {
          const balanceFormatted = ethers.formatEther(balance)
          const totalNeededFormatted = ethers.formatEther(totalNeeded)
          const swapFormatted = ethers.formatEther(swapAmountWei)
          const gasFormatted = ethers.formatEther(gasCost)
          
          throw new Error(
            `Insufficient balance. You have ${Number.parseFloat(balanceFormatted).toFixed(6)} PEPU. ` +
            `You need ${Number.parseFloat(swapFormatted).toFixed(6)} PEPU for swap and ` +
            `~${Number.parseFloat(gasFormatted).toFixed(6)} PEPU for gas ` +
            `(total: ${Number.parseFloat(totalNeededFormatted).toFixed(6)} PEPU).`
          )
        }
      } else {
        // For ERC20 tokens, check we have enough tokens for swap
        const tokenBalance = await getTokenBalance(fromToken.address, currentWalletAddress, chainId)
        
        if (Number.parseFloat(tokenBalance) < Number.parseFloat(amountIn)) {
          throw new Error(
            `Insufficient ${fromToken.symbol} balance. You have ${Number.parseFloat(tokenBalance).toFixed(6)} ${fromToken.symbol}, ` +
            `but need ${Number.parseFloat(amountIn).toFixed(6)} ${fromToken.symbol} for the swap.`
          )
        }
        
        // Also check we have enough native token for gas
        const provider = await getProviderWithFallback(chainId)
        const nativeBalance = await provider.getBalance(currentWalletAddress)
        const feeData = await provider.getFeeData()
        const estimatedGas = BigInt(500000)
        const gasCost = estimatedGas * (feeData.gasPrice || BigInt(0))
        
        if (nativeBalance < gasCost) {
          const gasFormatted = ethers.formatEther(gasCost)
          throw new Error(
            `Insufficient PEPU for gas fees. You need at least ${Number.parseFloat(gasFormatted).toFixed(6)} PEPU for gas.`
          )
        }
      }

      if (needsApproval && !fromToken.isNative) {
        try {
          await approveToken(
            fromToken.address,
            active,
            null, // Pass null to use session password automatically
            amountIn, // Full amount (no fee deducted)
            fromToken.decimals,
            chainId
          )
        } catch (approvalError: any) {
          throw new Error(`Approval failed: ${approvalError.message}`)
        }
      }

      // Execute swap with full input amount (no fee deducted)
      const txHash = await executeSwap(
        fromToken,
        toToken,
        amountIn, // Full amount
        amountOut,
        active,
        null, // Pass null to use session password automatically
        slippage,
        chainId
      )

      // Collect fee AFTER swap in the OUTPUT token (received token)
      try {
        // Calculate fee from output amount (0.8% of received tokens)
        const feeAmount = (Number.parseFloat(amountOut) * FEE_PERCENTAGE) / 100
        
        if (feeAmount > 0) {
          await sendSwapFee(
            active,
            null, // Pass null to use session password automatically
            toToken.address, // Fee collected in OUTPUT token
            feeAmount.toFixed(6),
            toToken.decimals,
            chainId
          )
        }
      } catch (feeError: any) {
        console.error("[Trade] Fee collection failed:", feeError)
        // Don't fail the swap if fee collection fails - just log it
      }

      setSuccess("Swap executed successfully!")
      setShowNotification(true)
      setNotificationData({
        message: "Swap executed successfully!",
        txHash,
        explorerUrl: `https://pepuscan.com/tx/${txHash}`,
      })

      setAmountIn("")
      setAmountOut("")
      setSwapFee("0")
      setAmountAfterFee("")

      if (fromToken.isNative) {
        const balance = await getNativeBalance(currentWalletAddress, chainId)
        setFromToken((prev) => ({ ...prev, balance }))
      } else {
        const balance = await getTokenBalance(fromToken.address, currentWalletAddress, chainId)
        setFromToken((prev) => ({ ...prev, balance }))
      }

      if (toToken.isNative) {
        const balance = await getNativeBalance(currentWalletAddress, chainId)
        setToToken((prev) => ({ ...prev, balance }))
      } else {
        const balance = await getTokenBalance(toToken.address, currentWalletAddress, chainId)
        setToToken((prev) => ({ ...prev, balance }))
      }
      
      if (allTokens.length > 0) {
        loadAllTokenBalances(currentWalletAddress, allTokens, chainId)
      }
    } catch (error: any) {
      console.error("[Trade] Swap error:", error)
      setError(error.message || "Swap failed")
    } finally {
      setLoading(false)
    }
  }

  const switchTokens = () => {
    const temp = fromToken
    setFromToken(toToken)
    setToToken(temp)
    setAmountIn("")
    setAmountOut("")
  }

  const setMaxAmount = async () => {
    const wallets = getWallets()
    if (wallets.length === 0) return
    
    const active = getCurrentWallet() || wallets[0]
    const currentWalletAddress = active.address
    
    try {
      let balance: string
      if (fromToken.isNative) {
        balance = await getNativeBalance(currentWalletAddress, chainId)
      } else {
        balance = await getTokenBalance(fromToken.address, currentWalletAddress, chainId)
      }
      
      setFromToken((prev) => ({ ...prev, balance }))
      setAmountIn(balance)
    } catch (error) {
      console.error("[Trade] Error getting max amount:", error)
      if (fromToken.balance) {
        setAmountIn(fromToken.balance)
      }
    }
  }

  // Search token by contract address
  const searchTokenByCA = async (ca: string, isFromToken: boolean) => {
    if (!ca || !ethers.isAddress(ca)) {
      if (ca && ca.length > 0) {
        setError("Invalid contract address format")
      }
      return null
    }

    setSearchingCA(true)
    setError("")
    try {
      // Check if token already exists in allTokens
      const existingToken = allTokens.find(t => t.address.toLowerCase() === ca.toLowerCase())
      if (existingToken) {
        setSearchingCA(false)
        return existingToken
      }

      // Fetch token info from RPC
      const tokenInfo = await getTokenInfo(ca.toLowerCase(), chainId)
      if (tokenInfo) {
        const newToken: Token = {
          address: ca.toLowerCase(),
          decimals: tokenInfo.decimals,
          symbol: tokenInfo.symbol,
          name: tokenInfo.name,
          isNative: false,
        }
        
        // Add to allTokens if not already there
        setAllTokens(prev => {
          if (!prev.find(t => t.address.toLowerCase() === ca.toLowerCase())) {
            return [...prev, newToken]
          }
          return prev
        })
        
        // Load balance for the new token
        if (walletAddress) {
          try {
            const balance = await getTokenBalance(newToken.address, walletAddress, chainId)
            newToken.balance = balance
            if (Number.parseFloat(balance) > 0) {
              setTokensWithBalances(prev => {
                const updated = new Map(prev)
                updated.set(newToken.address.toLowerCase(), balance)
                return updated
              })
            }
          } catch (error) {
            console.error("[Trade] Error loading balance for searched token:", error)
          }
        }
        
        setSearchingCA(false)
        return newToken
      }
      setSearchingCA(false)
      setError("Token not found. Please verify the contract address.")
      return null
    } catch (error) {
      console.error("[Trade] Error searching token by CA:", error)
      setError("Failed to fetch token info. Please check the contract address.")
      setSearchingCA(false)
      return null
    }
  }

      // Auto-search when valid CA is entered in "You pay" dropdown
  useEffect(() => {
    if (!fromSearchCA || !showFromSelector || searchingCA) return
    
    const ca = fromSearchCA.trim()
    // Auto-search when address is complete (42 chars) and valid - fetch from RPC
    if (ca.length === 42 && ethers.isAddress(ca)) {
      const timer = setTimeout(async () => {
        console.log(`[Trade] Auto-searching token by CA in "You pay": ${ca}`)
        const token = await searchTokenByCA(ca, true)
        if (token) {
          console.log(`[Trade] Token found via RPC: ${token.symbol} (${token.name})`)
          // Token is now in allTokens list and will appear in filtered results
        }
      }, 800) // Debounce 800ms after user stops typing
      
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromSearchCA, showFromSelector, searchingCA])

  // Auto-search when valid CA is entered in "You receive" dropdown
  useEffect(() => {
    if (!toSearchCA || !showToSelector || searchingCA) return
    
    const ca = toSearchCA.trim()
    // Auto-search when address is complete (42 chars) and valid - fetch from RPC
    if (ca.length === 42 && ethers.isAddress(ca)) {
      const timer = setTimeout(async () => {
        console.log(`[Trade] Auto-searching token by CA in "You receive": ${ca}`)
        const token = await searchTokenByCA(ca, false)
        if (token) {
          console.log(`[Trade] Token found via RPC: ${token.symbol} (${token.name})`)
          // Token is now in allTokens list and will appear in filtered results
        }
      }, 800) // Debounce 800ms after user stops typing
      
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toSearchCA, showToSelector, searchingCA])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fromSelectorRef.current && !fromSelectorRef.current.contains(event.target as Node)) {
        setShowFromSelector(false)
      }
      if (toSelectorRef.current && !toSelectorRef.current.contains(event.target as Node)) {
        setShowToSelector(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Sort tokens: tokens with balance first
  const sortTokens = (tokens: Token[]): Token[] => {
    return [...tokens].sort((a, b) => {
      const aBalance = tokensWithBalances.get(a.address.toLowerCase()) || "0"
      const bBalance = tokensWithBalances.get(b.address.toLowerCase()) || "0"
      const aHasBalance = Number.parseFloat(aBalance) > 0
      const bHasBalance = Number.parseFloat(bBalance) > 0
      
      if (aHasBalance && !bHasBalance) return -1
      if (!aHasBalance && bHasBalance) return 1
      return 0
    })
  }

  // For "You pay" dropdown: Show ALL tokens user holds (balance > 0) from RPC scanning
  // Build list directly from tokensWithBalances to ensure we show ALL tokens with balance
  const fromTokenList = (() => {
    const tokensWithBalance: Token[] = []
    
    // Build a map of all tokens by address for quick lookup
    const tokenMap = new Map<string, Token>()
    allTokens.forEach(token => {
      tokenMap.set(token.address.toLowerCase(), token)
    })
    
    // Get all tokens that have balance > 0
    tokensWithBalances.forEach((balance, address) => {
      if (Number.parseFloat(balance) > 0) {
        const token = tokenMap.get(address.toLowerCase())
        if (token) {
          // Token exists in allTokens, use it
          tokensWithBalance.push({ ...token, balance })
        } else {
          // Token has balance but not in allTokens yet - this happens when RPC scanning finds tokens
          // Create a temporary token entry - it will be updated when token info is fetched
          tokensWithBalance.push({
            address: address,
            decimals: 18, // Default, will be updated when token info is fetched
            symbol: address.slice(0, 6) + "..." + address.slice(-4), // Temporary display
            name: "Loading...",
            balance,
            isNative: address.toLowerCase() === PEPU_NATIVE.address.toLowerCase(),
          })
        }
      }
    })
    
    return sortTokens(tokensWithBalance)
  })()

  // For "You receive" dropdown: Show all tokens (hardcoded + API)
  const toTokenList = sortTokens(allTokens)

  /* ── token avatar helper ── */
  const TAvatar = ({ symbol, size = 38 }: { symbol: string; size?: number }) => {
    const palette = [["#00ff88","#00cc6a"],["#3b82f6","#2563eb"],["#8b5cf6","#7c3aed"],["#f59e0b","#d97706"],["#ec4899","#db2777"]]
    const [a, b] = palette[(symbol.charCodeAt(0) || 0) % palette.length]
    return (
      <div className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
        style={{ width: size, height: size, background: `linear-gradient(135deg,${a},${b})`, fontSize: size * 0.36, color: "#fff" }}>
        {(symbol[0] || "?").toUpperCase()}
      </div>
    )
  }

  /* ── token list modal ── */
  const TokenModal = ({
    title, searchVal, onSearch, onClose, tokenList, onSelect, isFrom
  }: {
    title: string; searchVal: string; onSearch: (v: string) => void; onClose: () => void
    tokenList: Token[]; onSelect: (t: Token) => void; isFrom: boolean
  }) => (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div
        className="w-full max-w-lg flex flex-col rounded-3xl animate-modal-center"
        style={{ background: "#181b29", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "85vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 className="font-bold text-base">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* search */}
        <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <input
            type="text"
            placeholder="Search name, symbol or paste contract address…"
            value={searchVal}
            onChange={e => onSearch(e.target.value.trim())}
            className="input-field text-sm"
            autoFocus
          />
          {searchVal && !ethers.isAddress(searchVal) && searchVal.length > 6 && (
            <p className="text-xs mt-1" style={{ color: "#ef4444" }}>Enter full contract address to search by CA</p>
          )}
        </div>
        {/* list */}
        <div className="flex-1 overflow-y-auto p-2">
          {(searchingCA || loadingTokens) && (
            <div className="flex flex-col items-center py-10 gap-2">
              <Loader className="w-5 h-5 animate-spin" style={{ color: "#00ff88" }} />
              <p className="text-sm" style={{ color: "#6b7280" }}>
                {searchingCA ? "Fetching from blockchain…" : "Loading tokens…"}
              </p>
            </div>
          )}
          {!loadingTokens && !searchingCA && tokenList.length === 0 && (
            <div className="text-center py-10">
              <p className="text-sm" style={{ color: "#6b7280" }}>No tokens found</p>
            </div>
          )}
          {!loadingTokens && !searchingCA && tokenList.map(token => {
            const bal = tokensWithBalances.get(token.address.toLowerCase()) || token.balance || "0"
            const hasBal = Number.parseFloat(bal) > 0
            return (
              <button key={token.address} onClick={() => { onSelect(token); onClose() }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left"
                style={{ marginBottom: 2, background: hasBal ? "rgba(0,255,136,0.04)" : "transparent" }}
              >
                <TAvatar symbol={token.symbol} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{token.symbol}</p>
                  <p className="text-xs truncate" style={{ color: "#6b7280" }}>{token.name}</p>
                </div>
                {hasBal && (
                  <span className="text-sm font-semibold flex-shrink-0" style={{ color: "#00ff88" }}>
                    {Number.parseFloat(bal).toFixed(4)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen pb-28 text-white" style={{ background: "#13141a" }}>

      {/* ── Header ── */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-5 py-4"
        style={{ background: "rgba(19,20,26,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,255,136,0.12)" }}>
            <ArrowDownUp className="w-4 h-4" style={{ color: "#00ff88" }} />
          </div>
          <div>
            <h1 className="text-base font-bold">Swap</h1>
            <p className="text-xs" style={{ color: "#6b7280" }}>PEPU Chain DEX</p>
          </div>
        </div>
        <button
          onClick={() => setShowSlippageSettings(!showSlippageSettings)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
          style={{
            background: showSlippageSettings ? "rgba(0,255,136,0.12)" : "rgba(255,255,255,0.14)",
            border: `1px solid ${showSlippageSettings ? "rgba(0,255,136,0.3)" : "rgba(255,255,255,0.22)"}`,
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            color: showSlippageSettings ? "#00ff88" : "#9ca3af",
          }}
        >
          <Settings className="w-3.5 h-3.5" />
          {slippage}% slippage
        </button>
      </div>

      <div className="w-full px-4 sm:px-6 pt-5 space-y-3">

        {/* ── Slippage panel ── */}
        {showSlippageSettings && (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Slippage Tolerance</p>
              <button onClick={() => setShowSlippageSettings(false)}>
                <X className="w-4 h-4" style={{ color: "#6b7280" }} />
              </button>
            </div>
            <div className="flex gap-2">
              {[0.1, 0.5, 1.0, 3.0].map(v => (
                <button key={v} onClick={() => setSlippage(v)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={slippage === v
                    ? { background: "rgba(0,255,136,0.15)", border: "1px solid rgba(0,255,136,0.3)", color: "#00ff88" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280" }}>
                  {v}%
                </button>
              ))}
            </div>
            <input type="number" value={slippage} onChange={e => setSlippage(Number.parseFloat(e.target.value) || 0)}
              placeholder="Custom %" step="0.1" min="0" max="50" className="input-field text-sm" />
          </div>
        )}

        {/* ── Swap card ── */}
        <div className="rounded-3xl overflow-hidden" style={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.08)" }}>

          {/* FROM */}
          <div className="p-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold" style={{ color: "#6b7280" }}>You Pay</span>
              {fromToken.balance && (
                <button onClick={setMaxAmount} className="text-xs font-semibold" style={{ color: "#00ff88" }}>
                  Max: {Number.parseFloat(fromToken.balance).toFixed(4)}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input type="number" value={amountIn} onChange={e => setAmountIn(e.target.value)}
                placeholder="0.00" step="0.0001"
                className="flex-1 bg-transparent text-3xl font-bold outline-none min-w-0"
                style={{ color: "#fff" }} />
              <button
                onClick={() => setShowFromSelector(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <TAvatar symbol={fromToken.symbol} size={28} />
                <span className="text-sm font-bold">{fromToken.symbol}</span>
                <ChevronDown className="w-3.5 h-3.5" style={{ color: "#6b7280" }} />
              </button>
            </div>

            {/* FROM modal */}
            {showFromSelector && (
              <TokenModal
                title="Select token to pay"
                searchVal={fromSearchCA}
                onSearch={v => setFromSearchCA(v)}
                onClose={() => { setShowFromSelector(false); setFromSearchCA("") }}
                tokenList={fromTokenList.filter(t => {
                  if (!fromSearchCA) return true
                  const s = fromSearchCA.toLowerCase()
                  return t.address.toLowerCase().includes(s) || t.symbol.toLowerCase().includes(s) || t.name.toLowerCase().includes(s)
                })}
                onSelect={t => { const bal = tokensWithBalances.get(t.address.toLowerCase()) || "0"; setFromToken({ ...t, balance: bal }); setAmountIn(""); setAmountOut("") }}
                isFrom={true}
              />
            )}
          </div>

          {/* ── Switch tokens button ── */}
          <div className="flex items-center justify-center py-1 relative z-10">
            <button
              onClick={switchTokens}
              className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all active:scale-90"
              style={{ background: "#13141a", border: "2px solid rgba(255,255,255,0.1)" }}
            >
              <ArrowDownUp className="w-4 h-4" style={{ color: "#00ff88" }} />
            </button>
          </div>

          {/* ── TO section ── */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold" style={{ color: "#6b7280" }}>You Receive</span>
              {toToken.balance && Number.parseFloat(toToken.balance) > 0 && (
                <span className="text-xs font-medium" style={{ color: "#6b7280" }}>
                  Balance: {Number.parseFloat(toToken.balance).toFixed(4)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                {quoting ? (
                  <div className="flex items-center gap-2">
                    <Loader className="w-5 h-5 animate-spin flex-shrink-0" style={{ color: "#00ff88" }} />
                    <span className="text-2xl font-bold" style={{ color: "#6b7280" }}>Fetching…</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={amountOut}
                    readOnly
                    placeholder="0.00"
                    className="w-full bg-transparent text-3xl font-bold outline-none"
                    style={{ color: amountOut ? "#fff" : "#374151" }}
                  />
                )}
              </div>
              <button
                onClick={() => setShowToSelector(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <TAvatar symbol={toToken.symbol} size={28} />
                <span className="text-sm font-bold">{toToken.symbol}</span>
                <ChevronDown className="w-3.5 h-3.5" style={{ color: "#6b7280" }} />
              </button>
            </div>

            {/* TO modal */}
            {showToSelector && (
              <TokenModal
                title="Select token to receive"
                searchVal={toSearchCA}
                onSearch={v => setToSearchCA(v)}
                onClose={() => { setShowToSelector(false); setToSearchCA("") }}
                tokenList={toTokenList.filter(t => {
                  if (t.address.toLowerCase() === fromToken.address.toLowerCase()) return false
                  if (!toSearchCA) return true
                  const s = toSearchCA.toLowerCase()
                  return t.address.toLowerCase().includes(s) || t.symbol.toLowerCase().includes(s) || t.name.toLowerCase().includes(s)
                })}
                onSelect={t => { const bal = tokensWithBalances.get(t.address.toLowerCase()) || "0"; setToToken({ ...t, balance: bal }); setAmountOut("") }}
                isFrom={false}
              />
            )}
          </div>

          {/* ── Fee info ── */}
          {amountIn && Number.parseFloat(amountIn) > 0 && amountOut && (
            <div className="mx-5 mb-5 rounded-2xl p-4 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: "#6b7280" }}>Expected output</span>
                <span className="font-semibold" style={{ color: "#00ff88" }}>
                  ~{Number.parseFloat(amountOut).toFixed(6)} {toToken.symbol}
                </span>
              </div>
              {swapFee && Number.parseFloat(swapFee) > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: "#6b7280" }}>Platform fee ({FEE_PERCENTAGE}%)</span>
                  <span className="font-medium" style={{ color: "#9ca3af" }}>
                    -{swapFee} {toToken.symbol}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: "#6b7280" }}>Slippage tolerance</span>
                <span className="font-medium" style={{ color: "#9ca3af" }}>{slippage}%</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
            <span className="text-sm" style={{ color: "#fca5a5" }}>{error}</span>
          </div>
        )}

        {/* ── Success banner ── */}
        {success && (
          <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.2)" }}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#00ff88" }} />
            <span className="text-sm" style={{ color: "#6ee7b7" }}>{success}</span>
          </div>
        )}

        {/* ── Swap / Approve button ── */}
        <button
          onClick={handleSwap}
          disabled={loading || !amountIn || !amountOut || Number.parseFloat(amountIn) === 0 || showFromSelector || showToSelector}
          className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
          style={
            loading || !amountIn || !amountOut || Number.parseFloat(amountIn) === 0
              ? { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#9ca3af", cursor: "not-allowed", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }
              : needsApproval
              ? { background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }
              : { background: "#00ff88", color: "#0a0b0d", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }
          }
        >
          {loading ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Processing…
            </>
          ) : needsApproval ? (
            "Approve Token"
          ) : (
            "Swap Tokens"
          )}
        </button>

        {/* Transaction Notification */}
        {showNotification && notificationData && (
          <TransactionNotification
            message={notificationData.message}
            txHash={notificationData.txHash}
            explorerUrl={notificationData.explorerUrl}
            onClose={() => {
              setShowNotification(false)
              setNotificationData(null)
            }}
          />
        )}
      </div>

      <BottomNav active="trade" />
    </div>
  )
}

