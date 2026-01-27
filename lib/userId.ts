// Simple local userId helper (no backend registration)

const USER_ID_KEY = "unchained_user_id"
const USER_ID_COOKIE = "unchained_user_id"

/**
 * Generate a unique user ID
 */
export function generateUserId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 11)
  return `usr_${timestamp}_${random}`
}

/**
 * Get or create user ID from localStorage
 */
export function getOrCreateUserId(): string {
  if (typeof window === "undefined") return ""

  let userId = localStorage.getItem(USER_ID_KEY)

  if (!userId) {
    userId = generateUserId()
    localStorage.setItem(USER_ID_KEY, userId)
    setUserIdCookie(userId)
  } else {
    // Ensure cookie is set
    setUserIdCookie(userId)
  }

  return userId
}

/**
 * Get existing user ID
 */
export function getUserId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(USER_ID_KEY)
}

/**
 * Set user ID cookie (for cross-domain detection)
 */
export function setUserIdCookie(userId: string) {
  if (typeof document === "undefined") return

  // Set cookie with 1 year expiration
  const expires = new Date()
  expires.setFullYear(expires.getFullYear() + 1)

  // Set cookie for current domain
  document.cookie = `${USER_ID_COOKIE}=${userId}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`

  // Also try to set for parent domain if on subdomain
  try {
    const domain = window.location.hostname
    if (domain.includes(".")) {
      const parentDomain = "." + domain.split(".").slice(-2).join(".")
      document.cookie = `${USER_ID_COOKIE}=${userId}; expires=${expires.toUTCString()}; path=/; domain=${parentDomain}; SameSite=Lax`
    }
  } catch (e) {
    // Ignore domain setting errors
  }
}

// Note: previously this file also registered the userId with a REST API at
// /api/wallet/register. That flow has been removed in favor of direct
// WalletConnect + wagmi usage on the dApp side.
