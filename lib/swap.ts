import { ethers } from "ethers"
import { getProvider } from "./rpc"
import { getPrivateKey, getSessionPassword, type Wallet } from "./wallet"
import { calculateSwapFee } from "./fees"

const QUOTER_ADDRESS = "0xd647b2D80b48e93613Aa6982b85f8909578b4829"
const SWAP_ROUTER_ADDRESS = "0x150c3F0f16C3D9EB34351d7af9c961FeDc97A0fb"
const FACTORY_ADDRESS = "0x5984B8BF2d4dB9C0aCB1d7924762e4474D80C807"
const WPEPU_ADDRESS = "0xf9cf4a16d26979b929be7176bac4e7084975fcb8"

const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000"

const FEE_TIERS = [100, 500, 3000, 10000]

// QuoterV2 ABI - returns multiple values
const QUOTER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn", type: "address" },
          { internalType: "address", name: "tokenOut", type: "address" },
          { internalType: "uint256", name: "amountIn", type: "uint256" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        internalType: "struct IQuoterV2.QuoteExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "quoteExactInputSingle",
    outputs: [
      { internalType: "uint256", name: "amountOut", type: "uint256" },
      { internalType: "uint160", name: "sqrtPriceX96After", type: "uint160" },
      { internalType: "uint32", name: "initializedTicksCrossed", type: "uint32" },
      { internalType: "uint256", name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes", name: "path", type: "bytes" },
      { internalType: "uint256", name: "amountIn", type: "uint256" },
    ],
    name: "quoteExactInput",
    outputs: [
      { internalType: "uint256", name: "amountOut", type: "uint256" },
      { internalType: "uint160[]", name: "sqrtPriceX96AfterList", type: "uint160[]" },
      { internalType: "uint32[]", name: "initializedTicksCrossedList", type: "uint32[]" },
      { internalType: "uint256", name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
]

// Swap Router ABI with multicall support
const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn", type: "address" },
          { internalType: "address", name: "tokenOut", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "address", name: "recipient", type: "address" },
          { internalType: "uint256", name: "amountIn", type: "uint256" },
          { internalType: "uint256", name: "amountOutMinimum", type: "uint256" },
          { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        internalType: "struct IV3SwapRouter.ExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInputSingle",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "bytes", name: "path", type: "bytes" },
          { internalType: "address", name: "recipient", type: "address" },
          { internalType: "uint256", name: "amountIn", type: "uint256" },
          { internalType: "uint256", name: "amountOutMinimum", type: "uint256" },
        ],
        internalType: "struct IV3SwapRouter.ExactInputParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInput",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "deadline", type: "uint256" }, { internalType: "bytes[]", name: "data", type: "bytes[]" }],
    name: "multicall",
    outputs: [{ internalType: "bytes[]", name: "results", type: "bytes[]" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "WETH9",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "value", type: "uint256" }],
    name: "wrapETH",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "amountMinimum", type: "uint256" },
      { internalType: "address", name: "recipient", type: "address" },
    ],
    name: "unwrapWETH9",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "refundETH",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
]

