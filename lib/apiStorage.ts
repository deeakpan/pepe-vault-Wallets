// Shared storage for API (in production, use database/Redis)

export interface UserData {
  address: string
  createdAt: number
}

export interface SessionData {
  userId: string
  returnUrl: string
  expiresAt: number
}

// In-memory storage (in production, use database)
export const userRegistry = new Map<string, UserData>()
export const sessions = new Map<string, SessionData>()

// Clean up expired sessions periodically
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [token, session] of sessions.entries()) {
      if (session.expiresAt < now) {
        sessions.delete(token)
      }
    }
  }, 60 * 60 * 1000) // Every hour
}

