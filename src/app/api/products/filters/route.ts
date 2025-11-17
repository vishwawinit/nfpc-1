import { NextRequest, NextResponse } from 'next/server'
import { query, db } from '@/lib/database'
import { unstable_cache } from 'next/cache'

// Cached product filters fetcher - using flat_transactions (PostgreSQL)
const getCachedProductFilters = unstable_cache(
  async (dateRange: string, includeProducts: boolean, regionCode?: string) => {
    await db.initialize()

    // Get unique categories from product_group_level1 (the actual meaningful category)
    const categoriesQuery = `
      SELECT DISTINCT
        product_group_level1 as code,
        product_group_level1 as name,
        COUNT(DISTINCT product_code) as product_count
      FROM flat_transactions
      WHERE product_group_level1 IS NOT NULL 
        AND product_group_level1 != '' 
        AND LOWER(product_group_level1) NOT IN ('unknown', 'n/a', 'null', 'na', 'farmley')
        AND product_group_level1 !~ '^\\s*$'
      GROUP BY product_group_level1
      ORDER BY product_count DESC
    `

    // Get unique brands (product_group_level2)
    const brandsQuery = `
      SELECT DISTINCT
        product_group_level2 as code,
        product_group_level2 as name,
        COUNT(DISTINCT product_code) as product_count
      FROM flat_transactions
      WHERE product_group_level2 IS NOT NULL 
        AND product_group_level2 != '' 
        AND LOWER(product_group_level2) NOT IN ('unknown', 'n/a', 'null', 'na', 'farmley')
        AND product_group_level2 !~ '^\\s*$'
      GROUP BY product_group_level2
      ORDER BY product_count DESC
    `

    // Get all products for search dropdown (optional)
    const productsQuery = includeProducts ? `
      SELECT DISTINCT
        product_code as code,
        MAX(product_name) as name
      FROM flat_transactions
      WHERE product_code IS NOT NULL 
        AND product_name IS NOT NULL
        AND product_name != ''
      GROUP BY product_code
      ORDER BY MAX(product_name)
      LIMIT 500
    ` : null

    const queries = [
      db.query(categoriesQuery),
      db.query(brandsQuery)
    ]
    
    if (productsQuery) {
      queries.push(db.query(productsQuery))
    }

    const results = await Promise.all(queries)
    const [categoriesResult, brandsResult, productsResult] = results

    return {
      categories: categoriesResult.rows,
      brands: brandsResult.rows,
      subcategories: [], // Empty since all subcategories are "Farmley"
      products: productsResult?.rows || []
    }
  },
  (dateRange: string, includeProducts: boolean, regionCode?: string) => ['product-filters', dateRange, includeProducts.toString(), regionCode || 'all'],
  {
    revalidate: 300, // Cache for 5 minutes
    tags: ['product-filters']
  }
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dateRange = searchParams.get('range') || 'thisMonth'
    const includeProducts = searchParams.get('includeProducts') === 'true'
    const regionCode = searchParams.get('region')

    const data = await getCachedProductFilters(dateRange, includeProducts, regionCode)

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
      source: 'postgresql-flat-transactions'
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
