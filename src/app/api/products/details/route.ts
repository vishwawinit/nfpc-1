import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { getAssetBaseUrl } from '@/lib/utils'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const SALES_TABLE = 'flat_daily_sales_report'
// Updated to remove item_imagepath column reference

// Helper function to parse date range string
const getDateRangeFromString = (dateRange: string) => {
  const current = new Date()
  let startDate: Date = new Date(current)
  let endDate: Date = new Date(current)

  switch(dateRange) {
    case 'today':
      startDate = new Date(current)
      endDate = new Date(current)
      break
    case 'yesterday':
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 1)
      endDate = new Date(startDate)
      break
    case 'thisWeek':
    case 'last7Days':
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 6)
      endDate = new Date(current)
      break
    case 'last30Days':
    case 'thisMonth':
      startDate = new Date(current.getFullYear(), current.getMonth(), 1)
      endDate = new Date(current)
      break
    case 'lastMonth':
      startDate = new Date(current.getFullYear(), current.getMonth() - 1, 1)
      endDate = new Date(current.getFullYear(), current.getMonth(), 0)
      break
    case 'thisQuarter':
      const quarter = Math.floor(current.getMonth() / 3)
      startDate = new Date(current.getFullYear(), quarter * 3, 1)
      endDate = new Date(current)
      break
    case 'lastQuarter':
      const lastQuarter = Math.floor(current.getMonth() / 3) - 1
      startDate = new Date(current.getFullYear(), lastQuarter * 3, 1)
      endDate = new Date(current.getFullYear(), lastQuarter * 3 + 3, 0)
      break
    case 'thisYear':
      startDate = new Date(current.getFullYear(), 0, 1)
      endDate = new Date(current)
      break
    default:
      startDate = new Date(current)
      startDate.setDate(startDate.getDate() - 29)
      endDate = new Date(current)
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('📦 Products Details API - Starting request...')
    const { searchParams } = new URL(request.url)
    const dateRange = searchParams.get('range') || 'thisMonth'
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')
    const channelFilter = searchParams.get('channel')
    const productCodeFilter = searchParams.get('productCode')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '25')
    const sortBy = searchParams.get('sortBy') || 'total_sales'
    const sortOrder = searchParams.get('sortOrder') || 'DESC'

    // Get date range
    let startDate: string, endDate: string
    if (customStartDate && customEndDate) {
      startDate = customStartDate
      endDate = customEndDate
    } else {
      const dateRangeResult = getDateRangeFromString(dateRange)
      startDate = dateRangeResult.startDate
      endDate = dateRangeResult.endDate
    }

    console.log('📦 Products Details - Params:', {
      dateRange,
      customStartDate,
      customEndDate,
      channelFilter,
      productCodeFilter,
      page,
      limit,
      sortBy,
      sortOrder,
      dateFilter: { startDate, endDate }
    })

    // Build WHERE conditions
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Date conditions - optimized for index usage
    conditions.push(`trx_trxdate >= $${paramIndex}::date`)
    params.push(startDate)
    paramIndex++
    conditions.push(`trx_trxdate <= $${paramIndex}::date`)
    params.push(endDate)
    paramIndex++

    // Only include invoices/sales (TrxType = 1)
    conditions.push(`trx_trxtype = 1`)

    // Channel filter
    if (channelFilter) {
      conditions.push(`customer_channel_description = $${paramIndex}`)
      params.push(channelFilter)
      paramIndex++
    }

    // Product code filter
    if (productCodeFilter) {
      conditions.push(`line_itemcode = $${paramIndex}`)
      params.push(productCodeFilter)
      paramIndex++
    }

    // Base conditions
    conditions.push('line_itemcode IS NOT NULL')
    conditions.push('COALESCE(line_quantitybu, 0) != 0')

    const whereClause = `WHERE ${conditions.join(' AND ')}`

    // Map sortBy to actual column names
    const sortByColumnMap: Record<string, string> = {
      'product_code': 'product_code',
      'product_name': 'product_name',
      'category': 'category',
      'total_sales': 'total_sales',
      'total_quantity': 'total_quantity',
      'avg_price': 'avg_price'
    }
    const orderByColumn = sortByColumnMap[sortBy] || 'total_sales'

    // Calculate offset for pagination
    const offset = (page - 1) * limit

    // Get product details - Simple direct query without expensive COUNT
    const productDetailsQuery = `
      SELECT
        line_itemcode as product_code,
        MAX(line_itemdescription) as product_name,
        COALESCE(MAX(item_grouplevel1), 'Uncategorized') as category,
        COALESCE(MAX(item_grouplevel2), 'No Subcategory') as subcategory,
        COALESCE(MAX(item_brand_description), 'No Brand') as brand,
        COALESCE(MAX(line_uom), 'PCS') as base_uom,
        '' as image_path,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as total_sales,
        SUM(ABS(COALESCE(line_quantitybu, 0))) as total_quantity,
        COUNT(DISTINCT trx_trxcode) as total_orders,
        CASE WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 0
             THEN SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) / SUM(ABS(COALESCE(line_quantitybu, 0)))
             ELSE 0 END as avg_price,
        MAX(line_baseprice) as max_price,
        MIN(CASE WHEN line_baseprice > 0 THEN line_baseprice ELSE NULL END) as min_price,
        CASE
          WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 1000 THEN 'Fast'
          WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 100 THEN 'Medium'
          WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 0 THEN 'Slow'
          ELSE 'No Sales'
        END as movement_status,
        true as is_active,
        false as is_delist,
        COALESCE(MAX(trx_currencycode), 'AED') as currency_code
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY line_itemcode
      ORDER BY ${orderByColumn} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    params.push(limit)
    params.push(offset)

    // Execute product details query
    console.log('📦 Products Details - Executing query...')
    const queryStart = Date.now()

    const productResult = await query(productDetailsQuery, params)

    const queryDuration = Date.now() - queryStart
    console.log(`📦 Products Details - Query completed in ${queryDuration}ms, returned ${productResult.rows.length} products`)

    // For pagination, we estimate total based on whether we got a full page
    // This avoids the expensive COUNT(DISTINCT) query
    const hasMore = productResult.rows.length === limit
    const estimatedTotal = hasMore ? (page * limit) + limit : ((page - 1) * limit) + productResult.rows.length
    const totalCount = estimatedTotal

    // Helper function to clean values
    const cleanValue = (value: any, defaultValue: string = '-'): string => {
      if (!value) return defaultValue
      const normalized = String(value).trim().toLowerCase()
      if (normalized === '' || normalized === 'unknown' || normalized === 'n/a' || normalized === 'null' || normalized === 'na') {
        return defaultValue
      }
      return String(value).trim()
    }

    // Helper to convert image path to full URL
    const getImageUrl = (imagePath: string | null): string => {
      if (!imagePath) return ''
      const path = String(imagePath).trim()
      if (!path) return ''

      const base = getAssetBaseUrl().replace(/\/$/, '') + '/'
      // Convert relative paths to NFPC asset base
      if (path.startsWith('../')) {
        return base + path.substring(3)
      } else if (path.startsWith('./')) {
        return base + path.substring(2)
      } else if (path.startsWith('Data/')) {
        return base + path
      } else if (path.startsWith('/Data/')) {
        return base.replace(/\/$/, '') + path
      }
      return path
    }

    // Format product data
    const products = productResult.rows.map(product => ({
      productCode: product.product_code || '-',
      productName: cleanValue(product.product_name, 'Unnamed Product'),
      category: cleanValue(product.category, 'Uncategorized'),
      subcategory: cleanValue(product.subcategory, '-'),
      productGroup: cleanValue(product.category, '-'),
      brand: cleanValue(product.brand, 'No Brand'),
      baseUom: cleanValue(product.base_uom, 'Unit'),
      imageUrl: getImageUrl(product.image_path),
      maxPrice: parseFloat(product.max_price || '0'),
      minPrice: parseFloat(product.min_price || '0'),
      totalSales: parseFloat(product.total_sales || '0'),
      totalQuantity: parseFloat(product.total_quantity || '0'),
      totalOrders: parseInt(product.total_orders || '0'),
      avgPrice: parseFloat(product.avg_price || '0'),
      movementStatus: product.movement_status,
      isActive: product.is_active === true,
      isDelist: product.is_delist === true,
      currencyCode: product.currency_code || 'AED'
    }))

    const totalPages = Math.ceil(totalCount / limit)

    return NextResponse.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      },
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    })

  } catch (error) {
    console.error('Product details API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch product details',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
