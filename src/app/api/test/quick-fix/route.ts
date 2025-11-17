import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * Quick test API to check if our basic queries work
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing basic queries...')

    // Test 1: Basic KPI query (simplified)
    const kpiTest = await query(`
      SELECT
        COALESCE(SUM(CASE WHEN t.net_amount >= 0 THEN t.net_amount ELSE 0 END), 0) as total_sales,
        COUNT(DISTINCT t.customer_code) as unique_customers,
        COUNT(DISTINCT t.transaction_code) as total_orders
      FROM flat_transactions t
      WHERE DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '30 days'
    `)

    // Test 2: Basic top customers (simplified)
    const customersTest = await query(`
      SELECT
        t.customer_code as "customerCode",
        MAX(t.customer_name) as "customerName",
        ROUND(SUM(t.net_amount), 2) as "totalSales",
        COUNT(*) as "totalOrders"
      FROM flat_transactions t
      WHERE DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY t.customer_code
      ORDER BY ABS(SUM(t.net_amount)) DESC
      LIMIT 5
    `)

    // Test 3: Basic top products (simplified)
    const productsTest = await query(`
      SELECT
        t.product_code as "productCode",
        MAX(t.product_name) as "productName",
        ROUND(SUM(t.net_amount), 2) as "salesAmount",
        COUNT(*) as "totalOrders"
      FROM flat_transactions t
      WHERE DATE(t.transaction_date) >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY t.product_code
      ORDER BY ABS(SUM(t.net_amount)) DESC
      LIMIT 5
    `)

    return NextResponse.json({
      success: true,
      message: 'Basic queries working!',
      data: {
        kpiTest: kpiTest.rows[0],
        customersTest: customersTest.rows,
        productsTest: productsTest.rows,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('❌ Quick test failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Quick test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
