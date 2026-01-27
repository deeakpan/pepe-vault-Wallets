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

  return (
    <div className="min-h-screen bg-black text-white pb-20 flex items-center justify-center">
      <div className="w-full max-w-lg mx-auto px-4 py-6 sm:px-4 md:px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Swap</h1>
          <button
            onClick={() => setShowSlippageSettings(!showSlippageSettings)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Slippage Settings */}
        {showSlippageSettings && (
          <div className="glass-card p-4 mb-4 rounded-xl border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Slippage Tolerance</h3>
              <button
                onClick={() => setShowSlippageSettings(false)}
                className="p-1 hover:bg-white/10 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              {[0.1, 0.5, 1.0, 3.0].map((value) => (
                <button
                  key={value}
                  onClick={() => setSlippage(value)}
                  className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
                    slippage === value
                      ? "bg-green-500 text-black"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {value}%
                </button>
              ))}
            </div>
            <input
              type="number"
              value={slippage}
              onChange={(e) => setSlippage(Number.parseFloat(e.target.value) || 0)}
              className="mt-3 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
              placeholder="Custom"
              step="0.1"
              min="0"
              max="50"
            />
          </div>
        )}

        {/* Swap Card - Single box with both tokens */}
        <div className="glass-card rounded-2xl border border-white/10 p-6 mb-4">
          {/* From Token */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">You pay</span>
              {fromToken.balance && (
                <span className="text-xs text-gray-400">
                  Balance: {Number.parseFloat(fromToken.balance).toFixed(4)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1" ref={fromSelectorRef}>
                <input
                  type="number"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent text-3xl font-bold outline-none placeholder:text-gray-600 pr-24 sm:pr-28"
                />
                <button
                  onClick={() => setShowFromSelector(!showFromSelector)}
                  className="absolute right-0 top-0 flex items-center gap-1 glass-card px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
                    <span className="text-[10px] font-bold">{fromToken.symbol[0]}</span>
                  </div>
                  <span className="text-xs font-medium">{fromToken.symbol}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showFromSelector && (
                  <>
                    {/* Backdrop - Opaque to fully cover swap button */}
                    <div 
                      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998]"
                      onClick={() => setShowFromSelector(false)}
                    />
                    {/* Full-screen overlay */}
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
                      <div className="w-full max-w-2xl max-h-[90vh] bg-gradient-to-br from-green-900 to-green-800 rounded-2xl border-2 border-green-500/60 shadow-2xl overflow-hidden flex flex-col pointer-events-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-green-500/30 bg-green-800/50">
                          <h2 className="text-xl font-bold text-green-300">Select Token to Pay</h2>
                          <button
                            onClick={() => setShowFromSelector(false)}
                            className="p-2 hover:bg-green-700/50 rounded-lg transition-colors"
                          >
                            <X className="w-5 h-5 text-green-300" />
                          </button>
                        </div>
                        
                        {/* Search Input */}
                        <div className="p-4 border-b border-green-500/20">
                          <input
                            type="text"
                            placeholder="Enter contract address (CA) to search..."
                            value={fromSearchCA}
                            onChange={(e) => {
                              const ca = e.target.value.trim()
                              setFromSearchCA(ca)
                            }}
                            className="w-full bg-green-800/60 border-2 border-green-500/50 rounded-xl px-4 py-3 text-sm text-green-100 placeholder:text-green-400/70 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/50"
                          />
                          {fromSearchCA && !ethers.isAddress(fromSearchCA) && fromSearchCA.length > 0 && (
                            <div className="text-xs text-red-300 mt-2 px-1">Invalid contract address format</div>
                          )}
                        </div>

                        {/* Content - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-4">
                          {searchingCA && (
                            <div className="text-center py-8">
                              <Loader className="w-6 h-6 animate-spin mx-auto text-green-400 mb-2" />
                              <p className="text-sm text-green-300">Searching token...</p>
                            </div>
                          )}
                          {loadingTokens && !searchingCA && (
                            <div className="text-center py-8">
                              <Loader className="w-6 h-6 animate-spin mx-auto text-green-400 mb-2" />
                              <p className="text-sm text-green-300">Loading tokens from API...</p>
                            </div>
                          )}
                          {!loadingTokens && !searchingCA && fromTokenList.length > 0 && (
                            <div className="text-sm text-green-300/80 px-2 py-2 mb-3 font-medium bg-green-800/30 rounded-lg inline-block">
                              {fromTokenList.length} tokens in your wallet
                            </div>
                          )}
                          {!loadingTokens && !searchingCA && fromTokenList.length === 0 ? (
                            <div className="p-8 text-center">
                              <p className="text-green-400 text-base mb-2">No tokens found in your wallet</p>
                              <p className="text-green-500/70 text-sm">Use the search above to add tokens by contract address</p>
                            </div>
                          ) : (
                            !searchingCA && (
                              <div>
                                <div className="text-sm text-green-300/90 px-2 py-2 mb-3 font-semibold uppercase tracking-wide">Your Tokens</div>
                                <div className="space-y-2">
                                  {fromTokenList
                                    .filter(token => {
                                      // If search CA is entered, filter by matching address
                                      if (fromSearchCA && fromSearchCA.trim().length > 0) {
                                        const searchLower = fromSearchCA.trim().toLowerCase()
                                        return token.address.toLowerCase().includes(searchLower) ||
                                               token.symbol.toLowerCase().includes(searchLower) ||
                                               token.name.toLowerCase().includes(searchLower)
                                      }
                                      return true
                                    })
                                    .map((token) => {
                                    const balance = tokensWithBalances.get(token.address.toLowerCase()) || "0"
                                    return (
                                      <button
                                        key={token.address}
                                        onClick={() => {
                                          setFromToken({ ...token, balance })
                                          setShowFromSelector(false)
                                          setFromSearchCA("")
                                          setAmountIn("")
                                          setAmountOut("")
                                        }}
                                        className="w-full flex items-center gap-3 p-3 hover:bg-green-700/50 rounded-xl transition-all bg-green-800/40 border border-green-500/40 hover:border-green-400/60 hover:shadow-lg"
                                      >
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg">
                                          <span className="text-sm font-bold text-black">{token.symbol[0]}</span>
                                        </div>
                                        <div className="flex-1 text-left">
                                          <div className="text-base font-bold text-green-200">{token.symbol}</div>
                                          <div className="text-xs text-green-400/80">{token.name}</div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-sm font-semibold text-green-300">
                                            {Number.parseFloat(balance).toFixed(4)}
                                          </div>
                                          <div className="text-xs text-green-500/70">{token.symbol}</div>
                                        </div>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={setMaxAmount}
                className="px-3 py-1 text-xs font-semibold bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center -my-2 relative z-10">
            <button
              onClick={switchTokens}
              className="p-2 glass-card rounded-full border border-white/10 hover:bg-white/10 transition-colors"
            >
              <ArrowDownUp className="w-5 h-5" />
            </button>
          </div>

          {/* To Token */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">You receive</span>
              {toToken.balance && (
                <span className="text-xs text-gray-400">
                  Balance: {Number.parseFloat(toToken.balance).toFixed(4)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1" ref={toSelectorRef}>
                <input
                  type="text"
                  value={amountOut || (quoting ? "..." : "")}
                  readOnly
                  placeholder="0"
                  className="w-full bg-transparent text-3xl font-bold outline-none placeholder:text-gray-600 pr-24 sm:pr-28"
                />
                <button
                  onClick={() => setShowToSelector(!showToSelector)}
                  className="absolute right-0 top-0 flex items-center gap-1 glass-card px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
                    <span className="text-[10px] font-bold">{toToken.symbol[0]}</span>
                  </div>
                  <span className="text-xs font-medium">{toToken.symbol}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showToSelector && (
                  <>
                    {/* Backdrop - Opaque to fully cover swap button */}
                    <div 
                      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998]"
                      onClick={() => setShowToSelector(false)}
                    />
                    {/* Full-screen overlay */}
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
                      <div className="w-full max-w-2xl max-h-[90vh] bg-gradient-to-br from-green-900 to-green-800 rounded-2xl border-2 border-green-500/60 shadow-2xl overflow-hidden flex flex-col pointer-events-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-green-500/30 bg-green-800/50">
                          <h2 className="text-xl font-bold text-green-300">Select Token to Receive</h2>
                          <button
                            onClick={() => setShowToSelector(false)}
                            className="p-2 hover:bg-green-700/50 rounded-lg transition-colors"
                          >
                            <X className="w-5 h-5 text-green-300" />
                          </button>
                        </div>
                        
                        {/* Search Input */}
                        <div className="p-4 border-b border-green-500/20">
                          <input
                            type="text"
                            placeholder="Enter contract address (CA) to search..."
                            value={toSearchCA}
                            onChange={(e) => {
                              const ca = e.target.value.trim()
                              setToSearchCA(ca)
                            }}
                            className="w-full bg-green-800/60 border-2 border-green-500/50 rounded-xl px-4 py-3 text-sm text-green-100 placeholder:text-green-400/70 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/50"
                          />
                          {toSearchCA && !ethers.isAddress(toSearchCA) && toSearchCA.length > 0 && (
                            <div className="text-xs text-red-300 mt-2 px-1">Invalid contract address format</div>
                          )}
                        </div>

                        {/* Content - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-4">
                          {searchingCA && (
                            <div className="text-center py-8">
                              <Loader className="w-6 h-6 animate-spin mx-auto text-green-400 mb-2" />
                              <p className="text-sm text-green-300">Searching token...</p>
                            </div>
                          )}
                          {loadingTokens && !searchingCA && (
                            <div className="text-center py-8">
                              <Loader className="w-6 h-6 animate-spin mx-auto text-green-400 mb-2" />
                              <p className="text-sm text-green-300">Loading tokens from API...</p>
                            </div>
                          )}
                          {!loadingTokens && !searchingCA && (() => {
                            const filtered = toTokenList.filter(token => {
                              // If searching by CA, show matching tokens
                              if (toSearchCA && toSearchCA.trim().length > 0) {
                                const searchLower = toSearchCA.trim().toLowerCase()
                                const matches = token.address.toLowerCase().includes(searchLower) ||
                                               token.symbol.toLowerCase().includes(searchLower) ||
                                               token.name.toLowerCase().includes(searchLower)
                                return matches && token.address.toLowerCase() !== fromToken.address.toLowerCase()
                              }
                              return token.address.toLowerCase() !== fromToken.address.toLowerCase()
                            })
                            return filtered.length > 0
                          })() && (
                            <div className="text-sm text-green-300/80 px-2 py-2 mb-3 font-medium bg-green-800/30 rounded-lg inline-block">
                              {(() => {
                                const filtered = toTokenList.filter(token => {
                                  if (toSearchCA && toSearchCA.trim().length > 0) {
                                    const searchLower = toSearchCA.trim().toLowerCase()
                                    const matches = token.address.toLowerCase().includes(searchLower) ||
                                                   token.symbol.toLowerCase().includes(searchLower) ||
                                                   token.name.toLowerCase().includes(searchLower)
                                    return matches && token.address.toLowerCase() !== fromToken.address.toLowerCase()
                                  }
                                  return token.address.toLowerCase() !== fromToken.address.toLowerCase()
                                })
                                return filtered.length
                              })()} tokens available
                            </div>
                          )}
                          {!loadingTokens && !searchingCA && (() => {
                            const filtered = toTokenList.filter(token => {
                              if (toSearchCA && toSearchCA.trim().length > 0) {
                                const searchLower = toSearchCA.trim().toLowerCase()
                                const matches = token.address.toLowerCase().includes(searchLower) ||
                                               token.symbol.toLowerCase().includes(searchLower) ||
                                               token.name.toLowerCase().includes(searchLower)
                                return matches && token.address.toLowerCase() !== fromToken.address.toLowerCase()
                              }
                              return token.address.toLowerCase() !== fromToken.address.toLowerCase()
                            })
                            return filtered.length === 0
                          })() ? (
                            <div className="p-8 text-center">
                              <p className="text-green-400 text-base mb-2">
                                {toSearchCA && toSearchCA.trim().length >= 10 && !ethers.isAddress(toSearchCA.trim()) 
                                  ? "Invalid contract address format" 
                                  : toSearchCA && toSearchCA.trim().length === 42 && ethers.isAddress(toSearchCA.trim())
                                  ? "Searching token via RPC..."
                                  : "No tokens found"}
                              </p>
                              {toSearchCA && toSearchCA.trim().length === 42 && ethers.isAddress(toSearchCA.trim()) && (
                                <p className="text-green-500/70 text-sm">Fetching token details from blockchain...</p>
                              )}
                              {(!toSearchCA || toSearchCA.trim().length === 0) && (
                                <p className="text-green-500/70 text-sm">Use the search above to add tokens by contract address</p>
                              )}
                            </div>
                          ) : (
                            !searchingCA && (
                              <>
                                {/* Your Tokens Section */}
                                {toTokenList
                                  .filter(token => {
                                    const balance = tokensWithBalances.get(token.address.toLowerCase()) || "0"
                                    return Number.parseFloat(balance) > 0 && token.address.toLowerCase() !== fromToken.address.toLowerCase()
                                  })
                                  .length > 0 && (
                                  <div className="mb-4">
                                    <div className="text-sm text-green-300/90 px-2 py-2 mb-3 font-semibold uppercase tracking-wide">Your Tokens</div>
                                    <div className="space-y-2">
                                      {toTokenList
                                        .filter(token => {
                                          const balance = tokensWithBalances.get(token.address.toLowerCase()) || "0"
                                          const hasBalance = Number.parseFloat(balance) > 0
                                          const notFromToken = token.address.toLowerCase() !== fromToken.address.toLowerCase()
                                          // If search CA is entered, filter by matching address/symbol/name
                                          if (toSearchCA && toSearchCA.trim().length > 0) {
                                            const searchLower = toSearchCA.trim().toLowerCase()
                                            const matches = token.address.toLowerCase().includes(searchLower) ||
                                                           token.symbol.toLowerCase().includes(searchLower) ||
                                                           token.name.toLowerCase().includes(searchLower)
                                            return hasBalance && notFromToken && matches
                                          }
                                          return hasBalance && notFromToken
                                        })
                                        .map((token) => {
                                          const balance = tokensWithBalances.get(token.address.toLowerCase()) || "0"
                                          return (
                                            <button
                                              key={token.address}
                                              onClick={() => {
                                                setToToken({ ...token, balance })
                                                setShowToSelector(false)
                                                setToSearchCA("")
                                                setAmountOut("")
                                              }}
                                              className="w-full flex items-center gap-3 p-3 hover:bg-green-700/50 rounded-xl transition-all bg-green-800/40 border border-green-500/40 hover:border-green-400/60 hover:shadow-lg"
                                            >
                                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg">
                                                <span className="text-sm font-bold text-black">{token.symbol[0]}</span>
                                              </div>
                                              <div className="flex-1 text-left">
                                                <div className="text-base font-bold text-green-200">{token.symbol}</div>
                                                <div className="text-xs text-green-400/80">{token.name}</div>
                                              </div>
                                              <div className="text-right">
                                                <div className="text-sm font-semibold text-green-300">
                                                  {Number.parseFloat(balance).toFixed(4)}
                                                </div>
                                                <div className="text-xs text-green-500/70">{token.symbol}</div>
                                              </div>
                                            </button>
                                          )
                                        })}
                                    </div>
                                  </div>
                                )}
                                
                                {/* All Tokens Section - Show ALL tokens except fromToken */}
                                {toTokenList
                                  .filter(token => {
                                    // If search CA is entered, filter by matching address/symbol/name
                                    if (toSearchCA && toSearchCA.trim().length > 0) {
                                      const searchLower = toSearchCA.trim().toLowerCase()
                                      const matches = token.address.toLowerCase().includes(searchLower) ||
                                                     token.symbol.toLowerCase().includes(searchLower) ||
                                                     token.name.toLowerCase().includes(searchLower)
                                      return matches && token.address.toLowerCase() !== fromToken.address.toLowerCase()
                                    }
                                    // Show all tokens except the fromToken
                                    return token.address.toLowerCase() !== fromToken.address.toLowerCase()
                                  })
                                  .length > 0 && (
                                  <div>
                                    {toTokenList
                                      .filter(token => {
                                        const balance = tokensWithBalances.get(token.address.toLowerCase()) || "0"
                                        return Number.parseFloat(balance) > 0 && token.address.toLowerCase() !== fromToken.address.toLowerCase()
                                      })
                                      .length > 0 && (
                                      <div className="text-sm text-green-300/90 px-2 py-2 mb-3 font-semibold uppercase tracking-wide">All Tokens</div>
                                    )}
                                    <div className="space-y-2">
                                      {toTokenList
                                        .filter(token => {
                                          // Show all tokens except fromToken in "All Tokens" section
                                          // Filter out tokens that already appeared in "Your Tokens" section
                                          const balance = tokensWithBalances.get(token.address.toLowerCase()) || "0"
                                          const hasBalance = Number.parseFloat(balance) > 0
                                          const notFromToken = token.address.toLowerCase() !== fromToken.address.toLowerCase()
                                          const inAllTokens = !hasBalance
                                          // If search CA is entered, filter by matching address/symbol/name
                                          if (toSearchCA && toSearchCA.trim().length > 0) {
                                            const searchLower = toSearchCA.trim().toLowerCase()
                                            const matches = token.address.toLowerCase().includes(searchLower) ||
                                                           token.symbol.toLowerCase().includes(searchLower) ||
                                                           token.name.toLowerCase().includes(searchLower)
                                            return inAllTokens && notFromToken && matches
                                          }
                                          return inAllTokens && notFromToken
                                        })
                                        .map((token) => (
                                          <button
                                            key={token.address}
                                            onClick={() => {
                                              setToToken(token)
                                              setShowToSelector(false)
                                              setToSearchCA("")
                                              setAmountOut("")
                                            }}
                                            className="w-full flex items-center gap-3 p-3 hover:bg-green-700/50 rounded-xl transition-all border border-green-500/30 hover:border-green-400/50 hover:shadow-lg bg-green-800/20"
                                          >
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500/40 to-green-600/40 flex items-center justify-center shadow-lg">
                                              <span className="text-sm font-bold text-green-300">{token.symbol[0]}</span>
                                            </div>
                                            <div className="flex-1 text-left">
                                              <div className="text-base font-bold text-green-200">{token.symbol}</div>
                                              <div className="text-xs text-green-400/80">{token.name}</div>
                                            </div>
                                          </button>
                                        ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Fee Info */}
          {amountIn && Number.parseFloat(amountIn) > 0 && amountOut && (
            <div className="mt-4 pt-4 border-t border-white/10 text-xs text-gray-400 space-y-1">
              {amountOut && (
                <div className="flex justify-between text-green-400">
                  <span>Expected Output</span>
                  <span>~{Number.parseFloat(amountOut).toFixed(6)} {toToken.symbol}</span>
                </div>
              )}
              {swapFee && Number.parseFloat(swapFee) > 0 && (
                <div className="flex justify-between">
                  <span>Platform Fee ({FEE_PERCENTAGE}% of output)</span>
                  <span>-{swapFee} {toToken.symbol}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="glass-card p-4 rounded-xl border border-red-500/50 bg-red-500/10 mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        )}

        {success && (
          <div className="glass-card p-4 rounded-xl border border-green-500/50 bg-green-500/10 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-sm text-green-400">{success}</span>
          </div>
        )}

        {/* Swap Button */}
        <button
          onClick={handleSwap}
          disabled={loading || !amountIn || !amountOut || Number.parseFloat(amountIn) === 0 || needsApproval === undefined || showFromSelector || showToSelector}
          className="w-full py-4 rounded-xl font-bold text-lg bg-white text-green-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 relative z-0"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : needsApproval ? (
            "Approve Token First"
          ) : (
            "Swap"
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

