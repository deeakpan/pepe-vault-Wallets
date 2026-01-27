import { ethers } from "ethers"
import { getProvider, getProviderWithFallback } from "./rpc"
import { getPrivateKey, getSessionPassword, type Wallet } from "./wallet"
import {
  calculateTransactionFeePepu,
  checkTransactionFeeBalance,
  sendTransactionFee,
} from "./fees"

export async function sendNativeToken(
  wallet: Wallet,
  password: string | null,
  toAddress: string,
  amount: string,
  chainId: number,
): Promise<string> {
  try {
    if (!ethers.isAddress(toAddress)) {
      throw new Error("Invalid recipient address")
    }

    // Use session password if password not provided
    const sessionPassword = password || getSessionPassword()
    if (!sessionPassword) {
      throw new Error("Wallet is locked. Please unlock your wallet first.")
    }

    // For PEPU chain, check if user has enough balance for fee
    if (chainId === 97741) {
      const feeCheck = await checkTransactionFeeBalance(
        wallet.address,
        amount,
        "0x0000000000000000000000000000000000000000", // Native token
        18,
        chainId,
      )

      if (!feeCheck.hasEnough) {
        throw new Error(
          `Insufficient balance. Required: ${feeCheck.requiredTotal} PEPU (amount + fee), Available: ${feeCheck.currentBalance} PEPU`,
        )
      }
    }

    const privateKey = getPrivateKey(wallet, sessionPassword)
    const provider = await getProviderWithFallback(chainId)
    const walletInstance = new ethers.Wallet(privateKey, provider)

    // For PEPU chain, calculate and deduct fee from amount being sent
    let amountToSend = amount
    let amountWei = ethers.parseEther(amount)
    let feeInPepu = "0"
    let feeInPepuWei = ethers.parseEther("0")
    
    if (chainId === 97741) {
      // Calculate fee (may be $0.05 or 5% depending on transfer value)
      feeInPepu = await calculateTransactionFeePepu(amount)
      feeInPepuWei = ethers.parseEther(feeInPepu)
      
      // Deduct fee from amount
      const amountAfterFee = Number.parseFloat(amount) - Number.parseFloat(feeInPepu)
      if (amountAfterFee <= 0) {
        throw new Error(`Amount too small. Need at least ${feeInPepu} PEPU to cover fee.`)
      }
      amountToSend = amountAfterFee.toFixed(18)
      amountWei = ethers.parseEther(amountToSend)
    }

    const balance = await provider.getBalance(wallet.address)

    // Check balance (amount + fee if PEPU, or just amount if ETH)
    if (chainId === 97741) {
      // Need amount + fee for PEPU
      const totalNeeded = amountWei + feeInPepuWei
      if (balance < totalNeeded) {
        throw new Error("Insufficient balance (including fee)")
      }
    } else {
      // For ETH, just need the amount (fee is separate PEPU transaction)
      if (balance < amountWei) {
        throw new Error("Insufficient balance")
      }
    }

    // Send the main transaction
    const tx = await walletInstance.sendTransaction({
      to: toAddress,
      value: amountWei,
    })

    const receipt = await tx.wait()
    if (!receipt) throw new Error("Transaction failed")
    
    // Check transaction status
    if (receipt.status === 0) {
      // Transaction reverted - try to decode revert reason
      let revertReason = "Transaction reverted"
      try {
        // Try to get revert reason from the transaction
        const code = await provider.call({
          to: toAddress,
          value: amountWei,
          from: wallet.address,
        }, receipt.blockNumber)
        if (code === "0x") {
          revertReason = "Transaction reverted without reason"
        } else {
          // Try to decode error
          revertReason = `Transaction reverted: ${code}`
        }
      } catch (decodeError: any) {
        // If we can't decode, provide a generic message
        revertReason = `Transaction reverted. Possible reasons: insufficient balance, contract error, or invalid parameters.`
      }
      throw new Error(revertReason)
    }

    // Send fee to fee wallet (always in PEPU, on PEPU chain)
    if (chainId === 97741 && feeInPepu !== "0") {
      try {
        await sendTransactionFee(wallet, sessionPassword, feeInPepu)
      } catch (feeError: any) {
        console.error("Failed to send transaction fee:", feeError)
        // Don't fail the main transaction if fee sending fails, but log it
      }
    }

    // Record transfer reward (only for PEPU chain)
    if (chainId === 97741) {
      // Record reward asynchronously (don't wait for it)
      import("./rewards")
        .then(({ addTransferReward }) => {
          return addTransferReward(wallet.address)
        })
        .catch((rewardError: any) => {
          console.error("[Transactions] Failed to record transfer reward:", rewardError)
        })
    }

    return receipt.hash
  } catch (error: any) {
    throw new Error(error.message || "Transaction failed")
  }
}

export async function sendToken(
  wallet: Wallet,
  password: string | null,
  tokenAddress: string,
  toAddress: string,
  amount: string,
  chainId: number,
): Promise<string> {
  try {
    if (!ethers.isAddress(toAddress)) {
      throw new Error("Invalid recipient address")
    }

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
      "function decimals() view returns (uint8)",
      "function balanceOf(address) view returns (uint256)",
    ]

    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, walletInstance)
    const decimals = await tokenContract.decimals()
    
    // For PEPU chain, calculate fee (0.85% of amount in same token)
    let amountToSend = amount
    let amountWei = ethers.parseUnits(amount, decimals)
    let feeAmount = "0"
    
    if (chainId === 97741) {
      // Calculate ERC20 token fee (0.85% of amount)
      const { calculateERC20TokenFee, sendERC20TokenFee } = await import("./fees")
      const feeCalc = calculateERC20TokenFee(amount, decimals)
      feeAmount = feeCalc.feeAmount
      amountToSend = feeCalc.amountAfterFee
      amountWei = ethers.parseUnits(amountToSend, decimals)
      
      // Check balance
      const balance = await tokenContract.balanceOf(wallet.address)
      if (balance < ethers.parseUnits(amount, decimals)) {
        throw new Error("Insufficient token balance")
      }
    } else {
      // For ETH chain, no fee
      const balance = await tokenContract.balanceOf(wallet.address)
      if (balance < amountWei) {
        throw new Error("Insufficient token balance")
      }
    }

    // Send the main transaction (amount after fee deduction)
    const tx = await tokenContract.transfer(toAddress, amountWei)
    const receipt = await tx.wait()
    if (!receipt) throw new Error("Transaction failed")

    // Send fee to fee wallet (only for PEPU chain, in same token)
    if (chainId === 97741 && feeAmount !== "0") {
      try {
        const { sendERC20TokenFee } = await import("./fees")
        await sendERC20TokenFee(wallet, sessionPassword, tokenAddress, feeAmount, decimals, chainId)
      } catch (feeError: any) {
        console.error("Failed to send ERC20 token fee:", feeError)
        // Don't fail the main transaction if fee sending fails, but log it
      }

      // Record ERC20 transfer reward asynchronously (don't wait for it)
      // Users earn 10% of the fee they paid as rewards
      import("./rewards")
        .then(({ addERC20TransferReward }) => {
          return addERC20TransferReward(wallet.address, tokenAddress, amount, feeAmount, decimals)
        })
        .catch((rewardError: any) => {
          console.error("[Transactions] Failed to record ERC20 transfer reward:", rewardError)
        })
    }

    return receipt.hash
  } catch (error: any) {
    throw new Error(error.message || "Transaction failed")
  }
}
