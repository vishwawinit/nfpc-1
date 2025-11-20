/**
 * Caching Utilities for Next.js API Routes
 * Provides intelligent cache duration based on date ranges and data types
 */

/**
 * Get cache duration based on date range
 * @param dateRange - The date range string (today, yesterday, thisWeek, etc.)
 * @param hasCustomDates - Whether custom start/end dates are provided
 * @returns Cache duration in seconds
 */
export function getCacheDuration(dateRange: string, hasCustomDates: boolean = false): number {
  // If custom dates represent a standard range, use longer cache
  // Otherwise use medium cache for custom dates
  if (hasCustomDates) {
    // Check if it's likely "this month" or similar standard range
    // Use longer cache for standard ranges, shorter for truly custom
    return 1800 // 30 minutes - increased for better performance
  }
  
  switch(dateRange.toLowerCase()) {
    // Short cache - Changes frequently
    case 'today':
    case 'yesterday':
      return 600 // 10 minutes
    
    // Medium cache - Moderately dynamic
    case 'thisweek':
    case 'lastweek':
    case 'last7days':
      return 900 // 15 minutes
    
    // Long cache - Daily updates (default case - most common)
    case 'thismonth':
    case 'last30days':
      return 1800 // 30 minutes
    
    // Extended cache - Historical data (stable)
    case 'lastmonth':
    case 'thisquarter':
    case 'lastquarter':
    case 'thisyear':
    case 'lastyear':
      return 3600 // 60 minutes
    
    // Default medium cache (for unknown ranges, treat as standard)
    default:
      return 1800 // 30 minutes - increased for better performance
  }
}

/**
 * Standard cache duration for filters (30 minutes - increased for better performance)
 */
export const FILTERS_CACHE_DURATION = 1800

/**
 * Standard cache duration for static/configuration data (30 minutes)
 */
export const STATIC_CACHE_DURATION = 1800

/**
 * Generate Cache-Control header value
 * @param cacheDuration - Cache duration in seconds
 * @returns Cache-Control header value
 */
export function getCacheControlHeader(cacheDuration: number): string {
  const staleWhileRevalidate = cacheDuration * 2
  return `public, s-maxage=${cacheDuration}, stale-while-revalidate=${staleWhileRevalidate}`
}

/**
 * Create cache info object for response
 * @param cacheDuration - Cache duration in seconds
 * @param dateRange - Optional date range
 * @param hasCustomDates - Optional custom dates flag
 * @returns Cache info object
 */
export function createCacheInfo(
  cacheDuration: number,
  dateRange?: string,
  hasCustomDates?: boolean
) {
  return {
    duration: cacheDuration,
    ...(dateRange && { dateRange }),
    ...(hasCustomDates !== undefined && { hasCustomDates })
  }
}

/**
 * Add caching to a NextResponse JSON object
 * @param data - The response data object
 * @param cacheDuration - Cache duration in seconds
 * @param additionalInfo - Additional cache metadata
 * @returns Object with data and headers for NextResponse
 */
export function createCachedResponse(
  data: any,
  cacheDuration: number,
  additionalInfo?: { dateRange?: string; hasCustomDates?: boolean }
) {
  return {
    body: {
      ...data,
      cached: true,
      cacheInfo: createCacheInfo(
        cacheDuration,
        additionalInfo?.dateRange,
        additionalInfo?.hasCustomDates
      )
    },
    headers: {
      'Cache-Control': getCacheControlHeader(cacheDuration)
    }
  }
}

/**
 * Check if the provided dates represent a standard range (this month, last month, etc.)
 * This helps cache default filter combinations even when startDate/endDate are provided
 */
function isStandardDateRange(startDate: string | null, endDate: string | null): boolean {
  if (!startDate || !endDate) return false
  
  const start = new Date(startDate)
  const end = new Date(endDate)
  const today = new Date()
  
  // Check if it's "this month" (start of current month to today)
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  if (start.getTime() === thisMonthStart.getTime() && 
      end.toDateString() === today.toDateString()) {
    return true
  }
  
  // Check if it's "last month" (start to end of previous month)
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
  if (start.getTime() === lastMonthStart.getTime() && 
      end.getTime() === lastMonthEnd.getTime()) {
    return true
  }
  
  // Check if it's "last 30 days" (approximately)
  const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  if (daysDiff >= 25 && daysDiff <= 35) {
    // Check if end date is today or yesterday
    const endDaysAgo = Math.floor((today.getTime() - end.getTime()) / (1000 * 60 * 60 * 24))
    if (endDaysAgo <= 1) {
      return true
    }
  }
  
  return false
}

/**
 * Check if caching should be applied based on date range parameters
 * Caches standard date ranges even when startDate/endDate are provided
 * Excludes "today" and truly custom date ranges
 * @param range - The date range string (today, yesterday, thisWeek, etc.)
 * @param startDate - Optional custom start date
 * @param endDate - Optional custom end date
 * @returns true if caching should be applied, false otherwise
 */
export function shouldCacheFilters(range?: string | null, startDate?: string | null, endDate?: string | null): boolean {
  // Don't cache if range is "today"
  if (range?.toLowerCase() === 'today') {
    return false
  }
  
  // If startDate and endDate are provided, check if it's a standard range
  if (startDate && endDate) {
    // Cache if it represents a standard date range (this month, last month, last 30 days)
    if (isStandardDateRange(startDate, endDate)) {
      return true
    }
    // Don't cache truly custom date ranges
    return false
  }
  
  // Cache all other cases (preset ranges without explicit dates)
  return true
}

/**
 * Generate a cache key for filter queries
 * @param endpoint - The API endpoint name
 * @param params - Object with filter parameters
 * @returns A unique cache key string
 */
export function generateFilterCacheKey(endpoint: string, params: Record<string, string | null | undefined>): string {
  // Sort params to ensure consistent cache keys
  const sortedParams = Object.keys(params)
    .sort()
    .filter(key => params[key] != null && params[key] !== '')
    .map(key => `${key}:${params[key]}`)
    .join('|')
  
  return `filters:${endpoint}:${sortedParams || 'default'}`
}
