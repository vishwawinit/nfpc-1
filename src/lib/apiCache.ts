/**
 * Shared API Response Cache Utility
 *
 * This provides in-memory caching for API responses to improve performance.
 * The cache is filter-aware and will serve different cached responses based on query parameters.
 *
 * IMPORTANT: This cache respects filter changes - each unique combination of filters
 * gets its own cache entry, so changing filters will correctly fetch new data.
 */

interface CacheEntry {
  data: any
  timestamp: number
}

class ApiCache {
  private cache: Map<string, CacheEntry> = new Map()
  private readonly defaultTTL = 60 * 60 * 1000 // 60 minutes default (increased for better caching)
  private readonly maxEntries = 200 // Increased to cache more entries

  /**
   * Generate a cache key from request parameters
   * This ensures each unique filter combination gets its own cache entry
   */
  private generateKey(apiPath: string, params: URLSearchParams | Record<string, any>): string {
    let paramsObj: Record<string, any> = {}

    if (params instanceof URLSearchParams) {
      params.forEach((value, key) => {
        paramsObj[key] = value
      })
    } else {
      paramsObj = params
    }

    // Sort keys to ensure consistent cache keys regardless of param order
    const sortedKeys = Object.keys(paramsObj).sort()
    const sortedParams = sortedKeys.map(key => `${key}=${paramsObj[key]}`).join('&')

    return `${apiPath}::${sortedParams}`
  }

  /**
   * Get cached data if available and not expired
   */
  get(apiPath: string, params: URLSearchParams | Record<string, any>, ttl: number = this.defaultTTL): any | null {
    const key = this.generateKey(apiPath, params)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key)
      return null
    }

    console.log(`✅ Cache HIT for ${apiPath}`)
    return entry.data
  }

  /**
   * Store data in cache
   */
  set(apiPath: string, params: URLSearchParams | Record<string, any>, data: any): void {
    const key = this.generateKey(apiPath, params)

    // Cleanup old entries if cache is too large
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
        console.log(`🗑️ Cleaned up old cache entry: ${firstKey}`)
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })

    console.log(`💾 Cache SET for ${apiPath} (${this.cache.size}/${this.maxEntries} entries)`)
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    console.log('🗑️ Cache cleared')
  }

  /**
   * Clear cache entries for a specific API path
   */
  clearPath(apiPath: string): void {
    const keysToDelete: string[] = []

    this.cache.forEach((_, key) => {
      if (key.startsWith(`${apiPath}::`)) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => this.cache.delete(key))
    console.log(`🗑️ Cleared ${keysToDelete.length} cache entries for ${apiPath}`)
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; keys: string[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxEntries,
      keys: Array.from(this.cache.keys())
    }
  }
}

// Export a singleton instance - make it persistent across hot reloads in development
const globalForApiCache = global as unknown as { apiCache: ApiCache }
export const apiCache = globalForApiCache.apiCache || new ApiCache()
if (process.env.NODE_ENV !== 'production') {
  globalForApiCache.apiCache = apiCache
}
