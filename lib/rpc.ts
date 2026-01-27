import { ethers } from "ethers"
import { createPublicClient, http } from "viem"
import { mainnet } from "viem/chains"
import { getEtherscanEthBalance } from "./etherscan"
import { reportRpcError, reportRpcSuccess } from "./rpcHealth"

// Single ETH RPC endpoint (as per user requirement)
const ETHEREUM_RPC = "https://ethereum-rpc.publicnode.com"

const RPC_URLS: Record<number, string | string[]> = {
  1: ETHEREUM_RPC,
  97741: "https://rpc-pepu-v2-mainnet-0.t.conduit.xyz",
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  97741: "Pepe Unchained V2",
}

const NATIVE_SYMBOLS: Record<number, string> = {
  1: "ETH",
  97741: "PEPU",
}

// Try multiple RPC endpoints with fallback
async function tryRpcEndpoints(urls: string[]): Promise<ethers.JsonRpcProvider> {
  for (const url of urls) {
    try {
      const provider = new ethers.JsonRpcProvider(url)
      // Test connection
      await provider.getBlockNumber()
      return provider
    } catch (error) {
      console.warn(`RPC endpoint failed: ${url}`, error)
      continue
    }
  }
  // If all fail, return the first one (will throw error on use)
  throw new Error("All RPC endpoints failed")
}

export function getProvider(chainId: number): ethers.JsonRpcProvider {
  const rpcConfig = RPC_URLS[chainId] || RPC_URLS[1]
  
  // Now RPC_URLS[1] is a string, not an array
  const rpcUrl = typeof rpcConfig === "string" ? rpcConfig : rpcConfig[0]
  
  return new ethers.JsonRpcProvider(rpcUrl)
}

// Get provider with automatic fallback
export async function getProviderWithFallback(chainId: number): Promise<ethers.JsonRpcProvider> {
  const rpcConfig = RPC_URLS[chainId] || RPC_URLS[1]
  
  // Now RPC_URLS[1] is a string, not an array
  const rpcUrl = typeof rpcConfig === "string" ? rpcConfig : rpcConfig[0]
  
  return new ethers.JsonRpcProvider(rpcUrl)
}

export function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] || `Chain ${chainId}`
}

export function getNativeSymbol(chainId: number): string {
  return NATIVE_SYMBOLS[chainId] || "TOKEN"
}

export async function getNativeBalance(address: string, chainId: number): Promise<string> {
  // For Ethereum, try Etherscan API first (most reliable)
  if (chainId === 1) {
    try {
      const balanceWei = await getEtherscanEthBalance(address)
      if (balanceWei) {
        return ethers.formatEther(balanceWei)
      }
    } catch (error) {
      console.warn("Etherscan API failed for ETH balance, trying RPC:", error)
    }

    // Fallback to viem for Ethereum native balance
    try {
      const client = createPublicClient({
        chain: mainnet,
        transport: http(ETHEREUM_RPC),
      })
      const balance = await client.getBalance({ address: address as `0x${string}` })
      reportRpcSuccess(chainId)
      return ethers.formatEther(balance)
    } catch (error) {
      console.warn("Viem RPC failed, trying ethers fallback:", error)
      // Continue to ethers provider fallback
    }
  }

  // Use ethers with fallback RPC endpoints
  try {
    const provider = await getProviderWithFallback(chainId)
    const balance = await provider.getBalance(address)
    reportRpcSuccess(chainId)
    return ethers.formatEther(balance)
  } catch (error) {
    console.warn("getProviderWithFallback failed, trying single provider:", error)
    // Final fallback to single provider
    try {
      const provider = getProvider(chainId)
      const balance = await provider.getBalance(address)
      reportRpcSuccess(chainId)
      return ethers.formatEther(balance)
    } catch (finalError: any) {
      console.error("All RPC endpoints failed for native balance:", finalError)
      const errorMsg = finalError?.message || String(finalError) || "RPC connection failed"
      reportRpcError(chainId, errorMsg)
      throw new Error(`Failed to fetch native balance: ${finalError}`)
    }
  }
}

export async function getTokenBalance(tokenAddress: string, userAddress: string, chainId: number): Promise<string> {
  // Use viem for Ethereum ERC-20 balance
  if (chainId === 1) {
    try {
      const client = createPublicClient({
        chain: mainnet,
        transport: http(ETHEREUM_RPC),
      })
      const [balance, decimals] = await Promise.all([
        client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: [
            {
              name: "balanceOf",
              type: "function",
              stateMutability: "view",
              inputs: [{ name: "account", type: "address" }],
              outputs: [{ name: "", type: "uint256" }],
            },
          ],
          functionName: "balanceOf",
          args: [userAddress as `0x${string}`],
        }),
        client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: [
            {
              name: "decimals",
              type: "function",
              stateMutability: "view",
              inputs: [],
              outputs: [{ name: "", type: "uint8" }],
            },
          ],
          functionName: "decimals",
          args: [],
        }),
      ])

      return ethers.formatUnits(balance as bigint, Number(decimals))
    } catch {
      // fall through to ethers-based path
    }
  }

  try {
    const provider = await getProviderWithFallback(chainId)
    const erc20Abi = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"]

    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider)
    const [balance, decimals] = await Promise.all([contract.balanceOf(userAddress), contract.decimals()])

    reportRpcSuccess(chainId)
    return ethers.formatUnits(balance, decimals)
  } catch (error: any) {
    const errorMsg = error?.message || String(error) || "RPC connection failed"
    reportRpcError(chainId, errorMsg)
  const provider = getProvider(chainId)
  const erc20Abi = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"]

  const contract = new ethers.Contract(tokenAddress, erc20Abi, provider)
  const [balance, decimals] = await Promise.all([contract.balanceOf(userAddress), contract.decimals()])

  return ethers.formatUnits(balance, decimals)
  }
}

export async function getTokenInfo(
  tokenAddress: string,
  chainId: number,
): Promise<{ name: string; symbol: string; decimals: number } | null> {
  try {
    const provider = await getProviderWithFallback(chainId)
    const erc20Abi = [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
    ]

    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider)
    const [name, symbol, decimals] = await Promise.all([contract.name(), contract.symbol(), contract.decimals()])

    return { name, symbol, decimals: Number.parseInt(decimals) }
  } catch {
    try {
      // Fallback to first endpoint
    const provider = getProvider(chainId)
    const erc20Abi = [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
    ]

    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider)
    const [name, symbol, decimals] = await Promise.all([contract.name(), contract.symbol(), contract.decimals()])

    return { name, symbol, decimals: Number.parseInt(decimals) }
  } catch {
    return null
    }
  }
}