const FACTORY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "tokenA", type: "address" },
      { internalType: "address", name: "tokenB", type: "address" },
      { internalType: "uint24", name: "fee", type: "uint24" },
    ],
    name: "getPool",
    outputs: [{ internalType: "address", name: "pool", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
]

const POOL_ABI = [
  {
    inputs: [],
    name: "liquidity",
    outputs: [{ internalType: "uint128", name: "", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
]

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]

// Helper function to encode path for multihop swaps
function encodePath(path: string[], fees: number[]): string {
  if (path.length !== fees.length + 1) {
    throw new Error("Invalid path/fee lengths")
  }

  let encoded = "0x"
  for (let i = 0; i < fees.length; i++) {
    encoded += path[i].slice(2).toLowerCase().padStart(40, "0")
    encoded += fees[i].toString(16).padStart(6, "0")
  }
  encoded += path[path.length - 1].slice(2).toLowerCase().padStart(40, "0")
  return encoded
}

// Check if pool exists and has liquidity
async function checkPoolExists(
  token0: string,
  token1: string,
  fee: number,
  chainId = 97741,
): Promise<{ exists: boolean; poolAddress: string; hasLiquidity: boolean }> {
  try {
    const provider = getProvider(chainId)
    const [orderedToken0, orderedToken1] =
      token0.toLowerCase() < token1.toLowerCase() ? [token0, token1] : [token1, token0]

    const factoryContract = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider)
    const poolAddress = await factoryContract.getPool(orderedToken0, orderedToken1, fee)

    if (poolAddress === ethers.ZeroAddress) {
      return { exists: false, poolAddress: ethers.ZeroAddress, hasLiquidity: false }
    }

    try {
      const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider)
      const liquidity = await poolContract.liquidity()
      return {
        exists: true,
        poolAddress,
        hasLiquidity: liquidity > BigInt(0),
      }
    } catch {
      return { exists: true, poolAddress, hasLiquidity: false }
    }
  } catch (error) {
    return { exists: false, poolAddress: ethers.ZeroAddress, hasLiquidity: false }
  }
}

// Find available route between tokens
async function findAvailableRoute(
  tokenInAddr: string,
  tokenOutAddr: string,
  amountIn: bigint,
  chainId = 97741,
): Promise<{ type: "single" | "multi"; path: string[]; fees: number[]; available: boolean } | null> {
  const actualTokenIn = tokenInAddr === NATIVE_TOKEN ? WPEPU_ADDRESS : tokenInAddr
  const actualTokenOut = tokenOutAddr === NATIVE_TOKEN ? WPEPU_ADDRESS : tokenOutAddr

  // Try direct route first
  for (const fee of FEE_TIERS) {
    const poolInfo = await checkPoolExists(actualTokenIn, actualTokenOut, fee, chainId)
    if (poolInfo.exists && poolInfo.hasLiquidity) {
      return { type: "single", path: [actualTokenIn, actualTokenOut], fees: [fee], available: true }
    }
  }

  // Try multihop through WPEPU
  const commonBases = [WPEPU_ADDRESS]
  for (const base of commonBases) {
    if (base === actualTokenIn || base === actualTokenOut) continue

    for (const fee1 of FEE_TIERS) {
      for (const fee2 of FEE_TIERS) {
        const pool1Info = await checkPoolExists(actualTokenIn, base, fee1, chainId)
        if (!pool1Info.exists || !pool1Info.hasLiquidity) continue

        const pool2Info = await checkPoolExists(base, actualTokenOut, fee2, chainId)
        if (!pool2Info.exists || !pool2Info.hasLiquidity) continue

        return {
          type: "multi",
          path: [actualTokenIn, base, actualTokenOut],
          fees: [fee1, fee2],
          available: true,
        }
      }
    }
  }

  return null
}

export async function getSwapQuote(
  tokenIn: { address: string; decimals: number },
  tokenOut: { address: string; decimals: number },
  amountIn: string,
  chainId = 97741,
): Promise<string> {
  try {
    if (!amountIn || Number.parseFloat(amountIn) === 0) {
      throw new Error("Invalid amount")
    }

    const provider = getProvider(chainId)
    const amountInWei = ethers.parseUnits(amountIn, tokenIn.decimals)

    // Find available route
    const routeInfo = await findAvailableRoute(tokenIn.address, tokenOut.address, amountInWei, chainId)
    if (!routeInfo || !routeInfo.available) {
      throw new Error("No route found between these tokens")
    }

    const quoter = new ethers.Contract(QUOTER_ADDRESS, QUOTER_ABI, provider)

    if (routeInfo.type === "single") {
      // Try all fee tiers and pick the best quote
      let bestQuote: bigint | null = null
      let bestFee = 3000

    for (const fee of FEE_TIERS) {
      try {
          const actualTokenIn = tokenIn.address === NATIVE_TOKEN ? WPEPU_ADDRESS : tokenIn.address
          const actualTokenOut = tokenOut.address === NATIVE_TOKEN ? WPEPU_ADDRESS : tokenOut.address

        const result = await quoter.quoteExactInputSingle.staticCall({
            tokenIn: actualTokenIn,
            tokenOut: actualTokenOut,
          amountIn: amountInWei,
          fee,
          sqrtPriceLimitX96: 0,
        })

          const amountOut = result[0] // First element is amountOut
          if (!bestQuote || amountOut > bestQuote) {
            bestQuote = amountOut
            bestFee = fee
          }
        } catch {
        continue
      }
    }

      if (!bestQuote) {
    throw new Error("No liquidity found")
      }

      return ethers.formatUnits(bestQuote, tokenOut.decimals)
    } else {
      // Multihop route
      const encodedPath = encodePath(routeInfo.path, routeInfo.fees)
      try {
        const result = await quoter.quoteExactInput.staticCall(encodedPath, amountInWei)
        const amountOut = result[0] // First element is amountOut
        return ethers.formatUnits(amountOut, tokenOut.decimals)
      } catch (error) {
        throw new Error("Failed to get quote for multihop route")
      }
    }
  } catch (error: any) {
    if (error.message === "No route found between these tokens") {
      throw new Error("No route found. Try swapping through WPEPU first.")
    }
    throw new Error(error.message || "Failed to get quote")
  }
}

export async function checkAllowance(
  tokenAddress: string,
  owner: string,
  spender: string,
  amount: string,
  decimals: number,
  chainId = 97741,
): Promise<{ needsApproval: boolean; currentAllowance: string }> {
  try {
    if (tokenAddress === NATIVE_TOKEN) {
      return { needsApproval: false, currentAllowance: "0" }
    }

    const provider = getProvider(chainId)
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)

    const allowance = await tokenContract.allowance(owner, spender)
    const amountWei = ethers.parseUnits(amount, decimals)

    return {
      needsApproval: allowance < amountWei,
      currentAllowance: ethers.formatUnits(allowance, decimals),
    }
  } catch (error: any) {
    throw new Error(error.message || "Failed to check allowance")
  }
}

