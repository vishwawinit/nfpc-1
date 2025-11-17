import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * Ultra-simple products API for testing
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔬 Testing simple products query...')

    // Use the simplest possible query
    const result = await query(`
      SELECT 
        product_code,
        product_name,
        net_amount,
        quantity_bu,
        transaction_date
      FROM flat_transactions 
      WHERE net_amount > 0 AND product_code IS NOT NULL
      ORDER BY net_amount DESC 
      LIMIT 10
    `)

    console.log(`✅ Simple products query returned ${result.rows.length} rows`)
    
    const products = result.rows.map(row => ({
      productCode: row.product_code,
      productName: row.product_name || 'Unknown Product',
      salesAmount: parseFloat(row.net_amount || '0'),
      quantitySold: parseInt(row.quantity_bu || '0'),
      lastSoldDate: row.transaction_date
    }))

    return NextResponse.json({
      success: true,
      data: products,
      message: 'Simple products query successful',
      count: products.length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Simple products test failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch simple products',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 })
  }
}
