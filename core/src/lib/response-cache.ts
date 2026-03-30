import { createHash } from "node:crypto"

interface CacheEntry {
  body: string
  contentType: string
  createdAt: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30_000
const MAX_CACHE_SIZE = 200

export function hashPayload(payload: unknown): string {
  const str = typeof payload === "string" ? payload : JSON.stringify(payload)
  return createHash("sha256").update(str).digest("hex").slice(0, 16)
}

export function getCached(key: string): CacheEntry | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry
}

export function setCache(key: string, body: string, contentType: string): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { body, contentType, createdAt: Date.now() })
}

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.createdAt > CACHE_TTL_MS) cache.delete(key)
  }
}, 60_000)
