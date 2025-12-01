const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkDataDates() {
  try {
    console.log('🔍 Checking date ranges with data in flat_daily_sales_report...\n');

    const query = `
      SELECT
        MIN(trx_trxdate) as min_date,
        MAX(trx_trxdate) as max_date,
        COUNT(*) as total_records,
        COUNT(DISTINCT trx_trxdate) as unique_dates,
        COUNT(DISTINCT customer_code) as unique_customers,
        COUNT(DISTINCT line_itemcode) as unique_products
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
    `;

    const result = await pool.query(query);
    const stats = result.rows[0];

    console.log('📊 Database Statistics:');
    console.log(\`   Earliest Date: \${stats.min_date}\`);
    console.log(\`   Latest Date: \${stats.max_date}\`);
    console.log(\`   Total Records: \${parseInt(stats.total_records).toLocaleString()}\`);
    console.log(\`   Unique Dates: \${stats.unique_dates}\`);
    console.log(\`   Unique Customers: \${stats.unique_customers}\`);
    console.log(\`   Unique Products: \${stats.unique_products}\`);

    const recentQuery = \`
      SELECT
        DATE_TRUNC('month', trx_trxdate) as month,
        COUNT(*) as record_count,
        SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as total_revenue
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND trx_trxdate >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')
      GROUP BY DATE_TRUNC('month', trx_trxdate)
      ORDER BY month DESC
      LIMIT 6
    \`;

    const recentResult = await pool.query(recentQuery);

    console.log('\n📅 Recent Months with Data:');
    recentResult.rows.forEach(row => {
      console.log(\`   \${row.month.toISOString().split('T')[0]}: \${parseInt(row.record_count).toLocaleString()} records\`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDataDates();
