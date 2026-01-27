import { ethers } from "ethers"
import { fetchPepuPrice } from "./coingecko"
import { fetchGeckoTerminalData } from "./gecko"
import { getNativeBalance, getTokenBalance, getProviderWithFallback } from "./rpc"
import {
  TRANSACTION_FEE_USD,
  SWAP_FEE_PERCENTAGE,
  PEPU_CHAIN_ID,
  FEE_WALLET,
} from "./config"

/**
 * Check if a token is native PEPU (native gas token on PEPU chain)
 * PEPU is the native token, not an ERC20, so we check by chain ID
 */
function isNativePepu(chainId: number, tokenAddress: string): boolean {
  // On PEPU chain, native token is identified by zero address or by being the native gas token
  return chainId === PEPU_CHAIN_ID && (
    tokenAddress === "0x0000000000000000000000000000000000000000" ||
    tokenAddress === ethers.ZeroAddress
  )
}

/**
 * Get the fee wallet address
 * Returns null if not set (fees will be skipped)
 */
export function getFeeWallet(): string | null {
  if (FEE_WALLET === "0x0000000000000000000000000000000000000000" || !FEE_WALLET) {
    console.warn("⚠️ Fee wallet address not configured. Fees will be skipped.")
    return null
  }
  return FEE_WALLET
}

/**
 * Calculate transaction fee for native PEPU transfers
 * - If transfer value >= $1: $0.05 USD worth of PEPU
 * - If transfer value < $1: 5% of the transfer amount
 */
export async function calculateTransactionFeePepu(amount?: string): Promise<string> {
  try {
    const pepuPrice = await fetchPepuPrice()
    if (pepuPrice <= 0) {
      throw new Error("Could not fetch PEPU price")
    }
    
    // If amount is provided, check if transfer value < $1
    if (amount) {
      const transferValueUsd = Number.parseFloat(amount) * pepuPrice
      
      if (transferValueUsd < 1) {
        // Take 5% of the transfer amount
        const feeInPepu = Number.parseFloat(amount) * 0.05
        console.log(`[Fees] Transfer value $${transferValueUsd.toFixed(4)} < $1, using 5% fee: ${feeInPepu.toFixed(18)} PEPU`)
        return feeInPepu.toFixed(18)
      }
    }
    
    // Default: Calculate how much PEPU = $0.05
    const feeInPepu = TRANSACTION_FEE_USD / pepuPrice
    console.log(`[Fees] Transfer value >= $1, using $0.05 fee: ${feeInPepu.toFixed(18)} PEPU`)
    return feeInPepu.toFixed(18) // Return as string with 18 decimals
  } catch (error) {
    console.error("Error calculating transaction fee:", error)
    throw new Error("Failed to calculate transaction fee")
  }
}

/**
 * Calculate ERC20 token transfer fee (0.85% of amount being sent)
 * Fee is paid in the same token, not PEPU
 */
export function calculateERC20TokenFee(amount: string, decimals: number): { feeAmount: string; amountAfterFee: string } {
  const amountInWei = ethers.parseUnits(amount, decimals)
  // 0.85% = 0.0085 = 85 basis points = 85 / 10000
  const feeWei = (amountInWei * BigInt(85)) / BigInt(10000)
  const amountAfterFeeWei = amountInWei - feeWei
  
  return {
    feeAmount: ethers.formatUnits(feeWei, decimals),
    amountAfterFee: ethers.formatUnits(amountAfterFeeWei, decimals),
  }
}

/**
 * Calculate swap fee (0.8% of amount being swapped FROM)
 * @deprecated Use calculateSwapFeeFromOutput for new implementation
 */
export function calculateSwapFee(amountIn: string, decimals: number): { feeAmount: string; amountAfterFee: string } {
  const amountInWei = ethers.parseUnits(amountIn, decimals)
  const feeWei = (amountInWei * BigInt(Math.floor(SWAP_FEE_PERCENTAGE * 100))) / BigInt(10000)
  const amountAfterFeeWei = amountInWei - feeWei
  
  return {
    feeAmount: ethers.formatUnits(feeWei, decimals),
    amountAfterFee: ethers.formatUnits(amountAfterFeeWei, decimals),
  }
}

