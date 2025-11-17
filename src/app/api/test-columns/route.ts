import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * Test actual database columns
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Testing actual database columns...')

    // Test: Get column names from flat_transactions
    const columnsTest = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'flat_transactions' 
      ORDER BY column_name
    `)
    console.log('📋 flat_transactions columns:', columnsTest.rows)

    // Test: Get sample record to see actual data
    const sampleRecord = await query(`
      SELECT * 
      FROM flat_transactions 
      LIMIT 1
    `)
    console.log('📄 Sample record structure:', Object.keys(sampleRecord.rows[0] || {}))

    // Test: Check non-zero quantity data
    const quantityCheck = await query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN quantity_bu > 0 THEN 1 END) as positive_qty,
        COUNT(CASE WHEN quantity_bu < 0 THEN 1 END) as negative_qty,
        COUNT(CASE WHEN quantity_bu = 0 THEN 1 END) as zero_qty,
        MIN(quantity_bu) as min_qty,
        MAX(quantity_bu) as max_qty
      FROM flat_transactions
    `)
    console.log('📊 Quantity analysis:', quantityCheck.rows[0])

    return NextResponse.json({
      success: true,
      columns: columnsTest.rows,
      sampleColumns: Object.keys(sampleRecord.rows[0] || {}),
      quantityAnalysis: quantityCheck.rows[0],
      message: "Check console for column details"
    })

  } catch (error) {
    console.error('🚨 Column test error:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Column test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
