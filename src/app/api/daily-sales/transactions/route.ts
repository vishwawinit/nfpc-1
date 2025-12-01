import { NextResponse } from 'next/server'
import { getTransactionDetails } from '@/services/dailySalesService'
import { apiCache } from '@/lib/apiCache'

export const dynamic = 'force-dynamic'
export const revalidate = false // Use manual caching

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // Check cache first - each unique filter combination gets its own cache entry
    const cachedData = apiCache.get('/api/daily-sales/transactions', searchParams)
    if (cachedData) {
      return NextResponse.json({
        ...cachedData,
        cached: true
      })
    }

    const dateRange = searchParams.get('dateRange')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const areaCode = searchParams.get('areaCode')
    const subAreaCode = searchParams.get('subAreaCode')
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
    if (page) filters.page = page
    if (limit) filters.limit = limit

    // Fetch fresh data
    const data = await getTransactionDetails(filters)

    // Store in cache
    apiCache.set('/api/daily-sales/transactions', searchParams, data)

    return NextResponse.json({
      ...data,
      cached: false
    })
  } catch (error) {
    console.error('Error in transaction details API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transaction details' },
      { status: 500 }
    )
  }
}
