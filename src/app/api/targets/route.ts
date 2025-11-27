import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'

// Force dynamic rendering for routes that use searchParams
export const dynamic = 'force-dynamic'

// Enable ISR with 60 second revalidation
export const revalidate = 60

/**
 * Target vs Achievement API - Using tblCommonTarget for targets, tblTrxHeader for achievements
 * Targets: From tblCommonTarget table (manual entry)
 * Achievements: Calculated from tblTrxHeader (actual sales)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    await db.initialize()

    // Check if tblCommonTarget table exists
    let hasTargetTable = false
    try {
      await query(`SELECT 1 FROM "tblCommonTarget" LIMIT 1`)
      hasTargetTable = true
      console.log('✅ tblCommonTarget table found')
    } catch (e: any) {
      if (e?.message?.includes('does not exist')) {
        console.warn('⚠️ tblCommonTarget table does not exist. Please create it using create_targets_table.sql')
        return NextResponse.json({
          success: false,
          error: 'tblCommonTarget table not found',
          message: 'Please create the tblCommonTarget table using the create_targets_table.sql script.',
          data: [],
          summary: {
            totalTargets: 0,
            totalTargetAmount: 0,
            totalAchievement: 0,
            overallAchievementPercentage: 0,
            targetsAchieved: 0,
            targetsNotAchieved: 0
          }
        }, { status: 404 })
      }
      throw e
    }

    // Get filter parameters
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear()
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : new Date().getMonth() + 1
    const userCode = searchParams.get('userCode')
    const customerCode = searchParams.get('customerCode')
    const teamLeaderCode = searchParams.get('teamLeaderCode')

    console.log('📊 Targets API - Params:', { year, month, userCode, customerCode, teamLeaderCode })

    // Build WHERE conditions for targets (using actual column names from database)
    const targetConditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Required filters for targets
    targetConditions.push(`t."Year" = $${paramIndex}`)
    params.push(year)
    paramIndex++

    targetConditions.push(`t."Month" = $${paramIndex}`)
    params.push(month)
    paramIndex++

    targetConditions.push(`t."IsActive" = TRUE`)

    // Optional filters
    if (userCode) {
      targetConditions.push(`t."SalesmanCode" = $${paramIndex}`)
      params.push(userCode)
      paramIndex++
    }

    if (customerCode) {
      targetConditions.push(`t."CustomerKey" = $${paramIndex}`)
      params.push(customerCode)
      paramIndex++
    }

    // Note: TeamLeaderCode doesn't exist in this table schema
    // if (teamLeaderCode) {
    //   targetConditions.push(`t."TeamLeaderCode" = $${paramIndex}`)
    //   params.push(teamLeaderCode)
    //   paramIndex++
    // }

    const targetWhereClause = `WHERE ${targetConditions.join(' AND ')}`

    // Query to get targets with achievements
    // Targets from tblCommonTarget, Achievements calculated from tblTrxHeader
    // NOTE: Using actual database column names (Year, Month, SalesmanCode, etc.)
    const result = await query(`
      WITH targets AS (
        SELECT
          t."Year" as "TargetYear",
          t."Month" as "TargetMonth",
          t."TimeFrame" as "TargetPeriod",
          t."SalesmanCode" as "UserCode",
          NULL as "TeamLeaderCode",
          t."CustomerKey" as "CustomerCode",
          t."SalesorgCode" as "SalesOrgCode",
          t."Amount" as "TargetAmount",
          COALESCE(t."Quantity", 0) as "TargetQuantity",
          0 as "TargetVolume",
          t."Currency" as "CurrencyCode",
          t."UOM",
          t."ItemKey" as "ProductCategory",
          NULL as "ProductBrand",
          NULL as "ChainCode",
          NULL as "TargetType",
          NULL as "TargetLevel",
          t."TimeFrame" as "TargetFrequency",
          t."CustomerLevel",
          CASE WHEN t."IsActive" = TRUE THEN 'Active' ELSE 'Inactive' END as "TargetStatus",
          t."IsActive",
          FALSE as "IsApproved",
          NULL as "Remarks",
          t."CreatedBy",
          t."CreatedOn",
          t."ModifiedBy",
          t."ModifiedOn"
        FROM "tblCommonTarget" t
        ${targetWhereClause}
      ),
      achievements AS (
        SELECT
          trx."UserCode",
          trx."ClientCode" as "CustomerCode",
          SUM(trx."TotalAmount") as achievement_amount,
          COUNT(DISTINCT trx."TrxCode") as order_count
        FROM "tblTrxHeader" trx
        WHERE EXTRACT(YEAR FROM trx."TrxDate") = $1
          AND EXTRACT(MONTH FROM trx."TrxDate") = $2
          AND trx."TrxType" = 1
          ${userCode ? `AND trx."UserCode" = $3` : ''}
          ${customerCode ? `AND trx."ClientCode" = $${userCode ? 4 : 3}` : ''}
        GROUP BY trx."UserCode", trx."ClientCode"
      )
      SELECT
        t."TargetYear",
        t."TargetMonth",
        t."TargetPeriod",
        t."UserCode",
        COALESCE(u."Description", t."UserCode") as "UserName",
        t."TeamLeaderCode",
        COALESCE(tl."Description", t."TeamLeaderCode") as "TeamLeaderName",
        t."CustomerCode",
        COALESCE(c."Description", t."CustomerCode") as "CustomerName",
        t."CustomerLevel",
        t."ChainCode",
        t."TargetAmount",
        t."TargetQuantity",
        t."TargetVolume",
        COALESCE(a.achievement_amount, 0) as "AchievementAmount",
        COALESCE(a.order_count, 0) as "OrderCount",
        t."CurrencyCode",
        t."UOM",
        t."SalesOrgCode",
        NULL as "SalesOrgName",
        t."ProductCategory",
        t."ProductBrand",
        t."TargetType",
        t."TargetLevel",
        t."TargetFrequency",
        t."TargetStatus",
        t."IsActive",
        t."IsApproved",
        t."Remarks",
        t."CreatedBy",
        t."CreatedOn",
        t."ModifiedBy",
        t."ModifiedOn",
        c."RegionCode",
        c."CityCode",
        CASE
          WHEN t."TargetAmount" = 0 OR t."TargetAmount" IS NULL THEN
            CASE WHEN COALESCE(a.achievement_amount, 0) > 0 THEN 100.0 ELSE 0.0 END
          ELSE
            ROUND(CAST((COALESCE(a.achievement_amount, 0) / NULLIF(t."TargetAmount", 0)) * 100 AS NUMERIC), 2)
        END as "AchievementPercentage"
      FROM targets t
      LEFT JOIN achievements a
        ON t."UserCode" = a."UserCode"
        AND (t."CustomerCode" IS NULL OR t."CustomerCode" = a."CustomerCode")
      LEFT JOIN "tblUser" u ON t."UserCode" = u."Code"
      LEFT JOIN "tblUser" tl ON t."TeamLeaderCode" = tl."Code"
      LEFT JOIN "tblCustomer" c ON t."CustomerCode" = c."Code"
      ORDER BY "AchievementAmount" DESC
      LIMIT 5000
    `, params)

    const targets = result.rows.map(row => ({
      targetYear: row.TargetYear,
      targetMonth: row.TargetMonth,
      targetPeriod: row.TargetPeriod || `${row.TargetYear}-${String(row.TargetMonth).padStart(2, '0')}`,
      userCode: row.UserCode || '',
      userName: row.UserName || 'Unknown User',
      teamLeaderCode: row.TeamLeaderCode || null,
      teamLeaderName: row.TeamLeaderName || null,
      userRole: null,
      customerCode: row.CustomerCode || null,
      customerName: row.CustomerName || null,
      customerLevel: row.CustomerLevel || null,
      chainCode: row.ChainCode || null,
      targetAmount: parseFloat(row.TargetAmount || '0'),
      targetQuantity: parseFloat(row.TargetQuantity || '0'),
      targetVolume: parseFloat(row.TargetVolume || '0'),
      achievementAmount: parseFloat(row.AchievementAmount || '0'),
      achievementPercentage: parseFloat(row.AchievementPercentage || '0'),
      currencyCode: row.CurrencyCode || 'AED',
      uom: row.UOM || null,
      salesOrgCode: row.SalesOrgCode || null,
      salesOrgName: row.SalesOrgName || null,
      productCategory: row.ProductCategory || null,
      productBrand: row.ProductBrand || null,
      targetType: row.TargetType || 'Sales',
      targetLevel: row.TargetLevel || 'User-Customer',
      targetFrequency: row.TargetFrequency || 'Monthly',
      targetStatus: row.TargetStatus || 'Active',
      isActive: row.IsActive !== false,
      isApproved: row.IsApproved || false,
      remarks: row.Remarks || null,
      createdBy: row.CreatedBy || null,
      createdOn: row.CreatedOn || null,
      modifiedBy: row.ModifiedBy || null,
      modifiedOn: row.ModifiedOn || null
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

    console.log('✅ Targets API Response:', {
      count: targets.length,
      totalTarget: summary.totalTargetAmount,
      totalAchievement: summary.totalAchievement,
      achievementPct: summary.overallAchievementPercentage
    })

    return NextResponse.json({
      success: true,
      data: targets,
      summary,
      count: targets.length,
      timestamp: new Date().toISOString(),
      source: 'tblCommonTarget (targets) + tblTrxHeader (achievements)',
      note: `Targets from tblCommonTarget, Achievements from tblTrxHeader for ${year}-${String(month).padStart(2, '0')}`
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
      }
    })
  } catch (error) {
    console.error('❌ Targets API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch target vs achievement data',
      message: errorMessage,
      data: [],
      summary: {
        totalTargets: 0,
        totalTargetAmount: 0,
        totalAchievement: 0,
        overallAchievementPercentage: 0,
        targetsAchieved: 0,
        targetsNotAchieved: 0
      }
    }, { status: 500 })
  }
}
