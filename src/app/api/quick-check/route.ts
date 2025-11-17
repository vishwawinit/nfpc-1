import { NextResponse } from 'next/server'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * Quick Check API - Shows if database has data
 * Usage: http://localhost:3000/api/quick-check
 */
export async function GET() {
  try {
    // Check which table exists
    const tableCheck = await query(`
      SELECT 
        to_regclass('public.flat_transactions') as ft,
        to_regclass('public.flat_sales_transactions') as fst
    `)
    
    const useFlatSalesTransactions = !!tableCheck.rows[0].fst
    const transactionTable = useFlatSalesTransactions ? 'flat_sales_transactions' : 'flat_transactions'
    
    // Get column info
    const columnsResult = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
    `, [transactionTable])
    const columns = columnsResult.rows.map(r => r.column_name)
    
    // Determine column names
    const dateCol = columns.includes('trx_date_only') ? 'trx_date_only' : 'DATE(transaction_date)'
    
    // Get quick stats
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        MIN(${dateCol}) as min_date,
        MAX(${dateCol}) as max_date,
        COUNT(DISTINCT ${dateCol}) as unique_dates
      FROM ${transactionTable}
    `
    const stats = await query(statsQuery)
    const data = stats.rows[0]
    
    // Format response
    const hasData = parseInt(data.total) > 0
    const result = {
      status: hasData ? 'HAS_DATA' : 'EMPTY',
      message: hasData 
        ? '✅ Database has data!' 
        : '❌ Database is empty',
      table: transactionTable,
      totalRecords: parseInt(data.total),
      dateRange: hasData ? {
        from: data.min_date,
        to: data.max_date,
        daysWithData: parseInt(data.unique_dates)
      } : null,
      recommendation: hasData
        ? `Use dates between ${data.min_date} and ${data.max_date} in the Daily Sales Report.`
        : 'Import data into the database first.',
      nextStep: hasData
        ? 'Go to http://localhost:3000/diagnose for full diagnostic'
        : 'Contact database admin to load data'
    }
    
    return NextResponse.json(result, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
    
  } catch (error) {
    console.error('Quick check error:', error)
    return NextResponse.json({
      status: 'ERROR',
      message: '❌ Cannot connect to database',
      error: error instanceof Error ? error.message : 'Unknown error',
      recommendation: 'Check database connection settings in .env file',
      nextStep: 'Verify PGHOST, PGDATABASE, PGUSER, PGPASSWORD environment variables'
    }, { 
      status: 500 
    })
  }
}