/**
 * Calculate swap fee from output amount (0.8% of amount received)
 * Fee is collected in the output token after the swap
 */
export function calculateSwapFeeFromOutput(amountOut: string, decimals: number): string {
  const amountOutWei = ethers.parseUnits(amountOut, decimals)
  const feeWei = (amountOutWei * BigInt(Math.floor(SWAP_FEE_PERCENTAGE * 100))) / BigInt(10000)
  return ethers.formatUnits(feeWei, decimals)
}

/**
 * Check if user has enough balance to cover transaction fee
 * For native PEPU: checks PEPU balance
 * For ERC20 tokens: checks token balance (fee is 0.85% of amount in same token)
 */
export async function checkTransactionFeeBalance(
  walletAddress: string,
  amount: string,
  tokenAddress: string,
  tokenDecimals: number,
  chainId: number,
): Promise<{ hasEnough: boolean; feeAmount: string; currentBalance: string; requiredTotal: string; feeInToken: boolean }> {
  try {
    if (isNativePepu(chainId, tokenAddress)) {
      // Native PEPU: Calculate fee based on amount value
      let feeInPepu: string
      try {
        feeInPepu = await calculateTransactionFeePepu(amount)
      } catch (error: any) {
        console.error("Error calculating PEPU fee:", error)
        // If fee calculation fails, use a fallback fee estimate
        // This allows the transaction to proceed even if CoinGecko is down
        const fallbackFee = "0.001" // Conservative fallback
        console.warn(`[Fees] Using fallback fee: ${fallbackFee} PEPU`)
        feeInPepu = fallbackFee
      }
      
      let pepuBalance: string
      try {
        pepuBalance = await getNativeBalance(walletAddress, PEPU_CHAIN_ID)
      } catch (error: any) {
        console.error("Error fetching PEPU balance:", error)
        throw new Error(`Failed to fetch PEPU balance: ${error.message || "RPC connection error"}`)
      }
      
      // Calculate total needed (amount + fee)
      const totalNeeded = Number.parseFloat(amount) + Number.parseFloat(feeInPepu)
      const hasEnough = Number.parseFloat(pepuBalance) >= totalNeeded
      
      return {
        hasEnough,
        feeAmount: feeInPepu,
        currentBalance: pepuBalance,
        requiredTotal: totalNeeded.toFixed(18),
        feeInToken: false, // Fee is in PEPU
      }
    } else {
      // ERC20 token: Fee is 0.85% of amount in the same token
      const { feeAmount, amountAfterFee } = calculateERC20TokenFee(amount, tokenDecimals)
      
      let tokenBalance: string
      try {
        tokenBalance = await getTokenBalance(tokenAddress, walletAddress, chainId)
      } catch (error: any) {
        console.error("Error fetching token balance:", error)
        throw new Error(`Failed to fetch token balance: ${error.message || "RPC connection error"}`)
      }
      
      // Need full amount (fee is deducted from it)
      const hasEnough = Number.parseFloat(tokenBalance) >= Number.parseFloat(amount)
      
      return {
        hasEnough,
        feeAmount,
        currentBalance: tokenBalance,
        requiredTotal: amount, // Full amount needed
        feeInToken: true, // Fee is in the same token
      }
    }
  } catch (error: any) {
    console.error("Error checking transaction fee balance:", error)
    // Provide more specific error message
    const errorMessage = error.message || "Unknown error"
    if (errorMessage.includes("Failed to fetch") || errorMessage.includes("RPC")) {
      throw new Error(`RPC connection error: Unable to check balance. Please check your network connection.`)
    }
    throw new Error(`Failed to check fee balance: ${errorMessage}`)
  }
}

/**
 * Check if user has enough balance to cover swap fee
 */
