import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const SALES_TABLE = 'flat_daily_sales_report'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeProducts = searchParams.get('includeProducts') === 'true'

    // Get unique categories from flat_daily_sales_report
    const categoriesQuery = `
      SELECT DISTINCT
        item_grouplevel1 as code,
        item_grouplevel1 as name,
        COUNT(DISTINCT line_itemcode) as product_count
      FROM ${SALES_TABLE}
      WHERE item_grouplevel1 IS NOT NULL
        AND item_grouplevel1 != ''
        AND LOWER(item_grouplevel1) NOT IN ('unknown', 'n/a', 'null', 'na')
        AND trx_trxtype = 1
      GROUP BY item_grouplevel1
      ORDER BY product_count DESC
    `

    // Get unique brands from flat_daily_sales_report
    const brandsQuery = `
      SELECT DISTINCT
        item_brand_description as code,
        item_brand_description as name,
        COUNT(DISTINCT line_itemcode) as product_count
      FROM ${SALES_TABLE}
      WHERE item_brand_description IS NOT NULL
        AND item_brand_description != ''
        AND LOWER(item_brand_description) NOT IN ('unknown', 'n/a', 'null', 'na')
        AND trx_trxtype = 1
      GROUP BY item_brand_description
      ORDER BY product_count DESC
    `

    // Get unique subcategories from flat_daily_sales_report
    const subcategoriesQuery = `
      SELECT DISTINCT
        item_grouplevel2 as code,
        item_grouplevel2 as name,
        COUNT(DISTINCT line_itemcode) as product_count
      FROM ${SALES_TABLE}
      WHERE item_grouplevel2 IS NOT NULL
        AND item_grouplevel2 != ''
        AND LOWER(item_grouplevel2) NOT IN ('unknown', 'n/a', 'null', 'na')
        AND trx_trxtype = 1
      GROUP BY item_grouplevel2
      ORDER BY product_count DESC
    `

    // Get all products for search dropdown (optional)
    const productsQuery = includeProducts ? `
      SELECT DISTINCT
        line_itemcode as code,
        MAX(line_itemdescription) as name
      FROM ${SALES_TABLE}
      WHERE line_itemcode IS NOT NULL
        AND line_itemdescription IS NOT NULL
        AND line_itemdescription != ''
        AND trx_trxtype = 1
      GROUP BY line_itemcode
      ORDER BY MAX(line_itemdescription)
      LIMIT 500
    ` : null

    const queries = [
      query(categoriesQuery),
      query(brandsQuery),
      query(subcategoriesQuery)
    ]

    if (productsQuery) {
      queries.push(query(productsQuery))
    }

    const results = await Promise.all(queries)
    const [categoriesResult, brandsResult, subcategoriesResult, productsResult] = results

    return NextResponse.json({
      success: true,
      data: {
        categories: categoriesResult.rows,
        brands: brandsResult.rows,
        subcategories: subcategoriesResult.rows,
        products: productsResult?.rows || []
      },
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    })

  } catch (error) {
    console.error('Product filters API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch product filters',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
