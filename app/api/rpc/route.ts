import { NextRequest, NextResponse } from "next/server"
import { getProvider } from "@/lib/rpc"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { method, params = [], chainId = 1 } = body

    if (!method) {
      return NextResponse.json({ error: "Method is required" }, { status: 400 })
    }

    // Get provider for the chain
    const provider = getProvider(chainId)

    // Forward RPC call to blockchain
    const result = await provider.send(method, params)

    return NextResponse.json({ result })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message || "RPC call failed",
        code: error.code || -32000,
      },
      { status: 500 },
    )
  }
}

