import { NextResponse } from 'next/server'
import { getDailyTrend } from '@/services/dailySalesService'
import { unstable_cache } from 'next/cache'
import { shouldCacheFilters, generateFilterCacheKey, getCacheControlHeader, getCacheDuration } from '@/lib/cache-utils'

// Enable caching with revalidation
export const dynamic = 'auto'
export const revalidate = 300 // Fallback: 5 minutes

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateRange = searchParams.get('dateRange')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const areaCode = searchParams.get('areaCode')
    const subAreaCode = searchParams.get('subAreaCode')
    const regionCode = searchParams.get('regionCode') // backward compatibility
    const cityCode = searchParams.get('cityCode') // backward compatibility
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
    if (areaCode) filters.areaCode = areaCode
    if (subAreaCode) filters.subAreaCode = subAreaCode
    if (regionCode) filters.regionCode = regionCode
    if (cityCode) filters.cityCode = cityCode
    if (teamLeaderCode) filters.teamLeaderCode = teamLeaderCode
    if (fieldUserRole) filters.fieldUserRole = fieldUserRole
    if (userCode) filters.userCode = userCode
    if (chainName) filters.chainName = chainName
    if (storeCode) filters.storeCode = storeCode
    if (productCode) filters.productCode = productCode
    if (productCategory) filters.productCategory = productCategory

    const shouldCache = shouldCacheFilters(dateRange || null, startDate, endDate)
    const hasCustomDates = !!(startDate && endDate)
    const cacheDuration = getCacheDuration(dateRange || 'thisMonth', hasCustomDates, startDate, endDate)

    let data
    if (shouldCache) {
      const cacheKey = generateFilterCacheKey('daily-sales-trend', filters)
      const cachedFetchTrend = unstable_cache(
        async () => getDailyTrend(filters),
        [cacheKey],
        {
          revalidate: cacheDuration,
          tags: ['daily-sales-trend']
        }
      )
      data = await cachedFetchTrend()
    } else {
      data = await getDailyTrend(filters)
    }

    return NextResponse.json({ 
      trend: data, 
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
    console.error('Error in daily trend API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch daily trend' },
      { status: 500 }
    )
  }
}
