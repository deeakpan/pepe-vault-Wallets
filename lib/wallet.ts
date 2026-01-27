import { ethers } from "ethers"
import CryptoJS from "crypto-js"
import { getOrCreateUserId } from "./userId"
export interface Wallet {
  id: string
  address: string
  encryptedPrivateKey: string
  encryptedMnemonic?: string
  createdAt: number
  name?: string
  chainId: number
  derivationIndex?: number
}

const WALLETS_KEY = "unchained_wallets"
const WALLET_STATE_KEY = "unchained_wallet_state"
const AUTO_LOCK_KEY = "unchained_auto_lock_seconds"
const CURRENT_WALLET_ID_KEY = "unchained_current_wallet_id"

export function generateWalletId() {
  return Math.random().toString(36).substring(2, 15)
}

export async function createWallet(password: string, name?: string, chainId = 1): Promise<Wallet> {
  const wallet = ethers.Wallet.createRandom()
  const mnemonic = wallet.mnemonic?.phrase || ""

  const encryptedPrivateKey = encryptData(wallet.privateKey, password)
  const encryptedMnemonic = mnemonic ? encryptData(mnemonic, password) : undefined

  return {
    id: generateWalletId(),
    address: wallet.address,
    encryptedPrivateKey,
    encryptedMnemonic,
    createdAt: Date.now(),
    name: name || `Wallet ${new Date().toLocaleDateString()}`,
    chainId,
  }
}

export async function importWalletFromMnemonic(
  seedPhrase: string,
  password: string,
  name?: string,
  chainId = 1,
): Promise<Wallet> {
  const wallet = ethers.Wallet.fromPhrase(seedPhrase)
  const mnemonic = wallet.mnemonic?.phrase || seedPhrase

  const encryptedPrivateKey = encryptData(wallet.privateKey, password)
  const encryptedMnemonic = mnemonic ? encryptData(mnemonic, password) : undefined

  return {
    id: generateWalletId(),
    address: wallet.address,
    encryptedPrivateKey,
    encryptedMnemonic,
    createdAt: Date.now(),
    name: name || `Imported Wallet ${new Date().toLocaleDateString()}`,
    chainId,
  }
}

export async function importWalletFromPrivateKey(
  privateKey: string,
  password: string,
  name?: string,
  chainId = 1,
): Promise<Wallet> {
  let cleaned = privateKey.trim()
  if (!cleaned.startsWith("0x")) {
    cleaned = "0x" + cleaned
  }

  const wallet = new ethers.Wallet(cleaned)

  const encryptedPrivateKey = encryptData(wallet.privateKey, password)

  return {
    id: generateWalletId(),
    address: wallet.address,
    encryptedPrivateKey,
    encryptedMnemonic: undefined,
    createdAt: Date.now(),
    name: name || `Imported Wallet ${new Date().toLocaleDateString()}`,
    chainId,
  }
}

export function encryptData(data: string, password: string): string {
  return CryptoJS.AES.encrypt(data, password).toString()
}

export function decryptData(encryptedData: string, password: string): string {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, password)
    const decrypted = bytes.toString(CryptoJS.enc.Utf8)
    
    // If decryption returns empty string, the password is likely wrong
    // But also check if the encrypted data itself is malformed
    if (!decrypted || decrypted.length === 0) {
      // Try to see if we can get any data at all
      const hexString = bytes.toString(CryptoJS.enc.Hex)
      if (!hexString || hexString.length === 0) {
        throw new Error("Decryption failed - invalid encrypted data or incorrect password")
      }
      // If we got hex but no UTF-8, password might be wrong
      throw new Error("Decryption failed - incorrect password")
    }
    
    return decrypted
  } catch (error: any) {
    // Re-throw with clearer message
    if (error.message && error.message.includes("password")) {
      throw error
    }
    throw new Error("Decryption failed - incorrect password or corrupted data")
  }
}

