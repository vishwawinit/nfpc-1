import { NextResponse } from 'next/server'
import { getDailySalesSummary } from '@/services/dailySalesService'
import { getCacheDuration, getCacheControlHeader } from '@/lib/cache-utils'

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
    // loginUserCode is accepted but no auth/hierarchy filtering is applied in local mode

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

    const data = await getDailySalesSummary(filters)
    
    // Calculate cache duration based on date range
    const hasCustomDates = !!(startDate && endDate)
    const cacheDuration = getCacheDuration(dateRange || 'thisMonth', hasCustomDates)
    
    return NextResponse.json({
      ...data,
      cached: true,
      cacheInfo: {
        duration: cacheDuration,
        dateRange: dateRange || 'thisMonth',
        hasCustomDates
      }
    }, {
      headers: {
        'Cache-Control': getCacheControlHeader(cacheDuration)
      }
    })
  } catch (error) {
    console.error('Error in daily sales summary API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch daily sales summary' },
      { status: 500 }
    )
  }
}
