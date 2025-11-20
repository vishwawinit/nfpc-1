import { NextResponse } from 'next/server'
import { getStorePerformance } from '@/services/dailySalesService'
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
    const teamLeaderCode = searchParams.get('teamLeaderCode')
    const fieldUserRole = searchParams.get('fieldUserRole')
    const userCode = searchParams.get('userCode')
    const chainName = searchParams.get('chainName')
    const storeCode = searchParams.get('storeCode')
    const productCode = searchParams.get('productCode')
    const productCategory = searchParams.get('productCategory')

    const filters: any = {}
    if (dateRange) filters.dateRange = dateRange
    if (startDate) filters.startDate = startDate
    if (endDate) filters.endDate = endDate
    if (regionCode) filters.regionCode = regionCode
    if (teamLeaderCode) filters.teamLeaderCode = teamLeaderCode
    if (fieldUserRole) filters.fieldUserRole = fieldUserRole
    if (userCode) filters.userCode = userCode
    if (chainName) filters.chainName = chainName
    if (storeCode) filters.storeCode = storeCode
    if (productCode) filters.productCode = productCode
    if (productCategory) filters.productCategory = productCategory

    const shouldCache = shouldCacheFilters(dateRange || null, startDate, endDate)
    const hasCustomDates = !!(startDate && endDate)
    const cacheDuration = getCacheDuration(dateRange || 'thisMonth', hasCustomDates)

    let data
    if (shouldCache) {
      const cacheKey = generateFilterCacheKey('daily-sales-stores', filters)
      const cachedFetchStores = unstable_cache(
        async () => getStorePerformance(filters),
        [cacheKey],
        {
          revalidate: cacheDuration,
          tags: ['daily-sales-stores']
        }
      )
      data = await cachedFetchStores()
    } else {
      data = await getStorePerformance(filters)
    }

    return NextResponse.json({ 
      stores: data, 
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
    console.error('Error in store performance API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch store performance' },
      { status: 500 }
    )
  }
}
