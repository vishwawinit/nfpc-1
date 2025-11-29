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
    
    // Get order header information from flat table for better data availability
    let orderHeaderQuery = `
      SELECT DISTINCT
        trx_trxcode as "orderCode",
        DATE(trx_trxdate) as "orderDate",
        customer_code as "customerCode",
        COALESCE(customer_description, 'Unknown') as "customerName",
        COALESCE(route_subareacode, 'Unknown') as "subArea",
        COALESCE(customer_channel_description, customer_channelcode, 'Unknown') as "chain",
        COALESCE(user_description, trx_usercode, 'Unknown') as "salesman",
        trx_usercode as "salesmanCode",
        COALESCE(route_salesmancode, '') as "teamLeader",
        COALESCE(route_salesmancode, '') as "teamLeaderCode"
      FROM flat_daily_sales_report
      WHERE trx_trxcode = $1
        AND trx_trxtype = 1
    `

    // Add hierarchy filter if not admin
    if (allowedUserCodes.length > 0) {
      const userCodesStr = allowedUserCodes.map(code => `'${code}'`).join(', ')
      orderHeaderQuery += ` AND trx_usercode IN (${userCodesStr})`
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
        line_itemcode as "productCode",
        COALESCE(line_itemdescription, item_description, 'Unknown') as "productName",
        COALESCE(item_category_description, item_grouplevel1, 'Others') as "category",
        ABS(COALESCE(line_quantitybu, 0)) as quantity,
        COALESCE(line_baseprice, 0) as "unitPrice",
        (ABS(COALESCE(line_quantitybu, 0)) * COALESCE(line_baseprice, 0)) as "grossAmount",
        0 as "discount",
        CASE WHEN (line_baseprice * line_quantitybu) > 0
             THEN (line_baseprice * line_quantitybu)
             ELSE 0 END as "netAmount",
        0 as "tax"
      FROM flat_daily_sales_report
      WHERE trx_trxcode = $1
        AND line_itemcode IS NOT NULL
        AND COALESCE(line_quantitybu, 0) != 0
      ORDER BY line_itemdescription
    `

    const orderItemsResult = await query(orderItemsQuery, [orderCode])
    
    // Calculate order summary
    const summaryQuery = `
      SELECT
        COUNT(DISTINCT line_itemcode) as "itemCount",
        SUM(ABS(COALESCE(line_quantitybu, 0))) as "totalQuantity",
        SUM(ABS(COALESCE(line_quantitybu, 0)) * COALESCE(line_baseprice, 0)) as "grossAmount",
        0 as "totalDiscount",
        0 as "totalTax",
        SUM(CASE WHEN (line_baseprice * line_quantitybu) > 0
                 THEN (line_baseprice * line_quantitybu)
                 ELSE 0 END) as "orderTotal"
      FROM flat_daily_sales_report
      WHERE trx_trxcode = $1
        AND line_itemcode IS NOT NULL
        AND COALESCE(line_quantitybu, 0) != 0
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
