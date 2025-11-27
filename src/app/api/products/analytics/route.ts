import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const SALES_TABLE = 'flat_daily_sales_report'

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
    const { searchParams } = new URL(request.url)
    const dateRange = searchParams.get('range') || 'thisMonth'
    const customStartDate = searchParams.get('startDate')
    const customEndDate = searchParams.get('endDate')
    const categoryFilter = searchParams.get('category')
    const productCodeFilter = searchParams.get('productCode')

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

    // Build WHERE conditions
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Date conditions
    conditions.push(`trx_trxdate >= $${paramIndex}::timestamp`)
    params.push(startDate)
    paramIndex++
    conditions.push(`trx_trxdate < ($${paramIndex}::timestamp + INTERVAL '1 day')`)
    params.push(endDate)
    paramIndex++

    // Only include invoices/sales (TrxType = 1)
    conditions.push(`trx_trxtype = 1`)

    // Category filter
    if (categoryFilter) {
      conditions.push(`item_grouplevel1 = $${paramIndex}`)
      params.push(categoryFilter)
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

    // Get product summary data
    const productSummaryQuery = `
      SELECT
        line_itemcode as product_code,
        MAX(line_itemdescription) as product_name,
        COALESCE(MAX(item_grouplevel1), 'Uncategorized') as category,
        COALESCE(MAX(item_brand_description), 'No Brand') as brand,
        COALESCE(MAX(line_uom), 'PCS') as base_uom,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as total_sales,
        SUM(ABS(COALESCE(line_quantitybu, 0))) as total_quantity,
        COUNT(DISTINCT trx_trxcode) as total_orders,
        CASE WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 0
             THEN SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) / SUM(ABS(COALESCE(line_quantitybu, 0)))
             ELSE 0 END as avg_price,
        CASE
          WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 1000 THEN 'Fast'
          WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 100 THEN 'Medium'
          WHEN SUM(ABS(COALESCE(line_quantitybu, 0))) > 0 THEN 'Slow'
          ELSE 'No Sales'
        END as movement_status,
        COALESCE(MAX(trx_currencycode), 'AED') as currency_code
      FROM ${SALES_TABLE}
      ${whereClause}
      GROUP BY line_itemcode
      ORDER BY SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) DESC
    `

    const productResult = await query(productSummaryQuery, params)
    const products = productResult.rows

    // Calculate overall metrics
    const totalProducts = products.length
    const activeProducts = products.length
    const totalSales = products.reduce((sum, p) => sum + parseFloat(p.total_sales || '0'), 0)
    const totalQuantity = products.reduce((sum, p) => sum + parseFloat(p.total_quantity || '0'), 0)
    const fastMoving = products.filter(p => p.movement_status === 'Fast').length
    const slowMoving = products.filter(p => p.movement_status === 'Slow').length
    const noSales = products.filter(p => p.movement_status === 'No Sales').length

    // Helper function to check if value is valid
    const isValidValue = (value: string | null | undefined): boolean => {
      if (!value) return false
      const normalized = value.trim().toLowerCase()
      return normalized !== '' &&
             normalized !== 'unknown' &&
             normalized !== 'n/a' &&
             normalized !== 'null' &&
             normalized !== 'na' &&
             normalized !== 'uncategorized'
    }

    // Brand/Category analysis
    const categoryData = products.reduce((acc: any, product) => {
      const category = product.category
      if (!isValidValue(category)) return acc

      if (!acc[category]) {
        acc[category] = {
          products: 0,
          sales: 0,
          quantity: 0
        }
      }
      acc[category].products++
      acc[category].sales += parseFloat(product.total_sales || '0')
      acc[category].quantity += parseFloat(product.total_quantity || '0')
      return acc
    }, {})

    const salesByBrand = Object.entries(categoryData)
      .map(([brand, data]: [string, any]) => ({
        brand,
        sales: data.sales,
        products: data.products,
        quantity: data.quantity
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10)

    const categorySalesDistribution = Object.entries(categoryData)
      .map(([category, data]: [string, any]) => ({
        category,
        sales: data.sales,
        products: data.products,
        quantity: data.quantity,
        percentage: totalSales > 0 ? (data.sales / totalSales * 100) : 0
      }))
      .sort((a, b) => b.sales - a.sales)

    // Top products
    const topProducts = products
      .filter(p => parseFloat(p.total_sales || '0') > 0)
      .slice(0, 20)
      .map(product => ({
        productCode: product.product_code,
        productName: product.product_name || 'N/A',
        category: isValidValue(product.category) ? product.category : 'Uncategorized',
        brand: isValidValue(product.brand) ? product.brand : 'No Brand',
        sales: parseFloat(product.total_sales || '0'),
        quantity: parseFloat(product.total_quantity || '0'),
        avgPrice: parseFloat(product.avg_price || '0'),
        movementStatus: product.movement_status,
        currencyCode: product.currency_code || 'AED'
      }))

    const data = {
      metrics: {
        totalProducts,
        activeProducts,
        totalSales,
        totalQuantity,
        fastMoving,
        slowMoving,
        noSales,
        currencyCode: 'AED'
      },
      salesByBrand,
      categorySalesDistribution,
      topProducts
    }

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    })

  } catch (error) {
    console.error('Product analytics API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch product analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