export async function approveToken(
  tokenAddress: string,
  wallet: Wallet,
  password: string | null,
  amount: string,
  decimals: number,
  chainId = 97741,
): Promise<string> {
  try {
    if (tokenAddress === NATIVE_TOKEN) {
      throw new Error("Native token does not need approval")
    }

    // Use session password if password not provided
    const sessionPassword = password || getSessionPassword()
    if (!sessionPassword) {
      throw new Error("Wallet is locked. Please unlock your wallet first.")
    }

    const privateKey = getPrivateKey(wallet, sessionPassword)
    
    // Validate private key format
    if (!privateKey || typeof privateKey !== 'string') {
      throw new Error("Invalid private key: decryption failed or returned empty value")
    }
    
    // Ensure private key has 0x prefix
    let cleanedPrivateKey = privateKey.trim()
    if (!cleanedPrivateKey.startsWith("0x")) {
      cleanedPrivateKey = "0x" + cleanedPrivateKey
    }
    
    // Validate private key length
    if (cleanedPrivateKey.length !== 66) {
      throw new Error(`Invalid private key length: expected 66 characters (with 0x), got ${cleanedPrivateKey.length}. The password may be incorrect.`)
    }
    
    const provider = getProvider(chainId)
    const walletInstance = new ethers.Wallet(cleanedPrivateKey, provider)

    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, walletInstance)
    // Approve max amount for better UX
    const maxUint256 = ethers.MaxUint256
    const amountWei = ethers.parseUnits(amount, decimals)

    // Check current allowance first
    const currentAllowance = await tokenContract.allowance(wallet.address, SWAP_ROUTER_ADDRESS)
    if (currentAllowance >= amountWei) {
      return "already_approved" // Already approved
    }

    const tx = await tokenContract.approve(SWAP_ROUTER_ADDRESS, maxUint256, { gasLimit: 100000 })
    const receipt = await tx.wait()

    if (!receipt) throw new Error("Approval failed")
    return receipt.hash
  } catch (error: any) {
    throw new Error(error.message || "Approval failed")
  }
}