export function addWallet(wallet: Wallet) {
  try {
    // Validate wallet object
    if (!wallet || !wallet.id || !wallet.address || !wallet.encryptedPrivateKey) {
      throw new Error("Invalid wallet object provided to addWallet")
    }
    
    const wallets = getWallets()
    
    // Check if wallet with same ID already exists
    const existingIndex = wallets.findIndex(w => w.id === wallet.id)
    if (existingIndex >= 0) {
      console.warn(`[Wallet] Wallet with ID ${wallet.id} already exists, updating instead of adding`)
      wallets[existingIndex] = wallet
    } else {
      // Check if wallet with same address already exists
      const existingAddressIndex = wallets.findIndex(w => w.address.toLowerCase() === wallet.address.toLowerCase())
      if (existingAddressIndex >= 0) {
        console.warn(`[Wallet] Wallet with address ${wallet.address} already exists, updating instead of adding`)
        wallets[existingAddressIndex] = wallet
      } else {
        wallets.push(wallet)
      }
    }
    
    // Save wallets with error handling
    saveWallets(wallets)
    
    // Verify the wallet was saved
    const verifyWallets = getWallets()
    const saved = verifyWallets.find(w => w.id === wallet.id)
    if (!saved) {
      throw new Error("Failed to verify wallet was saved")
    }

    // If no current wallet is set, make this the active one
    if (typeof window !== "undefined") {
      const currentId = localStorage.getItem(CURRENT_WALLET_ID_KEY)
      if (!currentId) {
        localStorage.setItem(CURRENT_WALLET_ID_KEY, wallet.id)
      }
    }
    
    console.log(`[Wallet] Successfully added wallet: ${wallet.address} (ID: ${wallet.id})`)
  } catch (error) {
    console.error("[Wallet] Error adding wallet:", error)
    throw new Error(`Failed to add wallet: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

export function getWallets(): Wallet[] {
  if (typeof window === "undefined") return []
  
  // Check if localStorage is available
  try {
    const testKey = "__localStorage_test__"
    localStorage.setItem(testKey, "test")
    localStorage.removeItem(testKey)
  } catch (e) {
    console.error("[Wallet] localStorage is not available:", e)
    return []
  }
  
  try {
    const stored = localStorage.getItem(WALLETS_KEY)
    if (!stored) {
      console.log("[Wallet] No wallets found in localStorage")
      return []
    }
    
    const parsed = JSON.parse(stored)
    // Validate that parsed data is an array
    if (!Array.isArray(parsed)) {
      console.error("[Wallet] Stored wallets data is not an array, clearing corrupted data")
      localStorage.removeItem(WALLETS_KEY)
      return []
    }
    
    // Validate each wallet has required fields
    const validWallets = parsed.filter((w: any) => {
      if (!w || !w.id || !w.address || !w.encryptedPrivateKey) {
        console.warn("[Wallet] Invalid wallet found in storage, skipping:", w)
        return false
      }
      return true
    })
    
    if (validWallets.length !== parsed.length) {
      console.warn(`[Wallet] Filtered out ${parsed.length - validWallets.length} invalid wallets`)
      // Save the cleaned wallets back
      if (validWallets.length > 0) {
        saveWallets(validWallets)
      } else {
        localStorage.removeItem(WALLETS_KEY)
      }
    }
    
    console.log(`[Wallet] Loaded ${validWallets.length} wallet(s) from localStorage`)
    return validWallets
  } catch (error) {
    console.error("[Wallet] Error parsing wallets from localStorage:", error)
    // Try to restore from backup
    try {
      const backupKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(`${WALLETS_KEY}_backup_`)) {
          backupKeys.push(key)
        }
      }
      if (backupKeys.length > 0) {
        backupKeys.sort().reverse() // Newest first
        const latestBackup = localStorage.getItem(backupKeys[0])
        if (latestBackup) {
          console.warn("[Wallet] Attempting to restore from backup...")
          const parsed = JSON.parse(latestBackup)
          if (Array.isArray(parsed)) {
            localStorage.setItem(WALLETS_KEY, latestBackup)
            return parsed
          }
        }
      }
    } catch (restoreError) {
      console.error("[Wallet] Failed to restore from backup:", restoreError)
    }
    // Return empty array but keep the corrupted data for debugging
    return []
  }
}

export function saveWallets(wallets: Wallet[]) {
  if (typeof window === "undefined") {
    console.warn("[Wallet] Cannot save wallets - window is undefined (server-side)")
    return
  }
  
  try {
    // Validate wallets is an array
    if (!Array.isArray(wallets)) {
      console.error("[Wallet] Attempted to save non-array wallets data")
      return
    }
    
    // Validate each wallet has required fields
    for (const wallet of wallets) {
      if (!wallet || !wallet.id || !wallet.address || !wallet.encryptedPrivateKey) {
        console.error("[Wallet] Invalid wallet in array:", wallet)
        throw new Error("Invalid wallet data - missing required fields")
      }
    }
    
    // Create a backup before saving (keep last 3 backups)
    try {
      const current = localStorage.getItem(WALLETS_KEY)
      if (current) {
        const backupKey = `${WALLETS_KEY}_backup_${Date.now()}`
        localStorage.setItem(backupKey, current)
        
        // Clean up old backups (keep only last 3)
        const backupKeys: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith(`${WALLETS_KEY}_backup_`)) {
            backupKeys.push(key)
          }
        }
        backupKeys.sort().reverse() // Newest first
        if (backupKeys.length > 3) {
          backupKeys.slice(3).forEach(key => localStorage.removeItem(key))
        }
      }
    } catch (backupError) {
      console.warn("[Wallet] Failed to create backup:", backupError)
      // Don't fail the save if backup fails
    }
    
    const serialized = JSON.stringify(wallets)
    
    // Save to localStorage
    localStorage.setItem(WALLETS_KEY, serialized)
    
    // Verify the save was successful by reading it back
    const verify = localStorage.getItem(WALLETS_KEY)
    if (verify !== serialized) {
      console.error("[Wallet] Save verification failed - data mismatch")
      throw new Error("Failed to verify wallet save - data mismatch")
    }
    
    // Additional verification: parse and check structure
    try {
      const parsed = JSON.parse(verify)
      if (!Array.isArray(parsed) || parsed.length !== wallets.length) {
        throw new Error("Wallet count mismatch after save")
      }
    } catch (parseError) {
      console.error("[Wallet] Save verification failed - parse error:", parseError)
      throw new Error("Failed to verify saved wallet data structure")
    }
    
    console.log(`[Wallet] Successfully saved ${wallets.length} wallet(s) to localStorage`)
  } catch (error) {
    console.error("[Wallet] Error saving wallets to localStorage:", error)
    // Try to restore from backup if save failed
    try {
      const backupKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(`${WALLETS_KEY}_backup_`)) {
          backupKeys.push(key)
        }
      }
      if (backupKeys.length > 0) {
        backupKeys.sort().reverse() // Newest first
        const latestBackup = localStorage.getItem(backupKeys[0])
        if (latestBackup) {
          console.warn("[Wallet] Attempting to restore from backup...")
          localStorage.setItem(WALLETS_KEY, latestBackup)
        }
      }
    } catch (restoreError) {
      console.error("[Wallet] Failed to restore from backup:", restoreError)
    }
    throw new Error(`Failed to save wallets: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

export function getWalletState() {
  if (typeof window === "undefined") return { isLocked: true, lastActivity: 0 }
  const stored = localStorage.getItem(WALLET_STATE_KEY)
  const state = stored ? JSON.parse(stored) : { isLocked: true, lastActivity: 0 }

  // Auto-lock based on inactivity
  const autoLockSeconds = getAutoLockSeconds()
  if (!state.isLocked && state.lastActivity && autoLockSeconds > 0) {
    const now = Date.now()
    if (now - state.lastActivity > autoLockSeconds * 1000) {
      state.isLocked = true
      saveWalletState(state)
    }
  }

  return state
}

export function saveWalletState(state: any) {
  if (typeof window === "undefined") return
  localStorage.setItem(WALLET_STATE_KEY, JSON.stringify(state))
}

const SESSION_PASSWORD_KEY = "unchained_session_password"
const PERSIST_PASSWORD_KEY = "unchained_persist_password"

export function lockWallet() {
  const state = getWalletState()
  state.isLocked = true
  saveWalletState(state)
  // Clear session password when locking
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(SESSION_PASSWORD_KEY)
    // Also clear any other session data that might be related
    // This ensures a clean lock state
  }
}

export function unlockWallet(password: string): boolean {
  const wallets = getWallets()
  if (wallets.length === 0) return false

  try {
    const testWallet = wallets[0]
    decryptData(testWallet.encryptedPrivateKey, password)
    const state = getWalletState()
    state.isLocked = false
    state.lastActivity = Date.now()
    saveWalletState(state)
    // Store password in sessionStorage (and persist copy) for signing
    if (typeof window !== "undefined") {
      sessionStorage.setItem(SESSION_PASSWORD_KEY, password)
      localStorage.setItem(PERSIST_PASSWORD_KEY, password)
    }
    return true
  } catch {
    return false
  }
}

// Get password from session storage (for transactions)
export function getSessionPassword(): string | null {
  if (typeof window === "undefined") return null
  // Prefer session password, but fall back to persisted password so
  // signing can work without visiting /unlock first.
  const session = sessionStorage.getItem(SESSION_PASSWORD_KEY)
  if (session) return session
  return localStorage.getItem(PERSIST_PASSWORD_KEY)
}

export function getPrivateKey(wallet: Wallet, password: string): string {
  try {
    const decrypted = decryptData(wallet.encryptedPrivateKey, password)
    
    // Validate decrypted result - check if it's empty or just whitespace
    if (!decrypted || typeof decrypted !== 'string') {
      throw new Error("Failed to decrypt private key. The password may be incorrect.")
    }
    
    const trimmed = decrypted.trim()
    if (trimmed.length === 0) {
      throw new Error("Failed to decrypt private key. The password may be incorrect.")
    }
    
    // Ensure private key has 0x prefix
    let cleaned = trimmed
    if (!cleaned.startsWith("0x")) {
      cleaned = "0x" + cleaned
    }
    
    // Validate private key format by trying to create a wallet
    // Only throw error if it's clearly invalid, not if it's just a validation issue
    try {
      const testWallet = new ethers.Wallet(cleaned)
      // Verify the wallet address matches (this confirms the private key is correct)
      if (testWallet.address.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error("Decrypted private key does not match wallet address. The password may be incorrect.")
      }
    } catch (validationError: any) {
      // If it's a format error, it might be a password issue
      // But if it's an address mismatch, definitely password issue
      if (validationError.message.includes("address") || validationError.message.includes("match")) {
        throw new Error("Incorrect password. Please try again.")
      }
      // For other validation errors, still try to use it (might be a false positive)
      // Only throw if it's clearly a format issue
      if (validationError.message.includes("invalid") || validationError.message.includes("length")) {
        throw new Error("Incorrect password. Please try again.")
      }
      // Otherwise, log the error but continue - might be a false positive
      console.warn("[Wallet] Validation warning:", validationError.message)
    }
    
    return cleaned
  } catch (error: any) {
    // Re-throw with clearer message only if it's clearly a password issue
    const errorMsg = error.message || ""
    if (errorMsg.includes("password") || errorMsg.includes("decrypt") || errorMsg.includes("incorrect")) {
      throw new Error("Incorrect password. Please try again.")
    }
    // For other errors, throw the original error
    throw error
  }
}

export function getMnemonic(wallet: Wallet, password: string): string | undefined {
  if (!wallet.encryptedMnemonic) return undefined
  return decryptData(wallet.encryptedMnemonic, password)
}

export function updateActivity() {
  const state = getWalletState()
  state.lastActivity = Date.now()
  saveWalletState(state)
}

export function getAutoLockSeconds(): number {
  if (typeof window === "undefined") return 60
  const stored = localStorage.getItem(AUTO_LOCK_KEY)
  const parsed = stored ? Number.parseInt(stored, 10) : 60
  return Number.isNaN(parsed) ? 60 : parsed
}

export function setAutoLockSeconds(seconds: number) {
  if (typeof window === "undefined") return
  const safe = Math.max(0, seconds)
  localStorage.setItem(AUTO_LOCK_KEY, safe.toString())
}

export function getCurrentWalletId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(CURRENT_WALLET_ID_KEY)
}

export function setCurrentWalletId(id: string) {
  if (typeof window === "undefined") return
  localStorage.setItem(CURRENT_WALLET_ID_KEY, id)
}

export function getCurrentWallet(): Wallet | null {
  const wallets = getWallets()
  if (wallets.length === 0) return null
  if (typeof window === "undefined") return wallets[0]

  const currentId = localStorage.getItem(CURRENT_WALLET_ID_KEY)
  if (!currentId) return wallets[0]

  return wallets.find((w) => w.id === currentId) || wallets[0]
}

export function deleteWallet(id: string) {
  const wallets = getWallets()
  if (wallets.length <= 1) {
    throw new Error("Cannot delete the only wallet")
  }

  const index = wallets.findIndex((w) => w.id === id)
  if (index === -1) return

  // Prevent deleting the primary (first) wallet
  if (index === 0) {
    throw new Error("Cannot delete the primary wallet")
  }

  wallets.splice(index, 1)
  saveWallets(wallets)

  // If we deleted the active wallet, fall back to the first remaining
  if (typeof window !== "undefined") {
    const currentId = localStorage.getItem(CURRENT_WALLET_ID_KEY)
    if (currentId === id) {
      localStorage.setItem(CURRENT_WALLET_ID_KEY, wallets[0].id)
    }
  }
}

export async function createWalletFromExistingMnemonic(
  password: string,
  baseWalletId?: string,
  chainId = 1,
): Promise<Wallet> {
  const wallets = getWallets()
  if (wallets.length === 0) {
    throw new Error("No wallet found to derive from")
  }

  const baseWallet =
    wallets.find((w) => w.id === baseWalletId && w.encryptedMnemonic) ||
    wallets.find((w) => w.encryptedMnemonic)

  if (!baseWallet || !baseWallet.encryptedMnemonic) {
    throw new Error("No seed phrase available to derive new wallet")
  }

  // Decrypt mnemonic with existing passcode
  const mnemonic = getMnemonic(baseWallet, password)
  if (!mnemonic) {
    throw new Error("Failed to decrypt seed phrase")
  }

  // Derive next index from this mnemonic (HD wallet style)
  // We group wallets by the *actual* mnemonic text (encryption output can differ)
  const relatedWallets = wallets.filter((w) => {
    if (!w.encryptedMnemonic) return false
    try {
      const walletMnemonic = getMnemonic(w, password)
      return walletMnemonic === mnemonic
    } catch {
      return false
    }
  })
  const maxIndex = relatedWallets.reduce((max, w) => {
    if (typeof w.derivationIndex === "number") {
      return Math.max(max, w.derivationIndex)
    }
    // Root wallet without explicit index -> treat as index 0
    return Math.max(max, 0)
  }, -1)

  const nextIndex = maxIndex + 1

  const path = `m/44'/60'/0'/0/${nextIndex}`
  // Ethers v6: use HDNodeWallet to derive from path
  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic)
  const child = hdNode.derivePath(path)

  const encryptedPrivateKey = encryptData(child.privateKey, password)

  return {
    id: generateWalletId(),
    address: child.address,
    encryptedPrivateKey,
    encryptedMnemonic: baseWallet.encryptedMnemonic,
    createdAt: Date.now(),
    name: `Wallet ${nextIndex + 1}`,
    chainId: chainId || baseWallet.chainId,
    derivationIndex: nextIndex,
  }
}

