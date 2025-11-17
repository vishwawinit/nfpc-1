import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * Ultra-simple KPI API for testing
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔬 Testing simple KPI query...')

    // Use the simplest possible aggregation
    const result = await query(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(net_amount) as total_sales,
        COUNT(DISTINCT customer_code) as unique_customers,
        AVG(net_amount) as avg_transaction_value
      FROM flat_transactions 
      WHERE net_amount > 0
    `)

    console.log(`✅ Simple KPI query successful`)
    
    const kpi = result.rows[0]
    const kpiData = {
      totalSales: parseFloat(kpi.total_sales || '0'),
      totalTransactions: parseInt(kpi.total_transactions || '0'),
      uniqueCustomers: parseInt(kpi.unique_customers || '0'),
      avgTransactionValue: parseFloat(kpi.avg_transaction_value || '0'),
      currency: 'AED'
    }

    return NextResponse.json({
      success: true,
      data: kpiData,
      message: 'Simple KPI query successful',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Simple KPI test failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch simple KPIs',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 })
  }
}