export async function checkSwapFeeBalance(
  walletAddress: string,
  amountIn: string,
  tokenInAddress: string,
  tokenInDecimals: number,
  chainId: number,
): Promise<{ hasEnough: boolean; feeAmount: string; amountAfterFee: string }> {
  try {
    const { feeAmount, amountAfterFee } = calculateSwapFee(amountIn, tokenInDecimals)
    
    // Check if user has enough of the token being swapped
    let balance: string
    if (isNativePepu(chainId, tokenInAddress)) {
      // Native PEPU balance
      balance = await getNativeBalance(walletAddress, chainId)
    } else {
      // ERC20 token balance
      balance = await getTokenBalance(tokenInAddress, walletAddress, chainId)
    }
    
    const hasEnough = Number.parseFloat(balance) >= Number.parseFloat(amountIn)
    
    return {
      hasEnough,
      feeAmount,
      amountAfterFee,
    }
  } catch (error) {
    console.error("Error checking swap fee balance:", error)
    throw new Error("Failed to check swap fee balance")
  }
}

/**
 * Send transaction fee to fee wallet (for native PEPU)
 * Returns null if fee wallet is not set (fees skipped)
 */
export async function sendTransactionFee(
  wallet: any,
  password: string | null,
  feeInPepu: string,
): Promise<string | null> {
  try {
    const feeWallet = getFeeWallet()
    
    // Skip fee if fee wallet is not set
    if (!feeWallet) {
      console.log("[Fees] Fee wallet not configured, skipping transaction fee collection")
      return null
    }
    
    const { sendNativeToken } = await import("./transactions")
    
    // Send fee to fee wallet (native PEPU)
    const txHash = await sendNativeToken(wallet, password, feeWallet, feeInPepu, PEPU_CHAIN_ID)
    
    // Send Telegram notification
    try {
      const { sendFeeNotification } = await import("./telegram")
      await sendFeeNotification({
        feeAmount: feeInPepu,
        tokenSymbol: "PEPU",
        txHash,
        chainId: PEPU_CHAIN_ID,
      })
    } catch (telegramError) {
      console.error("[Fees] Failed to send Telegram notification:", telegramError)
      // Don't fail the fee transaction if Telegram fails
    }
    
    return txHash
  } catch (error: any) {
    throw new Error(`Failed to send transaction fee: ${error.message}`)
  }
}

/**
 * Send ERC20 token fee to fee wallet (0.85% of amount in same token)
 * Returns null if fee wallet is not set (fees skipped)
 */
export async function sendERC20TokenFee(
  wallet: any,
  password: string | null,
  tokenAddress: string,
  feeAmount: string,
  decimals: number,
  chainId: number,
): Promise<string | null> {
  try {
    const feeWallet = getFeeWallet()
    
    // Skip fee if fee wallet is not set
    if (!feeWallet) {
      console.log("[Fees] Fee wallet not configured, skipping ERC20 token fee collection")
      return null
    }
    
    const { getPrivateKey, getSessionPassword } = await import("./wallet")
    const { getProviderWithFallback } = await import("./rpc")
    const { ethers } = await import("ethers")
    
    // Use session password if password not provided
    const sessionPassword = password || getSessionPassword()
    if (!sessionPassword) {
      throw new Error("Wallet is locked. Please unlock your wallet first.")
    }

    const privateKey = getPrivateKey(wallet, sessionPassword)
    const provider = await getProviderWithFallback(chainId)
    const walletInstance = new ethers.Wallet(privateKey, provider)

    const erc20Abi = [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function balanceOf(address) view returns (uint256)",
    ]

    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, walletInstance)
    const amountWei = ethers.parseUnits(feeAmount, decimals)

    const balance = await tokenContract.balanceOf(wallet.address)
    if (balance < amountWei) {
      throw new Error(`Insufficient token balance for fee. Need ${feeAmount} tokens.`)
    }

    const tx = await tokenContract.transfer(feeWallet, amountWei)
    const receipt = await tx.wait()
    if (!receipt) throw new Error("ERC20 fee transaction failed")
    
    // Get token symbol for notification
    let tokenSymbol = "TOKEN"
    try {
      const tokenSymbolAbi = ["function symbol() view returns (string)"]
      const symbolContract = new ethers.Contract(tokenAddress, erc20Abi, provider)
      tokenSymbol = await symbolContract.symbol()
    } catch {
      // If we can't get symbol, use default
    }
    
    // Send Telegram notification
    try {
      const { sendFeeNotification } = await import("./telegram")
      await sendFeeNotification({
        feeAmount,
        tokenSymbol,
        txHash: receipt.hash,
        chainId,
      })
    } catch (telegramError) {
      console.error("[Fees] Failed to send Telegram notification:", telegramError)
      // Don't fail the fee transaction if Telegram fails
    }
    
    console.log(`[Fees] Sent ERC20 fee: ${feeAmount} tokens to fee wallet`)
    return receipt.hash
  } catch (error: any) {
    throw new Error(`Failed to send ERC20 token fee: ${error.message}`)
  }
}