export function clearAllWallets() {
  // Clear all wallet data
  localStorage.removeItem(WALLETS_KEY)
  localStorage.removeItem(WALLET_STATE_KEY)
  localStorage.removeItem(CURRENT_WALLET_ID_KEY)
  localStorage.removeItem(SESSION_PASSWORD_KEY)
  localStorage.removeItem(PERSIST_PASSWORD_KEY)
  
  // Clear session storage as well
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(SESSION_PASSWORD_KEY)
  }
}

/**
 * Confirm wallet reset with triple confirmation to prevent accidental resets
 * Returns true only if user confirms all three prompts
 */
export function confirmWalletReset(): boolean {
  // First confirmation
  const firstConfirm = confirm(
    "⚠️ WARNING: This will clear ALL wallets on this device.\n\n" +
    "This action cannot be undone. You will need to import your wallets again using your seed phrases.\n\n" +
    "Are you sure you want to reset?"
  )
  
  if (!firstConfirm) return false
  
  // Second confirmation
  const secondConfirm = confirm(
    "⚠️ FINAL WARNING ⚠️\n\n" +
    "You are about to DELETE ALL WALLETS on this device.\n\n" +
    "This action CANNOT be undone.\n\n" +
    "Click OK to continue, or Cancel to abort."
  )
  
  if (!secondConfirm) return false
  
  // Final confirmation with text input
  const finalConfirm = prompt(
    "⚠️ LAST CHANCE ⚠️\n\n" +
    "Type 'RESET' (all caps) to confirm deletion of all wallets:\n\n"
  )
  
  return finalConfirm === "RESET"
}
