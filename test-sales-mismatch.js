const { Pool } = require('pg')

const pool = new Pool({
  host: '10.20.53.130',
  port: 5432,
  user: 'choithram',
  password: 'choithram',
  database: 'flat_nfpc_test'
})

async function testSalesMismatch() {
  const client = await pool.connect()

  try {
    const filters = {
      startDate: '2025-11-01',
      endDate: '2025-11-28',
      userCode: '187219'
    }

    console.log('Testing with filters:', filters)
    console.log('')

    // Test 1: Get summary totals
    const summarySQL = `
      SELECT
        COUNT(DISTINCT trx_trxcode) as total_orders,
        COUNT(DISTINCT customer_code) as total_stores,
        COUNT(DISTINCT trx_usercode) as total_users,
        COUNT(DISTINCT line_itemcode) as total_products,
        COALESCE(SUM(line_baseprice * line_quantitybu), 0) as gross_sales,
        COALESCE(SUM(line_totaldiscountamount), 0) as total_discount,
        COALESCE(SUM(line_baseprice * line_quantitybu - COALESCE(line_totaldiscountamount, 0)), 0) as total_net_sales
      FROM flat_daily_sales_report
      WHERE trx_trxdate >= $1::timestamp
        AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
        AND trx_trxtype = 1
        AND trx_usercode = $3
    `

    const summaryResult = await client.query(summarySQL, [
      filters.startDate,
      filters.endDate,
      filters.userCode
    ])

    console.log('📊 SUMMARY QUERY RESULTS:')
    console.log('Total Orders:', summaryResult.rows[0].total_orders)
    console.log('Total Products:', summaryResult.rows[0].total_products)
    console.log('Gross Sales:', parseFloat(summaryResult.rows[0].gross_sales).toFixed(2))
    console.log('Total Discount:', parseFloat(summaryResult.rows[0].total_discount).toFixed(2))
    console.log('Total Net Sales:', parseFloat(summaryResult.rows[0].total_net_sales).toFixed(2))
    console.log('')

    // Test 2: Get product totals
    const productSQL = `
      SELECT
        line_itemcode as product_code,
        COALESCE(SUM(line_baseprice * line_quantitybu - COALESCE(line_totaldiscountamount, 0)), 0) as net_sales
      FROM flat_daily_sales_report
      WHERE trx_trxdate >= $1::timestamp
        AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
        AND trx_trxtype = 1
        AND trx_usercode = $3
      GROUP BY line_itemcode
      ORDER BY net_sales DESC
    `

    const productResult = await client.query(productSQL, [
      filters.startDate,
      filters.endDate,
      filters.userCode
    ])

    console.log('📦 PRODUCT QUERY RESULTS:')
    console.log('Total Products:', productResult.rows.length)

    const totalProductSales = productResult.rows.reduce((sum, row) => sum + parseFloat(row.net_sales), 0)
    console.log('Sum of All Product Sales:', totalProductSales.toFixed(2))

    console.log('\nTop 10 Products:')
    productResult.rows.slice(0, 10).forEach((row, i) => {
      console.log(`  ${i+1}. ${row.product_code}: ${parseFloat(row.net_sales).toFixed(2)}`)
    })

    const top10Total = productResult.rows.slice(0, 10).reduce((sum, row) => sum + parseFloat(row.net_sales), 0)
    console.log('\nSum of Top 10 Products:', top10Total.toFixed(2))

    console.log('')
    console.log('🔍 COMPARISON:')
    console.log('Summary Total Net Sales:', parseFloat(summaryResult.rows[0].total_net_sales).toFixed(2))
    console.log('Sum of All Products:', totalProductSales.toFixed(2))
    console.log('Difference:', (parseFloat(summaryResult.rows[0].total_net_sales) - totalProductSales).toFixed(2))
    console.log('')

    if (Math.abs(parseFloat(summaryResult.rows[0].total_net_sales) - totalProductSales) < 0.01) {
      console.log('✅ MATCH! Summary and products totals are equal.')
    } else {
      console.log('❌ MISMATCH! There is a difference between summary and products totals.')

      // Let's investigate why
      console.log('\n🔍 Investigating the mismatch...')

      // Check if there are any NULL product codes
      const nullProductSQL = `
        SELECT
          COUNT(*) as count,
          COALESCE(SUM(line_baseprice * line_quantitybu - COALESCE(line_totaldiscountamount, 0)), 0) as net_sales
        FROM flat_daily_sales_report
        WHERE trx_trxdate >= $1::timestamp
          AND trx_trxdate < ($2::timestamp + INTERVAL '1 day')
          AND trx_trxtype = 1
          AND trx_usercode = $3
          AND (line_itemcode IS NULL OR line_itemcode = '')
      `

      const nullProductResult = await client.query(nullProductSQL, [
        filters.startDate,
        filters.endDate,
        filters.userCode
      ])

      console.log('Rows with NULL/empty product code:', nullProductResult.rows[0].count)
      console.log('Sales from NULL/empty products:', parseFloat(nullProductResult.rows[0].net_sales).toFixed(2))
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

testSalesMismatch()
