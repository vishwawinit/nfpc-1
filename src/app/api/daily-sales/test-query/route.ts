import { NextResponse } from 'next/server'
import { query } from '@/lib/database'
import { resolveTransactionsTable, getTransactionColumnExpressions } from '@/services/dailySalesService'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate') || '2025-07-13'
    const endDate = searchParams.get('endDate') || '2025-11-17'
    
    const { name: transactionsTable, columns } = await resolveTransactionsTable()
    const col = getTransactionColumnExpressions(columns)
    
    console.log('🔍 Testing query with columns:', {
      trxDateOnly: col.trxDateOnly,
      trxCode: col.trxCode,
      storeCode: col.storeCode,
      netAmount: col.netAmountValue
    })
    
    // Simple test query
    const testSql = `
      SELECT 
        COUNT(*) as total_count,
        MIN(${col.trxDateOnly}) as min_date,
        MAX(${col.trxDateOnly}) as max_date
      FROM ${transactionsTable} t
      WHERE ${col.trxDateOnly} >= $1 AND ${col.trxDateOnly} <= $2
    `
    
    console.log('📊 Executing test query...')
    const startTime = Date.now()
    const result = await query(testSql, [startDate, endDate])
    const endTime = Date.now()
    
    return NextResponse.json({
      success: true,
      table: transactionsTable,
      columns: Array.from(columns),
      columnExpressions: col,
      testQuery: {
        sql: testSql,
        params: [startDate, endDate],
        executionTime: `${endTime - startTime}ms`,
        result: result.rows[0]
      }
    })
    
  } catch (error) {
    console.error('❌ Test query error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

