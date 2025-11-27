// Performance Indexes for Daily Sales Report
// Run this with: node create_performance_indexes.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

console.log('Database config:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER
});

async function createIndexes() {
  try {
    console.log('\n🚀 Creating performance indexes for flat_daily_sales_report...\n');

    // Drop existing indexes if they exist (to recreate them)
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_flat_sales_date',
      'DROP INDEX IF EXISTS idx_flat_sales_trxtype',
      'DROP INDEX IF EXISTS idx_flat_sales_date_type',
      'DROP INDEX IF EXISTS idx_flat_sales_region',
      'DROP INDEX IF EXISTS idx_flat_sales_city',
      'DROP INDEX IF EXISTS idx_flat_sales_user',
      'DROP INDEX IF EXISTS idx_flat_sales_customer',
      'DROP INDEX IF EXISTS idx_flat_sales_item',
      'DROP INDEX IF EXISTS idx_flat_sales_composite'
    ];

    for (const dropSql of dropIndexes) {
      try {
        await pool.query(dropSql);
        console.log('✓ Dropped old index if existed');
      } catch (err) {
        // Ignore errors (index might not exist)
      }
    }

    console.log('\n📊 Creating new optimized indexes...\n');

    // 1. Primary index on transaction date (most important for date filtering)
    console.log('1. Creating date index...');
    await pool.query(`
      CREATE INDEX idx_flat_sales_date
      ON flat_daily_sales_report (trx_trxdate)
    `);
    console.log('✅ Date index created');

    // 2. Index on transaction type (always filtered)
    console.log('2. Creating transaction type index...');
    await pool.query(`
      CREATE INDEX idx_flat_sales_trxtype
      ON flat_daily_sales_report (trx_trxtype)
    `);
    console.log('✅ Transaction type index created');

    // 3. Composite index for the most common query pattern (date + type)
    console.log('3. Creating composite date+type index...');
    await pool.query(`
      CREATE INDEX idx_flat_sales_date_type
      ON flat_daily_sales_report (trx_trxdate, trx_trxtype)
    `);
    console.log('✅ Composite date+type index created');

    // 4. Index on region code for regional filtering
    console.log('4. Creating region code index...');
    await pool.query(`
      CREATE INDEX idx_flat_sales_region
      ON flat_daily_sales_report (customer_regioncode)
      WHERE customer_regioncode IS NOT NULL
    `);
    console.log('✅ Region code index created');

    // 5. Index on city for city filtering
    console.log('5. Creating city index...');
    await pool.query(`
      CREATE INDEX idx_flat_sales_city
      ON flat_daily_sales_report (customer_citycode)
      WHERE customer_citycode IS NOT NULL
    `);
    console.log('✅ City index created');

    // 6. Index on user code for user filtering
    console.log('6. Creating user code index...');
    await pool.query(`
      CREATE INDEX idx_flat_sales_user
      ON flat_daily_sales_report (trx_usercode)
      WHERE trx_usercode IS NOT NULL
    `);
    console.log('✅ User code index created');

    // 7. Index on customer code for store/customer filtering
    console.log('7. Creating customer code index...');
    await pool.query(`
      CREATE INDEX idx_flat_sales_customer
      ON flat_daily_sales_report (customer_code)
      WHERE customer_code IS NOT NULL
    `);
    console.log('✅ Customer code index created');

    // 8. Index on item code for product filtering
    console.log('8. Creating item code index...');
    await pool.query(`
      CREATE INDEX idx_flat_sales_item
      ON flat_daily_sales_report (line_itemcode)
      WHERE line_itemcode IS NOT NULL
    `);
    console.log('✅ Item code index created');

    // 9. Multi-column composite index for complex queries (covering most filters)
    console.log('9. Creating composite covering index...');
    await pool.query(`
      CREATE INDEX idx_flat_sales_composite
      ON flat_daily_sales_report (
        trx_trxdate,
        trx_trxtype,
        customer_regioncode,
        trx_usercode,
        customer_code
      )
      WHERE trx_trxtype = 1
    `);
    console.log('✅ Composite covering index created');

    console.log('\n✨ All indexes created successfully!\n');

    // Analyze the table to update statistics
    console.log('📈 Analyzing table to update query planner statistics...');
    await pool.query('ANALYZE flat_daily_sales_report');
    console.log('✅ Table analyzed\n');

    // Show index sizes
    console.log('📊 Index sizes:');
    const indexSizes = await pool.query(`
      SELECT
        indexname,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as size
      FROM pg_indexes
      WHERE tablename = 'flat_daily_sales_report'
      ORDER BY pg_relation_size(indexname::regclass) DESC
    `);

    indexSizes.rows.forEach(row => {
      console.log(`   ${row.indexname}: ${row.size}`);
    });

    console.log('\n✅ Index creation complete!');
    console.log('💡 Tip: Run VACUUM ANALYZE periodically to maintain performance\n');

  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the function
if (require.main === module) {
  createIndexes()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}

module.exports = { createIndexes };
