import { NextResponse } from 'next/server'
import { getTransactionDetails } from '@/services/dailySalesService'
import { unstable_cache } from 'next/cache'
import { shouldCacheFilters, generateFilterCacheKey, getCacheControlHeader, getCacheDuration } from '@/lib/cache-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateRange = searchParams.get('dateRange')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const regionCode = searchParams.get('regionCode')
    const cityCode = searchParams.get('cityCode')
    const teamLeaderCode = searchParams.get('teamLeaderCode')
    const fieldUserRole = searchParams.get('fieldUserRole')
    const userCode = searchParams.get('userCode')
    const chainName = searchParams.get('chainName')
    const storeCode = searchParams.get('storeCode')
    const productCode = searchParams.get('productCode')
    const productCategory = searchParams.get('productCategory')
    
    // Pagination parameters
    const page = searchParams.get('page')
    const limit = searchParams.get('limit')

    const filters: any = {}
    if (dateRange) filters.dateRange = dateRange
    if (startDate) filters.startDate = startDate
    if (endDate) filters.endDate = endDate
    if (regionCode) filters.regionCode = regionCode
    if (cityCode) filters.cityCode = cityCode
    if (teamLeaderCode) filters.teamLeaderCode = teamLeaderCode
    if (fieldUserRole) filters.fieldUserRole = fieldUserRole
    if (userCode) filters.userCode = userCode
    if (chainName) filters.chainName = chainName
    if (storeCode) filters.storeCode = storeCode
    if (productCode) filters.productCode = productCode
    if (productCategory) filters.productCategory = productCategory
    if (page) filters.page = page
    if (limit) filters.limit = limit

    const shouldCache = shouldCacheFilters(dateRange || null, startDate, endDate)
    const hasCustomDates = !!(startDate && endDate)
    const cacheDuration = getCacheDuration(dateRange || 'thisMonth', hasCustomDates, startDate, endDate)

    let data
    if (shouldCache) {
      // Include pagination in cache key to cache each page separately
      const cacheKey = generateFilterCacheKey('daily-sales-transactions', filters)
      const cachedFetchTransactions = unstable_cache(
        async () => getTransactionDetails(filters),
        [cacheKey],
        {
          revalidate: cacheDuration,
          tags: ['daily-sales-transactions']
        }
      )
      data = await cachedFetchTransactions()
    } else {
      data = await getTransactionDetails(filters)
    }

    return NextResponse.json({ 
      ...data,
      cached: shouldCache, 
      cacheInfo: { 
        duration: shouldCache ? cacheDuration : 0,
        reason: shouldCache ? undefined : (dateRange === 'today' ? 'today' : 'custom-range')
      } 
    }, { 
      headers: { 
        'Cache-Control': shouldCache 
          ? getCacheControlHeader(cacheDuration)
          : 'no-cache, no-store, must-revalidate'
      } 
    })
  } catch (error) {
    console.error('Error in transaction details API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transaction details' },
      { status: 500 }
    )
  }
}
