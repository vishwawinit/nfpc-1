import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { getChildUsers, isAdmin } from '@/lib/mssql'

export async function GET(
  request: NextRequest,
  { params }: { params: { orderCode: string } }
) {
  try {
    await db.initialize()
    
    const orderCode = params.orderCode
    const { searchParams } = new URL(request.url)
    const loginUserCode = searchParams.get('loginUserCode')
    
    // Get hierarchy-based allowed users
    let allowedUserCodes: string[] = []
    if (loginUserCode && !isAdmin(loginUserCode)) {
      allowedUserCodes = await getChildUsers(loginUserCode)
    }
    
    // Get order header information with hierarchy check
    let orderHeaderQuery = `
      SELECT
        h."TrxCode" as "orderCode",
        h."TrxDate" as "orderDate",
        h."ClientCode" as "customerCode",
        COALESCE(c."Description", 'Unknown') as "customerName",
        COALESCE(r."Description", 'Unknown') as "region",
        COALESCE(ct."Description", 'Unknown') as "city",
        COALESCE(ch."Description", 'Unknown') as "chain",
        COALESCE(u."Description", 'Unknown') as "salesman",
        h."UserCode" as "salesmanCode",
        COALESCE(tl."Description", 'Unknown') as "teamLeader",
        u."ReportsTo" as "teamLeaderCode"
      FROM "tblTrxHeader" h
      LEFT JOIN "tblCustomer" c ON h."ClientCode" = c."Code"
      LEFT JOIN "tblRegion" r ON c."RegionCode" = r."Code"
      LEFT JOIN "tblCity" ct ON c."CityCode" = ct."Code"
      LEFT JOIN "tblCustomerDetail" cd ON c."Code" = cd."CustomerCode"
      LEFT JOIN "tblChannel" ch ON cd."ChannelCode" = ch."Code"
      LEFT JOIN "tblUser" u ON h."UserCode" = u."Code"
      LEFT JOIN "tblUser" tl ON u."ReportsTo" = tl."Code"
      WHERE h."TrxCode" = $1
        AND h."TrxType" = 1
    `

    // Add hierarchy filter if not admin
    if (allowedUserCodes.length > 0) {
      const userCodesStr = allowedUserCodes.map(code => `'${code}'`).join(', ')
      orderHeaderQuery += ` AND h."UserCode" IN (${userCodesStr})`
    }

    orderHeaderQuery += ` LIMIT 1`

    const orderHeaderResult = await query(orderHeaderQuery, [orderCode])
    
    if (orderHeaderResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: loginUserCode && !isAdmin(loginUserCode) 
          ? 'Order not found or access denied'
          : 'Order not found'
      }, { status: 404 })
    }
    
    const orderHeader = orderHeaderResult.rows[0]
    
    // Get order line items
    const orderItemsQuery = `
      SELECT
        d."ItemCode" as "productCode",
        COALESCE(d."ItemDescription", i."Description", 'Unknown') as "productName",
        COALESCE(i."GroupLevel1", 'Others') as "category",
        ABS(COALESCE(d."QuantityBU", 0)) as quantity,
        COALESCE(d."BasePrice", 0) as "unitPrice",
        (ABS(COALESCE(d."QuantityBU", 0)) * COALESCE(d."BasePrice", 0)) as "grossAmount",
        0 as "discount",
        CASE WHEN (d."BasePrice" * d."QuantityBU") > 0
             THEN (d."BasePrice" * d."QuantityBU")
             ELSE 0 END as "netAmount",
        0 as "tax"
      FROM "tblTrxDetail" d
      LEFT JOIN "tblItem" i ON d."ItemCode" = i."Code"
      WHERE d."TrxCode" = $1
        AND d."ItemCode" IS NOT NULL
        AND COALESCE(d."QuantityBU", 0) != 0
      ORDER BY d."ItemDescription"
    `

    const orderItemsResult = await query(orderItemsQuery, [orderCode])
    
    // Calculate order summary
    const summaryQuery = `
      SELECT
        COUNT(*) as "itemCount",
        SUM(ABS(COALESCE(d."QuantityBU", 0))) as "totalQuantity",
        SUM(ABS(COALESCE(d."QuantityBU", 0)) * COALESCE(d."BasePrice", 0)) as "grossAmount",
        0 as "totalDiscount",
        0 as "totalTax",
        SUM(CASE WHEN (d."BasePrice" * d."QuantityBU") > 0
                 THEN (d."BasePrice" * d."QuantityBU")
                 ELSE 0 END) as "orderTotal"
      FROM "tblTrxDetail" d
      WHERE d."TrxCode" = $1
        AND d."ItemCode" IS NOT NULL
        AND COALESCE(d."QuantityBU", 0) != 0
    `

    const summaryResult = await query(summaryQuery, [orderCode])
    const summary = summaryResult.rows[0]
    
    return NextResponse.json({
      success: true,
      data: {
        header: orderHeader,
        items: orderItemsResult.rows,
        summary: {
          itemCount: parseInt(summary.itemCount || '0'),
          totalQuantity: parseInt(summary.totalQuantity || '0'),
          grossAmount: parseFloat(summary.grossAmount || '0'),
          totalDiscount: parseFloat(summary.totalDiscount || '0'),
          totalTax: parseFloat(summary.totalTax || '0'),
          orderTotal: parseFloat(summary.orderTotal || '0')
        }
      }
    })
    
  } catch (error) {
    console.error('Order details API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
