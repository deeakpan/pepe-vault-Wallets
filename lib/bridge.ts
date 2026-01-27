import { ethers } from "ethers"
import { getProvider } from "./rpc"
import { getPrivateKey, getSessionPassword, type Wallet } from "./wallet"
import {
  L2_BRIDGE_CONTRACT,
  L1_BRIDGE_CONTRACT,
  PEPU_TOKEN_ADDRESS_ETH,
  BRIDGE_DECIMALS,
} from "./config"

// L2 Bridge ABI (Pepe Unchained V2)
const L2_BRIDGE_ABI = [
  {
    inputs: [],
    name: "bridge",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "feeBps",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
]

// L1 Bridge ABI (Ethereum Mainnet)
const L1_BRIDGE_ABI = [
  {
    inputs: [],
    name: "TOKEN",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
]

// ERC20 ABI for balance checking
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
]

/**
 * Get the bridge fee percentage from the L2 bridge contract
 * @param chainId - Chain ID (default: 97741 for PEPU)
 * @returns Fee percentage as a decimal (e.g., 0.05 for 5%)
 */
export async function getFeePercentage(chainId = 97741): Promise<number> {
  try {
    const provider = getProvider(chainId)
    const bridgeContract = new ethers.Contract(L2_BRIDGE_CONTRACT, L2_BRIDGE_ABI, provider)
    const feeBps = await bridgeContract.feeBps()
    return Number(feeBps) / 10000 // Convert basis points to decimal
  } catch (error) {
    console.error("Error getting bridge fee:", error)
    return 0.05 // Default 5% if contract call fails
  }
}

/**
 * Get the PEPU token address from the L1 bridge contract
 * @returns PEPU token address on Ethereum mainnet
 */
export async function getPepuTokenAddress(): Promise<string> {
  try {
    const l1Provider = getProvider(1)
    const l1BridgeContract = new ethers.Contract(L1_BRIDGE_CONTRACT, L1_BRIDGE_ABI, l1Provider)
    const pepuTokenAddress = await l1BridgeContract.TOKEN()
    return pepuTokenAddress
  } catch (error) {
    console.error("Error getting PEPU token address:", error)
    // Fallback to known address if contract call fails
    return PEPU_TOKEN_ADDRESS_ETH
  }
}

/**
 * Get the L1 pool balance (PEPU tokens available on Ethereum for bridging)
 * This checks the balance of the L1 bridge contract holding PEPU tokens
 * Matches the Telegram bot logic exactly
 * @returns Pool balance as a formatted string
 */
export async function getPoolBalance(): Promise<string> {
  try {
    // Get provider for Ethereum mainnet (L1) - using llamarpc.com
    const ethereumProvider = getProvider(1)
    
    // Get the PEPU token address from L1 bridge contract
    const l1BridgeContract = new ethers.Contract(L1_BRIDGE_CONTRACT, L1_BRIDGE_ABI, ethereumProvider)
    const pepuTokenAddress = await l1BridgeContract.TOKEN()
    
    // Create token contract instance
    const pepuTokenContract = new ethers.Contract(pepuTokenAddress, ERC20_ABI, ethereumProvider)
    
    // Get balance of L1 bridge contract (matching bot code exactly)
    const balance = await pepuTokenContract.balanceOf(L1_BRIDGE_CONTRACT)
    
    // Format the balance using the token's decimals
    return ethers.formatUnits(balance, BRIDGE_DECIMALS)
  } catch (error) {
    console.error("Error getting L1 pool balance:", error)
    return "0"
  }
}

/**
 * Execute a bridge transaction from L2 (PEPU) to L1 (Ethereum)
 * @param wallet - Wallet object
 * @param password - Wallet password (optional, uses session password if not provided)
 * @param amount - Amount to bridge (as a string, e.g., "100.5")
 * @param chainId - Chain ID (default: 97741 for PEPU)
 * @returns Transaction hash
 */
export async function executeBridge(
  wallet: Wallet,
  password: string | null,
  amount: string,
  chainId = 97741,
): Promise<string> {
  try {
    // Use session password if password not provided
    const sessionPassword = password || getSessionPassword()
    if (!sessionPassword) {
      throw new Error("Wallet is locked. Please unlock your wallet first.")
    }

    const privateKey = getPrivateKey(wallet, sessionPassword)
    const provider = getProvider(chainId)
    const walletInstance = new ethers.Wallet(privateKey, provider)

    // Parse amount to wei
    const amountWei = ethers.parseUnits(amount, BRIDGE_DECIMALS)
    
    // Create bridge contract instance
    const bridgeContract = new ethers.Contract(L2_BRIDGE_CONTRACT, L2_BRIDGE_ABI, walletInstance)

    // Execute bridge transaction
    const tx = await bridgeContract.bridge({
      value: amountWei,
      gasLimit: 200000, // Match bot code gas limit
    })
    
    // Wait for transaction confirmation
    const receipt = await tx.wait()

    if (!receipt || receipt.status !== 1) {
      throw new Error("Bridge transaction failed")
    }
    
    return receipt.hash
  } catch (error: any) {
    console.error("Bridge execution error:", error)
    
    // Provide more specific error messages
    if (error.code === "INSUFFICIENT_FUNDS") {
      throw new Error("Insufficient gas funds")
    } else if (error.message?.includes("user rejected")) {
      throw new Error("Transaction rejected")
    }
    
    throw new Error(error.message || "Bridge failed")
  }
}
