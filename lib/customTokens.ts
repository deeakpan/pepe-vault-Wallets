const ETH_CUSTOM_TOKENS_KEY = "unchained_eth_custom_tokens"

export function getSavedEthCustomTokens(): string[] {
  if (typeof window === "undefined") return []
  const stored = localStorage.getItem(ETH_CUSTOM_TOKENS_KEY)
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function addEthCustomToken(address: string) {
  if (typeof window === "undefined") return
  const normalized = address.trim().toLowerCase()
  if (!normalized.startsWith("0x") || normalized.length !== 42) {
    throw new Error("Invalid token address")
  }

  const existing = getSavedEthCustomTokens()
  if (!existing.includes(normalized)) {
    const updated = [...existing, normalized]
    localStorage.setItem(ETH_CUSTOM_TOKENS_KEY, JSON.stringify(updated))
  }
}


