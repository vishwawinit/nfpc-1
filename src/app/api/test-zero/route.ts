import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * Test if all data has zero net_amount
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing for zero-value data...')

    // Test: Check if all net_amount are zero
    const zeroCheck = await query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN net_amount = 0 THEN 1 END) as zero_amount,
        COUNT(CASE WHEN net_amount > 0 THEN 1 END) as positive_amount,
        COUNT(CASE WHEN net_amount < 0 THEN 1 END) as negative_amount,
        MIN(net_amount) as min_amount,
        MAX(net_amount) as max_amount,
        AVG(net_amount) as avg_amount
      FROM flat_transactions
    `)
    console.log('📊 Amount analysis:', zeroCheck.rows[0])

    // If all amounts are zero, get top customers by quantity instead
    const topByQuantity = await query(`
      SELECT 
        customer_code,
        customer_name,
        SUM(ABS(quantity_bu)) as total_quantity,
        COUNT(*) as transaction_count
      FROM flat_transactions 
      WHERE quantity_bu != 0 AND customer_code IS NOT NULL
      GROUP BY customer_code, customer_name
      ORDER BY SUM(ABS(quantity_bu)) DESC 
      LIMIT 5
    `)
    console.log('📦 Top customers by quantity:', topByQuantity.rows)

    // Top products by quantity
    const topProductsByQty = await query(`
      SELECT 
        product_code,
        product_name,
        SUM(ABS(quantity_bu)) as total_quantity,
        COUNT(*) as transaction_count
      FROM flat_transactions 
      WHERE quantity_bu != 0 AND product_code IS NOT NULL
      GROUP BY product_code, product_name
      ORDER BY SUM(ABS(quantity_bu)) DESC 
      LIMIT 5
    `)
    console.log('🏆 Top products by quantity:', topProductsByQty.rows)

    return NextResponse.json({
      success: true,
      analysis: zeroCheck.rows[0],
      topCustomersByQuantity: topByQuantity.rows,
      topProductsByQuantity: topProductsByQty.rows,
      message: "Check console for detailed analysis"
    })

  } catch (error) {
    console.error('🚨 Zero test error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Zero test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