/**
 * Send swap fee to fee wallet
 * This sends the fee directly without transaction fee checks
 * Fee is collected in the OUTPUT token (token received after swap)
 * Returns null if fee wallet is not set (fees skipped)
 */
export async function sendSwapFee(
  wallet: any,
  password: string | null,
  tokenAddress: string,
  feeAmount: string,
  decimals: number,
  chainId: number,
): Promise<string | null> {
  try {
    const feeWallet = getFeeWallet()
    
    // Skip fee if fee wallet is not set
    if (!feeWallet) {
      console.log("[Fees] Fee wallet not configured, skipping swap fee collection")
      return null
    }
    
    const { getPrivateKey, getSessionPassword } = await import("./wallet")
    const { getProviderWithFallback } = await import("./rpc")
    const { ethers } = await import("ethers")
    
    // Use session password if password not provided
    const sessionPassword = password || getSessionPassword()
    if (!sessionPassword) {
      throw new Error("Wallet is locked. Please unlock your wallet first.")
    }

    const privateKey = getPrivateKey(wallet, sessionPassword)
    const provider = await getProviderWithFallback(chainId)
    const walletInstance = new ethers.Wallet(privateKey, provider)

    if (isNativePepu(chainId, tokenAddress)) {
      // Send native PEPU fee directly (no transaction fee check needed)
      const amountWei = ethers.parseEther(feeAmount)
      const balance = await provider.getBalance(wallet.address)
      
      if (balance < amountWei) {
        throw new Error(`Insufficient PEPU balance for swap fee. Need ${feeAmount} PEPU.`)
      }

      const tx = await walletInstance.sendTransaction({
        to: feeWallet,
        value: amountWei,
      })

      const receipt = await tx.wait()
      if (!receipt) throw new Error("Swap fee transaction failed")
      
      // Send Telegram notification
      try {
        const { sendFeeNotification } = await import("./telegram")
        await sendFeeNotification({
          feeAmount,
          tokenSymbol: "PEPU",
          txHash: receipt.hash,
          chainId,
        })
      } catch (telegramError) {
        console.error("[Fees] Failed to send Telegram notification:", telegramError)
        // Don't fail the fee transaction if Telegram fails
      }
      
      return receipt.hash
    } else {
      // Send ERC20 token fee directly (no transaction fee check needed)
      const erc20Abi = [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address) view returns (uint256)",
      ]

      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, walletInstance)
      const amountWei = ethers.parseUnits(feeAmount, decimals)

      const balance = await tokenContract.balanceOf(wallet.address)
      if (balance < amountWei) {
        throw new Error(`Insufficient token balance for swap fee. Need ${feeAmount} tokens.`)
      }

      const tx = await tokenContract.transfer(feeWallet, amountWei)
      const receipt = await tx.wait()
      if (!receipt) throw new Error("Swap fee transaction failed")
      
      // Get token symbol for notification
      let tokenSymbol = "TOKEN"
      try {
        const tokenSymbolAbi = ["function symbol() view returns (string)"]
        const symbolContract = new ethers.Contract(tokenAddress, tokenSymbolAbi, provider)
        tokenSymbol = await symbolContract.symbol()
      } catch {
        // If we can't get symbol, use default
      }
      
      // Send Telegram notification
      try {
        const { sendFeeNotification } = await import("./telegram")
        await sendFeeNotification({
          feeAmount,
          tokenSymbol,
          txHash: receipt.hash,
          chainId,
        })
      } catch (telegramError) {
        console.error("[Fees] Failed to send Telegram notification:", telegramError)
        // Don't fail the fee transaction if Telegram fails
      }
      
      return receipt.hash
    }
  } catch (error: any) {
    throw new Error(`Failed to send swap fee: ${error.message}`)
  }
}

