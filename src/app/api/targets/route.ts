import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { resolveTransactionsTable, getTransactionColumnExpressions } from '@/services/dailySalesService'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Enable ISR with 60 second revalidation
export const revalidate = 60

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    // Authentication removed - no user validation needed
    
    await db.initialize()
    
    // Detect which targets table exists - with better error handling
    let targetsTable: string | null = null
    
    // Try to directly query each potential table - simplest approach
    const potentialTables = ['tblcommontarget', 'flat_targets']
    
    for (const tableName of potentialTables) {
      try {
        // Try a simple SELECT 1 query to see if table exists
        await query(`SELECT 1 FROM ${tableName} LIMIT 1`)
        targetsTable = tableName
        console.log(`✅ Found targets table: ${tableName}`)
        break
      } catch (e: any) {
        // Table doesn't exist or query failed - continue to next
        if (e?.message?.includes('does not exist')) {
          // Expected - table doesn't exist
          continue
        }
        // Other error - log but continue
        console.warn(`Could not access table ${tableName}:`, e?.message)
      }
    }
    
    // If still not found, search information_schema
    if (!targetsTable) {
      try {
        const tablesCheck = await query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND (table_name LIKE '%target%' OR table_name LIKE '%common%')
          ORDER BY table_name
        `)
        if (tablesCheck.rows.length > 0) {
          const foundTable = tablesCheck.rows[0].table_name
          // Verify we can actually query it
          try {
            await query(`SELECT 1 FROM ${foundTable} LIMIT 1`)
            targetsTable = foundTable
            console.log(`⚠️ Using detected targets table: ${targetsTable}`)
          } catch (e) {
            console.warn(`Detected table ${foundTable} but cannot query it:`, e)
          }
        }
      } catch (e) {
        console.warn('Could not search for target tables:', e)
      }
    }
    
    // If no targets table found, return empty data
    if (!targetsTable) {
      console.warn('⚠️ No targets table found. Returning empty data.')
      return NextResponse.json({
        success: true,
        data: [],
        summary: {
          totalTargets: 0,
          totalTargetAmount: 0,
          totalAchievement: 0,
          overallAchievementPercentage: 0,
          targetsAchieved: 0,
          targetsNotAchieved: 0
        },
        count: 0,
        timestamp: new Date().toISOString(),
        source: 'postgresql - no targets table found',
        message: 'No targets table found in database. Please check if tblcommontarget or flat_targets table exists.'
      })
    }
    
    // Get table info and column expressions for transactions
    const tableInfo = await resolveTransactionsTable()
    const transactionsTable = tableInfo.name
    const col = getTransactionColumnExpressions(tableInfo.columns)
    
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1
    
    // Authentication removed - no hierarchy filtering

    // Use tblcommontarget table - map filters to actual column names
    if (searchParams.has('year')) {
      conditions.push(`t.year = $${paramIndex}`)
      params.push(parseInt(searchParams.get('year')!))
      paramIndex++
    }

    if (searchParams.has('month')) {
      conditions.push(`t.month = $${paramIndex}`)
      params.push(parseInt(searchParams.get('month')!))
      paramIndex++
    }

    if (searchParams.has('userCode')) {
      // Use salesmancode from tblcommontarget
      conditions.push(`t.salesmancode = $${paramIndex}`)
      params.push(searchParams.get('userCode'))
      paramIndex++
    }

    // Note: tblcommontarget doesn't have customer_code or tl_code columns
    // These filters will be ignored if the table doesn't support them
    if (searchParams.has('customerCode')) {
      // tblcommontarget doesn't have customer_code - skip this filter
      console.warn('⚠️ customerCode filter not supported by tblcommontarget table')
    }

    if (searchParams.has('teamLeaderCode')) {
      // tblcommontarget doesn't have tl_code - skip this filter
      console.warn('⚠️ teamLeaderCode filter not supported by tblcommontarget table')
    }

    // Always include isactive filter
    conditions.push(`t.isactive = true`)
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    // No limit - get ALL data for comprehensive reporting
    const limit = parseInt(searchParams.get('limit') || '100000')

    // Query to get targets with achievement data from sales transactions
    // Use dynamic table and column expressions
    let dateExpr: string
    if (col.trxDateOnly.startsWith('DATE(')) {
      // Handle DATE() function - replace table alias
      dateExpr = col.trxDateOnly.replace(/t\.transaction_date/g, 's.transaction_date')
        .replace(/t\.trx_date/g, 's.trx_date')
    } else {
      // Handle column name - add table alias
      const colName = col.trxDateOnly.replace('t.', '')
      dateExpr = `s.${colName}`
    }
    
    // Build JOIN conditions properly
    const userCodeJoin = col.fieldUserCode === 'NULL' 
      ? 's.user_code' 
      : col.fieldUserCode.replace(/t\./g, 's.')
    
    const storeCodeJoin = col.storeCode.replace(/t\./g, 's.')
    
    // Build net amount expression for sales table
    const netAmountExpr = col.netAmountValue.replace(/t\./g, 's.')
    
    // Query using tblcommontarget table with proper column mapping
    const result = await query(`
      SELECT
        t.year as "targetYear",
        t.month as "targetMonth",
        t.targetperiod as "targetPeriod",
        t.salesmancode as "userCode",
        COALESCE(u.username, t.salesmancode) as "userName",
        NULL as "teamLeaderCode",
        NULL as "teamLeaderName",
        NULL as "userRole",
        NULL as "customerCode",
        NULL as "customerName",
        NULL as "customerLevel",
        NULL as "chainCode",
        t.amount as "targetAmount",
        NULL as "targetQuantity",
        NULL as "targetVolume",
        'INR' as "currencyCode",
        NULL as "uom",
        NULL as "salesOrgCode",
        NULL as "salesOrgName",
        NULL as "productCategory",
        NULL as "productBrand",
        t.targettype as "targetType",
        NULL as "targetLevel",
        t.timeframe as "targetFrequency",
        CASE WHEN t.isactive THEN 'Active' ELSE 'Inactive' END as "targetStatus",
        t.isactive as "isActive",
        NULL as "isApproved",
        NULL as "remarks",
        NULL as "createdBy",
        t.startdate as "createdOn",
        NULL as "modifiedBy",
        t.enddate as "modifiedOn",
        -- Calculate achievement from transactions table
        COALESCE(
          SUM(CASE 
            WHEN EXTRACT(YEAR FROM ${dateExpr}) = t.year 
              AND EXTRACT(MONTH FROM ${dateExpr}) = t.month
            THEN ${netAmountExpr} 
            ELSE 0 
          END), 
          0
        ) as "achievementAmount",
        -- Calculate achievement percentage
        CASE 
          WHEN t.amount = 0 OR t.amount IS NULL THEN 0
          ELSE ROUND(
            (COALESCE(
              SUM(CASE 
                WHEN EXTRACT(YEAR FROM ${dateExpr}) = t.year 
                  AND EXTRACT(MONTH FROM ${dateExpr}) = t.month
                THEN ${netAmountExpr} 
                ELSE 0 
              END), 
              0
            ) / NULLIF(t.amount, 0)) * 100, 
            2
          )
        END as "achievementPercentage"
      FROM ${targetsTable} t
      LEFT JOIN tbluser u ON t.salesmancode = u.empcode
      LEFT JOIN ${transactionsTable} s
        ON t.salesmancode = ${userCodeJoin}
      ${whereClause}
      GROUP BY 
        t.year, t.month, t.targetperiod, t.salesmancode, u.username,
        t.amount, t.targettype, t.timeframe, t.isactive, t.startdate, t.enddate
      ORDER BY t.year DESC, t.month DESC, u.username ASC
      LIMIT $${paramIndex}
    `, [...params, limit])

    const targets = result.rows.map(row => ({
      targetYear: row.targetYear,
      targetMonth: row.targetMonth,
      targetPeriod: row.targetPeriod,
      userCode: row.userCode,
      userName: row.userName,
      teamLeaderCode: row.teamLeaderCode,
      teamLeaderName: row.teamLeaderName,
      userRole: row.userRole,
      customerCode: row.customerCode,
      customerName: row.customerName,
      customerLevel: row.customerLevel,
      chainCode: row.chainCode,
      targetAmount: parseFloat(row.targetAmount || '0'),
      targetQuantity: parseFloat(row.targetQuantity || '0'),
      targetVolume: parseFloat(row.targetVolume || '0'),
      achievementAmount: parseFloat(row.achievementAmount || '0'),
      achievementPercentage: parseFloat(row.achievementPercentage || '0'),
      currencyCode: row.currencyCode,
      uom: row.uom,
      salesOrgCode: row.salesOrgCode,
      salesOrgName: row.salesOrgName,
      productCategory: row.productCategory,
      productBrand: row.productBrand,
      targetType: row.targetType,
      targetLevel: row.targetLevel,
      targetFrequency: row.targetFrequency,
      targetStatus: row.targetStatus,
      isActive: row.isActive,
      isApproved: row.isApproved,
      remarks: row.remarks,
      createdBy: row.createdBy,
      createdOn: row.createdOn,
      modifiedBy: row.modifiedBy,
      modifiedOn: row.modifiedOn
    }))

    // Calculate summary statistics
    const summary = {
      totalTargets: targets.length,
      totalTargetAmount: targets.reduce((sum, t) => sum + t.targetAmount, 0),
      totalAchievement: targets.reduce((sum, t) => sum + t.achievementAmount, 0),
      overallAchievementPercentage: 0,
      targetsAchieved: targets.filter(t => t.achievementPercentage >= 100).length,
      targetsNotAchieved: targets.filter(t => t.achievementPercentage < 100).length
    }

    if (summary.totalTargetAmount > 0) {
      summary.overallAchievementPercentage = parseFloat(
        ((summary.totalAchievement / summary.totalTargetAmount) * 100).toFixed(2)
      )
    }

    return NextResponse.json({
      success: true,
      data: targets,
      summary,
      count: targets.length,
      timestamp: new Date().toISOString(),
      source: 'postgresql-flat-tables (flat_targets + flat_sales_transactions)'
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
      }
    })
  } catch (error) {
    console.error('Targets API error:', error)
    // If error is about missing table, return empty data instead of 500
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    if (errorMessage.includes('does not exist') || errorMessage.includes('No targets table')) {
      console.warn('⚠️ Targets table issue detected. Returning empty data.')
      return NextResponse.json({
        success: true,
        data: [],
        summary: {
          totalTargets: 0,
          totalTargetAmount: 0,
          totalAchievement: 0,
          overallAchievementPercentage: 0,
          targetsAchieved: 0,
          targetsNotAchieved: 0
        },
        count: 0,
        timestamp: new Date().toISOString(),
        source: 'postgresql - no targets table found',
        message: 'No targets table found in database. Please check if tblcommontarget or flat_targets table exists.'
      })
    }
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch targets',
      message: errorMessage
    }, { status: 500 })
  }
}
