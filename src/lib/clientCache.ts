/**
 * Client-side cache for API responses
 * Stores data in memory for the session to avoid re-fetching on component remount
 */

interface CacheEntry {
  data: any
  timestamp: number
  expiresAt: number
}

class ClientCache {
  private cache: Map<string, CacheEntry> = new Map()
  private defaultTTL = 5 * 60 * 1000 // 5 minutes default

  /**
   * Generate cache key from URL and params
   */
  private generateKey(url: string, params?: URLSearchParams | Record<string, any>): string {
    if (!params) return url

    const paramsStr = params instanceof URLSearchParams
      ? params.toString()
      : new URLSearchParams(params).toString()

    return `${url}?${paramsStr}`
  }

  /**
   * Get cached data if available and not expired
   */
  get(url: string, params?: URLSearchParams | Record<string, any>): any | null {
    const key = this.generateKey(url, params)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    console.log(`✅ Client cache HIT for: ${key}`)
    return entry.data
  }

  /**
   * Set data in cache with optional TTL
   */
  set(url: string, data: any, params?: URLSearchParams | Record<string, any>, ttl?: number): void {
    const key = this.generateKey(url, params)
    const now = Date.now()

    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + (ttl || this.defaultTTL)
    })

    console.log(`💾 Client cache SET for: ${key}`)

    // Clean up old entries if cache gets too large
    if (this.cache.size > 100) {
      this.cleanup()
    }
  }

  /**
   * Clear specific cache entry
   */
  delete(url: string, params?: URLSearchParams | Record<string, any>): void {
    const key = this.generateKey(url, params)
    this.cache.delete(key)
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    console.log('🗑️ Client cache cleared')
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    const keysToDelete: string[] = []

    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => this.cache.delete(key))

    if (keysToDelete.length > 0) {
      console.log(`🧹 Client cache cleaned up ${keysToDelete.length} expired entries`)
    }
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    }
  }
}

// Export singleton instance
export const clientCache = new ClientCache()
