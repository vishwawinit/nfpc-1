import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/database'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeProducts = searchParams.get('includeProducts') === 'true'

    // Get unique categories from tblItem GroupLevel1
    const categoriesQuery = `
      SELECT DISTINCT
        i."GroupLevel1" as code,
        i."GroupLevel1" as name,
        COUNT(DISTINCT i."Code") as product_count
      FROM "tblItem" i
      WHERE i."GroupLevel1" IS NOT NULL
        AND i."GroupLevel1" != ''
        AND LOWER(i."GroupLevel1") NOT IN ('unknown', 'n/a', 'null', 'na')
        AND i."GroupLevel1" !~ '^\\s*$'
      GROUP BY i."GroupLevel1"
      ORDER BY product_count DESC
    `

    // Get unique brands (GroupLevel2)
    const brandsQuery = `
      SELECT DISTINCT
        i."GroupLevel2" as code,
        i."GroupLevel2" as name,
        COUNT(DISTINCT i."Code") as product_count
      FROM "tblItem" i
      WHERE i."GroupLevel2" IS NOT NULL
        AND i."GroupLevel2" != ''
        AND LOWER(i."GroupLevel2") NOT IN ('unknown', 'n/a', 'null', 'na')
        AND i."GroupLevel2" !~ '^\\s*$'
      GROUP BY i."GroupLevel2"
      ORDER BY product_count DESC
    `

    // Get unique subcategories (GroupLevel3)
    const subcategoriesQuery = `
      SELECT DISTINCT
        i."GroupLevel3" as code,
        i."GroupLevel3" as name,
        COUNT(DISTINCT i."Code") as product_count
      FROM "tblItem" i
      WHERE i."GroupLevel3" IS NOT NULL
        AND i."GroupLevel3" != ''
        AND LOWER(i."GroupLevel3") NOT IN ('unknown', 'n/a', 'null', 'na')
        AND i."GroupLevel3" !~ '^\\s*$'
      GROUP BY i."GroupLevel3"
      ORDER BY product_count DESC
    `

    // Get all products for search dropdown (optional)
    const productsQuery = includeProducts ? `
      SELECT DISTINCT
        i."Code" as code,
        i."Description" as name
      FROM "tblItem" i
      WHERE i."Code" IS NOT NULL
        AND i."Description" IS NOT NULL
        AND i."Description" != ''
      ORDER BY i."Description"
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