export async function executeSwap(
  tokenIn: { address: string; decimals: number },
  tokenOut: { address: string; decimals: number },
  amountIn: string,
  amountOut: string,
  wallet: Wallet,
  password: string | null,
  slippage = 0.5,
  chainId = 97741,
): Promise<string> {
  try {
    // Use session password if password not provided
    const sessionPassword = password || getSessionPassword()
    if (!sessionPassword) {
      throw new Error("Wallet is locked. Please unlock your wallet first.")
    }

    // Note: Fee is sent before executeSwap is called (in handleSwap)
    // The amountIn parameter is already the amount AFTER fee deduction
    // For native token swaps, we need to check balance including gas fees
    const provider = getProvider(chainId)
    
    // For native token swaps, check if we have enough for swap amount and gas separately
    if (tokenIn.address === NATIVE_TOKEN && chainId === 97741) {
      const balance = await provider.getBalance(wallet.address)
      const amountInWei = ethers.parseUnits(amountIn, tokenIn.decimals)
      
      // Estimate gas cost (use a conservative estimate)
      const gasPrice = await provider.getFeeData()
      const estimatedGas = BigInt(500000) // Conservative gas estimate for swap
      const gasCost = estimatedGas * (gasPrice.gasPrice || BigInt(0))
      
      // Format helper function
      const formatBalance = (weiValue: bigint): string => {
        try {
          const formatted = ethers.formatEther(weiValue)
          const parts = formatted.split('.')
          if (parts.length === 1) {
            return formatted
          }
          const integerPart = parts[0]
          const decimalPart = parts[1] || ''
          const limitedDecimal = decimalPart.slice(0, 6).padEnd(6, '0')
          const trimmedDecimal = limitedDecimal.replace(/0+$/, '')
          return trimmedDecimal ? `${integerPart}.${trimmedDecimal}` : integerPart
        } catch {
          const formatted = ethers.formatEther(weiValue)
          const num = Number.parseFloat(formatted)
          return isNaN(num) ? formatted : num.toFixed(6)
        }
      }
      
      const balanceFormatted = formatBalance(balance)
      const amountFormatted = formatBalance(amountInWei)
      const gasCostFormatted = formatBalance(gasCost)
      
      // SEPARATE CHECKS: Swap amount and gas are both in PEPU (native token), but check separately for clarity
      // Check 1: Does user have enough PEPU for the swap amount?
      if (balance < amountInWei) {
        console.error(`[Swap] Insufficient balance for swap amount:`, {
          balance: balance.toString(),
          balanceFormatted,
          amountInWei: amountInWei.toString(),
          amountFormatted,
          walletAddress: wallet.address,
        })
        throw new Error(`Insufficient balance for swap. You have ${balanceFormatted} PEPU, but need ${amountFormatted} PEPU for the swap amount.`)
      }
      
      // Check 2: Does user have enough PEPU for gas fees?
      if (balance < gasCost) {
        console.error(`[Swap] Insufficient balance for gas:`, {
          balance: balance.toString(),
          balanceFormatted,
          gasCost: gasCost.toString(),
          gasCostFormatted,
          walletAddress: wallet.address,
        })
        throw new Error(`Insufficient balance for gas fees. You have ${balanceFormatted} PEPU, but need ${gasCostFormatted} PEPU for gas fees.`)
      }
      
      // Check 3: Does user have enough PEPU for both swap amount AND gas?
      const totalNeeded = amountInWei + gasCost
      if (balance < totalNeeded) {
        const totalNeededFormatted = formatBalance(totalNeeded)
        console.error(`[Swap] Insufficient balance for swap + gas:`, {
          balance: balance.toString(),
          balanceFormatted,
          amountInWei: amountInWei.toString(),
          amountFormatted,
          gasCost: gasCost.toString(),
          gasCostFormatted,
          totalNeeded: totalNeeded.toString(),
          totalNeededFormatted,
          walletAddress: wallet.address,
        })
        throw new Error(`Insufficient balance. You have ${balanceFormatted} PEPU. You need ${amountFormatted} PEPU for the swap and ${gasCostFormatted} PEPU for gas fees (total: ${totalNeededFormatted} PEPU).`)
      }
    }

    const privateKey = getPrivateKey(wallet, sessionPassword)
    
    // Validate private key format
    if (!privateKey || typeof privateKey !== 'string') {
      throw new Error("Invalid private key: decryption failed or returned empty value")
    }
    
    // Ensure private key has 0x prefix
    let cleanedPrivateKey = privateKey.trim()
    if (!cleanedPrivateKey.startsWith("0x")) {
      cleanedPrivateKey = "0x" + cleanedPrivateKey
    }
    
    // Validate private key length (should be 66 characters with 0x prefix = 64 hex chars)
    if (cleanedPrivateKey.length !== 66) {
      throw new Error(`Invalid private key length: expected 66 characters (with 0x), got ${cleanedPrivateKey.length}. The password may be incorrect.`)
    }
    
    // Try to create wallet to validate private key and verify it matches the wallet address
    let walletInstance: ethers.Wallet
    try {
      walletInstance = new ethers.Wallet(cleanedPrivateKey, provider)
      
      // CRITICAL: Verify the private key matches the wallet address
      if (walletInstance.address.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error(`Private key does not match wallet address. Expected ${wallet.address}, got ${walletInstance.address}. The password may be incorrect or the wallet data is corrupted.`)
      }
    } catch (validationError: any) {
      if (validationError.message && validationError.message.includes("does not match wallet address")) {
        throw validationError
      }
      throw new Error(`Invalid private key format: ${validationError.message}. The password may be incorrect.`)
    }

    const swapRouter = new ethers.Contract(SWAP_ROUTER_ADDRESS, SWAP_ROUTER_ABI, walletInstance)

    // amountIn is already the amount after fee deduction (passed from handleSwap)
    const amountInWei = ethers.parseUnits(amountIn, tokenIn.decimals)
    const amountOutWei = ethers.parseUnits(amountOut, tokenOut.decimals)
    const slippageAmount = (amountOutWei * BigInt(Math.floor((100 - slippage) * 100))) / BigInt(10000)

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20 // 20 minutes

    const isFromNative = tokenIn.address === NATIVE_TOKEN
    const isToNative = tokenOut.address === NATIVE_TOKEN

    // Find route
    const routeInfo = await findAvailableRoute(tokenIn.address, tokenOut.address, amountInWei, chainId)
    if (!routeInfo || !routeInfo.available) {
      throw new Error("No route found between these tokens")
    }

    let tx

    if (routeInfo.type === "multi") {
      // Multihop swap
      const encodedPath = encodePath(routeInfo.path, routeInfo.fees)

      if (isFromNative) {
        // Wrap ETH, swap, optionally unwrap
        const calls = []
        calls.push(swapRouter.interface.encodeFunctionData("wrapETH", [amountInWei]))

        const exactInputParams = {
          path: encodedPath,
          recipient: isToNative ? SWAP_ROUTER_ADDRESS : wallet.address,
          amountIn: amountInWei,
          amountOutMinimum: slippageAmount,
        }
        calls.push(swapRouter.interface.encodeFunctionData("exactInput", [exactInputParams]))

        if (isToNative) {
          calls.push(swapRouter.interface.encodeFunctionData("unwrapWETH9", [slippageAmount, wallet.address]))
        }

        calls.push(swapRouter.interface.encodeFunctionData("refundETH"))

        tx = await swapRouter["multicall(uint256,bytes[])"](deadline, calls, {
          value: amountInWei,
          gasLimit: 500000,
        })
      } else {
        // Regular multihop
        const exactInputParams = {
          path: encodedPath,
          recipient: wallet.address,
          amountIn: amountInWei,
          amountOutMinimum: slippageAmount,
        }
        tx = await swapRouter.exactInput(exactInputParams, { gasLimit: 400000 })
      }
    } else {
      // Single hop swap
      const actualTokenIn = isFromNative ? WPEPU_ADDRESS : tokenIn.address
      const actualTokenOut = isToNative ? WPEPU_ADDRESS : tokenOut.address

      // Find the best fee tier
      let bestFee = 3000
      for (const fee of FEE_TIERS) {
        const poolInfo = await checkPoolExists(actualTokenIn, actualTokenOut, fee, chainId)
        if (poolInfo.exists && poolInfo.hasLiquidity) {
          bestFee = fee
          break
        }
      }

      if (isFromNative || isToNative) {
        // Use multicall for native token handling
        const calls = []

        const paramsForExactInputSingle = {
          tokenIn: actualTokenIn,
          tokenOut: actualTokenOut,
          fee: bestFee,
          recipient: isToNative ? SWAP_ROUTER_ADDRESS : wallet.address,
          amountIn: amountInWei,
          amountOutMinimum: slippageAmount,
          sqrtPriceLimitX96: 0,
        }

        calls.push(swapRouter.interface.encodeFunctionData("exactInputSingle", [paramsForExactInputSingle]))

        if (isToNative) {
          calls.push(swapRouter.interface.encodeFunctionData("unwrapWETH9", [slippageAmount, wallet.address]))
        }

        calls.push(swapRouter.interface.encodeFunctionData("refundETH"))

        tx = await swapRouter["multicall(uint256,bytes[])"](deadline, calls, {
          value: isFromNative ? amountInWei : 0,
          gasLimit: 500000,
        })
      } else {
        // Regular ERC20 to ERC20 swap
    const params = {
          tokenIn: actualTokenIn,
          tokenOut: actualTokenOut,
          fee: bestFee,
      recipient: wallet.address,
      amountIn: amountInWei,
      amountOutMinimum: slippageAmount,
      sqrtPriceLimitX96: 0,
    }

        tx = await swapRouter.exactInputSingle(params, { gasLimit: 300000 })
      }
    }

    const receipt = await tx.wait()

    if (!receipt) throw new Error("Swap failed")
    
    // Check transaction status
    if (receipt.status === 0) {
      // Transaction reverted - try to decode revert reason
      let revertReason = "Swap transaction reverted"
      try {
        // Common revert reasons for swaps
        if (receipt.logs.length === 0) {
          revertReason = "Swap reverted: Insufficient liquidity or slippage too high. Try increasing slippage tolerance or reducing swap amount."
        } else {
          revertReason = "Swap reverted: Possible reasons - insufficient liquidity, slippage exceeded, or insufficient balance for fees."
        }
      } catch (decodeError: any) {
        revertReason = `Swap reverted: ${decodeError.message || "Unknown error"}`
      }
      throw new Error(revertReason)
    }
    
    return receipt.hash
  } catch (error: any) {
    // Provide more specific error messages
    const errorMsg = error.message || String(error) || "Unknown error"
    
    if (errorMsg.includes("revert") || errorMsg.includes("reverted") || errorMsg.includes("CALL_EXCEPTION")) {
      // Transaction reverted - provide helpful message
      if (errorMsg.includes("insufficient") || errorMsg.includes("balance")) {
        throw new Error("Insufficient balance for swap. Make sure you have enough tokens after the fee was sent.")
      } else if (errorMsg.includes("slippage") || errorMsg.includes("STF")) {
        throw new Error("Slippage tolerance exceeded. The price moved too much. Try again or increase slippage tolerance.")
      } else if (errorMsg.includes("liquidity") || errorMsg.includes("LS")) {
        throw new Error("Insufficient liquidity in the pool. Try a smaller amount or a different token pair.")
      } else if (errorMsg.includes("allowance") || errorMsg.includes("allow")) {
        throw new Error("Insufficient token allowance. Please approve the token first.")
      } else {
        throw new Error("Swap transaction reverted. Possible reasons: insufficient liquidity, slippage exceeded, or insufficient balance. Please try again with a smaller amount.")
      }
    } else if (errorMsg.includes("insufficient funds") || (errorMsg.includes("balance") && !errorMsg.includes("after fee"))) {
      // Only throw generic balance error if it's not already a specific balance error
      // Don't wrap if the error already has our formatted message
      if (errorMsg.includes("Insufficient balance for swap")) {
        throw new Error(errorMsg) // Already formatted, don't wrap
      }
      throw new Error(`Insufficient balance: ${errorMsg}`)
    } else if (errorMsg.includes("allowance")) {
      throw new Error("Insufficient token allowance. Please approve the token first.")
    } else {
      throw new Error(errorMsg || "Swap failed. Please try again.")
    }
  }
}
