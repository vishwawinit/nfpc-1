import { NextResponse } from 'next/server'
import { query, db } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * Diagnostic endpoint to check tblCommonTarget schema
 */
export async function GET() {
  try {
    await db.initialize()

    // Check if table exists and get its columns
    const schemaResult = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tblCommonTarget'
         OR table_name = 'tblcommontarget'
      ORDER BY table_name, ordinal_position
    `)

    // Try to get a sample row
    let sampleRow = null
    try {
      const sampleResult = await query(`SELECT * FROM "tblCommonTarget" LIMIT 1`)
      sampleRow = sampleResult.rows[0]
    } catch (e) {
      // Try without quotes
      try {
        const sampleResult2 = await query(`SELECT * FROM tblcommon target LIMIT 1`)
        sampleRow = sampleResult2.rows[0]
      } catch (e2) {
        // Ignore
      }
    }

    return NextResponse.json({
      success: true,
      columns: schemaResult.rows,
      sampleRowColumns: sampleRow ? Object.keys(sampleRow) : [],
      sampleRow: sampleRow || 'No data'
    })
  } catch (error) {
    console.error('Schema check error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
