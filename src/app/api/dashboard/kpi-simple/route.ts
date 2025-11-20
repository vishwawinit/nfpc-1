import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * Ultra-simple KPI API that returns data immediately without complex calculations
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🚀 Simple KPI API called')

    const searchParams = request.nextUrl.searchParams
    const dateRange = searchParams.get('range') || 'thisMonth'
    
    console.log('📊 Simple KPI API with range:', dateRange)

    // Get current date and calculate date range
    const current = new Date()
    let startDate: Date
    let endDate: Date = new Date(current)

    switch(dateRange) {
      case 'today':
        startDate = new Date(current)
        break
      case 'yesterday':
        startDate = new Date(current)
        startDate.setDate(startDate.getDate() - 1)
        endDate = new Date(startDate)
        break
      case 'thisWeek':
        startDate = new Date(current)
        startDate.setDate(startDate.getDate() - 6)
        break
      case 'thisMonth':
        startDate = new Date(current.getFullYear(), current.getMonth(), 1)
        break
      case 'lastMonth':
        startDate = new Date(current.getFullYear(), current.getMonth() - 1, 1)
        endDate = new Date(current.getFullYear(), current.getMonth(), 0)
        break
      case 'thisQuarter':
        const quarter = Math.floor(current.getMonth() / 3)
        startDate = new Date(current.getFullYear(), quarter * 3, 1)
        break
      case 'thisYear':
        startDate = new Date(current.getFullYear(), 0, 1)
        break
      default:
        startDate = new Date(current.getFullYear(), current.getMonth(), 1)
    }

    console.log('📅 Date range:', {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    })

    // Ultra-simple query - using order_total for transaction amounts
    const result = await query(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN order_total > 0 THEN order_total ELSE 0 END) as total_sales,
        SUM(CASE WHEN order_total < 0 THEN ABS(order_total) ELSE 0 END) as total_returns,
        SUM(order_total) as net_sales,
        COUNT(DISTINCT customer_code) as unique_customers,
        SUM(CASE WHEN order_total > 0 THEN COALESCE(quantity_bu, 0) ELSE 0 END) as total_quantity,
        MAX(currency_code) as currency_code
      FROM flat_transactions 
      WHERE DATE(transaction_date) >= $1 AND DATE(transaction_date) <= $2
        AND order_total IS NOT NULL
    `, [
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    ])

    const data = result.rows[0] || {}
    
    console.log('✅ Simple KPI data:', data)

    const kpiData = {
      totalSales: parseFloat(data.total_sales || '0'),
      totalReturns: parseFloat(data.total_returns || '0'),
      netSales: parseFloat(data.net_sales || '0'),
      totalTransactions: parseInt(data.total_transactions || '0'),
      uniqueCustomers: parseInt(data.unique_customers || '0'),
      totalQuantity: parseInt(data.total_quantity || '0'),
      currency: data.currency_code || 'AED',
      
      // Compatibility fields for dashboard
      currentSales: parseFloat(data.net_sales || '0'),
      currentTotalOrders: parseInt(data.total_transactions || '0'),
      currentUniqueCustomers: parseInt(data.unique_customers || '0'),
      currentAvgOrder: parseInt(data.total_transactions || '0') > 0 ? 
        parseFloat(data.net_sales || '0') / parseInt(data.total_transactions || '0') : 0,
      
      // Additional metrics
      dateRange,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      timestamp: new Date().toISOString()
    }

    console.log('🎯 Returning simple KPI data:', kpiData)

    return NextResponse.json({
      success: true,
      data: kpiData,
      cached: false,
      source: 'simple-kpi-query',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Simple KPI API error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch simple KPIs',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 })
  }
}
