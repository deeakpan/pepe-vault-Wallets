"use client"

import { createConfig, http } from "wagmi"
import type { Chain } from "wagmi"
import { mainnet } from "wagmi/chains"

const pepuChain: Chain = {
  id: 97741,
  name: "Pepe Unchained V2",
  nativeCurrency: {
    name: "Pepe Unchained",
    symbol: "PEPU",
    decimals: 18,
  },
  network: "pepe-unchained-v2",
  rpcUrls: {
    default: { http: ["https://rpc-pepu-v2-mainnet-0.t.conduit.xyz"] },
    public: { http: ["https://rpc-pepu-v2-mainnet-0.t.conduit.xyz"] },
  },
}

export const wagmiConfig = createConfig({
  chains: [mainnet, pepuChain],
  transports: {
    [mainnet.id]: http("https://eth.llamarpc.com"),
    [pepuChain.id]: http("https://rpc-pepu-v2-mainnet-0.t.conduit.xyz"),
  },
  ssr: true,
})


