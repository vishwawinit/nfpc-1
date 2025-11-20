import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    await db.initialize()
    
    // Check for all possible target tables
    const tablesCheck = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%target%' OR table_name LIKE '%common%')
      ORDER BY table_name
    `)
    
    const foundTables = tablesCheck.rows.map((r: any) => r.table_name)
    
    // If we find a table, get its columns
    let tableInfo: any = null
    if (foundTables.length > 0) {
      const firstTable = foundTables[0]
      const columnsCheck = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1
        ORDER BY ordinal_position
      `, [firstTable])
      
      // Get sample data
      const sampleCheck = await query(`SELECT * FROM ${firstTable} LIMIT 3`)
      
      tableInfo = {
        tableName: firstTable,
        columns: columnsCheck.rows,
        sampleData: sampleCheck.rows
      }
    }
    
    return NextResponse.json({
      success: true,
      foundTables,
      recommendedTable: foundTables.length > 0 ? foundTables[0] : null,
      tableInfo,
      message: foundTables.length === 0 
        ? 'No targets table found. Please create a targets table or check the table name.'
        : `Found ${foundTables.length} target-related table(s). Using: ${foundTables[0]}`
    })
  } catch (error) {
    console.error('Error checking targets table:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to check targets table',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

