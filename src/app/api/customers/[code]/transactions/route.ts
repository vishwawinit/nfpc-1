import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { resolveTransactionsTable, getTransactionColumnExpressions } from '@/services/dailySalesService'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Date range helper
function getDateRange(rangeStr: string) {
  const now = new Date()
  let startDate: Date, endDate: Date
  
  switch (rangeStr) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0))
      endDate = new Date(now.setHours(23, 59, 59, 999))
      break
    case 'yesterday':
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      startDate = new Date(yesterday.setHours(0, 0, 0, 0))
      endDate = new Date(yesterday.setHours(23, 59, 59, 999))
      break
    case 'thisWeek':
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay())
      startDate = new Date(weekStart.setHours(0, 0, 0, 0))
      endDate = new Date(now)
      break
    case 'thisMonth':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now)
      break
    case 'lastMonth':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      endDate = new Date(now.getFullYear(), now.getMonth(), 0)
      break
    case 'thisQuarter':
      const quarter = Math.floor(now.getMonth() / 3)
      startDate = new Date(now.getFullYear(), quarter * 3, 1)
      endDate = new Date(now)
      break
    case 'lastQuarter':
      const lastQuarter = Math.floor(now.getMonth() / 3) - 1
      startDate = new Date(now.getFullYear(), lastQuarter * 3, 1)
      endDate = new Date(now.getFullYear(), lastQuarter * 3 + 3, 0)
      break
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now)
  }
  
  return {
    startStr: startDate.toISOString().split('T')[0],
    endStr: endDate.toISOString().split('T')[0]
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    await db.initialize()
    
    const customerCode = params.code
    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get('range') || 'thisMonth'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    
    let startDate: string
    let endDate: string
    
    if (startDateParam && endDateParam) {
      // Custom date range
      startDate = startDateParam
      endDate = endDateParam
    } else {
      // Preset date range
      const dateResult = getDateRange(range)
      startDate = dateResult.startStr
      endDate = dateResult.endStr
    }
    
    // Get table info and column expressions
    const tableInfo = await resolveTransactionsTable()
    const transactionsTable = tableInfo.name
    const col = getTransactionColumnExpressions(tableInfo.columns)
    
    // Get transactions for the customer with proper joins to get names
    const transactionsQuery = `
      SELECT 
        ${col.trxCode} as "transactionId",
        ${col.trxDateOnly} as "transactionDate",
        t.product_code as "productCode",
        COALESCE(p.product_name, t.product_name, t.product_code) as "productName",
        ${col.quantityValue} as "quantity",
        ${col.unitPriceValue} as "unitPrice",
        (${col.quantityValue} * ${col.unitPriceValue}) as "totalAmount",
        ${col.discountValue} as "discount",
        ${col.netAmountValue} as "netAmount",
        COALESCE(t.transaction_type_name, 'Sales Order') as "orderType",
        COALESCE(c.customer_name, 'Unknown') as "customerName",
        COALESCE(c.state, 'Unknown') as "region",
        COALESCE(c.city, 'Unknown') as "city",
        COALESCE(c.customer_type, 'Unknown') as "chain",
        COALESCE(c.sales_person_code, 'Unknown') as "tlCode",
        COALESCE(c.sales_person_code, 'Unknown') as "tlName",
        ${col.fieldUserCode === 'NULL' ? 'NULL' : `COALESCE(t.${col.fieldUserCode}, 'Unknown')`} as "fieldUserCode",
        ${col.fieldUserName === 'NULL' ? 'NULL' : `COALESCE(t.${col.fieldUserName}, 'Unknown')`} as "fieldUserName"
      FROM ${transactionsTable} t
      LEFT JOIN flat_customers_master c ON t.${col.storeCode} = c.customer_code
      LEFT JOIN flat_products_master p ON t.product_code = p.product_code
      WHERE t.${col.storeCode} = $1
        AND ${col.trxDateOnly} >= $2
        AND ${col.trxDateOnly} <= $3
      ORDER BY ${col.trxDateOnly} DESC
      LIMIT 1000
    `
    
    const transactionsResult = await query(transactionsQuery, [customerCode, startDate, endDate])
    
    // Get summary statistics
    const summaryQuery = `
      SELECT 
        SUM(${col.netAmountValue}) as "totalSales",
        COUNT(DISTINCT ${col.trxCode}) as "totalOrders",
        AVG(${col.netAmountValue}) as "avgOrderValue",
        COUNT(DISTINCT t.product_code) as "uniqueProducts",
        MAX(${col.trxDateOnly}) as "lastOrderDate",
        MIN(${col.trxDateOnly}) as "firstOrderDate"
      FROM ${transactionsTable} t
      WHERE ${col.storeCode} = $1
        AND ${col.trxDateOnly} >= $2
        AND ${col.trxDateOnly} <= $3
    `
    
    const summaryResult = await query(summaryQuery, [customerCode, startDate, endDate])
    
    const summary = summaryResult.rows[0] || {
      totalSales: 0,
      totalOrders: 0,
      avgOrderValue: 0,
      uniqueProducts: 0,
      lastOrderDate: null,
      firstOrderDate: null
    }
    
    return NextResponse.json({
      success: true,
      data: {
        transactions: transactionsResult.rows,
        summary: {
          totalSales: parseFloat(summary.totalSales || '0'),
          totalOrders: parseInt(summary.totalOrders || '0'),
          avgOrderValue: parseFloat(summary.avgOrderValue || '0'),
          uniqueProducts: parseInt(summary.uniqueProducts || '0'),
          lastOrderDate: summary.lastOrderDate,
          firstOrderDate: summary.firstOrderDate
        }
      },
      dateRange: {
        start: startDate,
        end: endDate,
        label: range
      }
    })
    
  } catch (error) {
    console.error('Customer transactions API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
