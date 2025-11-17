import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * Ultra-simple customers API for testing
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔬 Testing simple customers query...')

    // Use the simplest possible query
    const result = await query(`
      SELECT 
        customer_code,
        customer_name,
        net_amount,
        transaction_date
      FROM flat_transactions 
      WHERE net_amount > 0
      ORDER BY net_amount DESC 
      LIMIT 10
    `)

    console.log(`✅ Simple customers query returned ${result.rows.length} rows`)
    
    const customers = result.rows.map(row => ({
      customerCode: row.customer_code,
      customerName: row.customer_name || 'Unknown',
      totalSales: parseFloat(row.net_amount || '0'),
      lastOrderDate: row.transaction_date
    }))

    return NextResponse.json({
      success: true,
      data: customers,
      message: 'Simple customers query successful',
      count: customers.length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Simple customers test failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch simple customers',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 })
  }
}
