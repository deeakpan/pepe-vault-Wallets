// Cookie management utilities

/**
 * Delete a specific cookie
 */
export function deleteCookie(name: string) {
  if (typeof document === "undefined") return

  // Delete for current path
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`

  // Try to delete for parent domain
  try {
    const domain = window.location.hostname
    if (domain.includes(".")) {
      const parentDomain = "." + domain.split(".").slice(-2).join(".")
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${parentDomain}`
    }
  } catch (e) {
    // Ignore domain errors
  }
}

/**
 * Delete all cookies (for reset wallet)
 */
export function deleteAllCookies() {
  if (typeof document === "undefined") return

  document.cookie.split(";").forEach((cookie) => {
    const eqPos = cookie.indexOf("=")
    const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim()
    deleteCookie(name)
  })
}

/**
 * Get cookie value
 */
export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null

  const nameEQ = name + "="
  const ca = document.cookie.split(";")
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === " ") c = c.substring(1, c.length)
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length)
  }
  return null
}

