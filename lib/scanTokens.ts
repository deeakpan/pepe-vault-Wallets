import { ethers } from "ethers"
import { getProvider } from "./rpc"

export interface ScannedToken {
  symbol: string
  address: string
  balance: string
  decimals: number
  isNative: boolean
}

const ERC20_MINI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]

export const NATIVE_ADDR = "native"

export async function scanWalletTokens(
  walletAddress: string,
  chainId: number,
): Promise<ScannedToken[]> {
  const provider = getProvider(chainId)
  const found: ScannedToken[] = []

  // ── Native balance ──────────────────────────────────────
  try {
    const bal = await provider.getBalance(walletAddress)
    if (bal > 0n) {
      found.push({
        symbol: chainId === 97741 ? "PEPU" : "ETH",
        address: NATIVE_ADDR,
        balance: ethers.formatEther(bal),
        decimals: 18,
        isNative: true,
      })
    }
  } catch (e) {
    console.warn("[scanTokens] Could not fetch native balance:", e)
  }

  // ── ERC20 tokens via Transfer event logs ────────────────
  try {
    const blockNumber = await provider.getBlockNumber()
    const fromBlock = Math.max(0, blockNumber - 50000)

    const logs = await provider.getLogs({
      topics: [
        ethers.id("Transfer(address,address,uint256)"),
        null,
        ethers.zeroPadValue(walletAddress, 32),
      ],
      fromBlock,
    })

    const uniqueAddrs = [...new Set(logs.map((l) => l.address.toLowerCase()))]

    const results = await Promise.allSettled(
      uniqueAddrs.map(async (addr) => {
        const c = new ethers.Contract(addr, ERC20_MINI, provider)
        const [bal, sym, dec] = await Promise.all([
          c.balanceOf(walletAddress),
          c.symbol(),
          c.decimals(),
        ])
        if (bal > 0n) {
          return {
            symbol: String(sym),
            address: addr,
            balance: ethers.formatUnits(bal, Number(dec)),
            decimals: Number(dec),
            isNative: false,
          } as ScannedToken
        }
        return null
      }),
    )

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        found.push(r.value)
      }
    }
  } catch (e) {
    console.warn("[scanTokens] ERC20 scan failed:", e)
  }

  return found
}
