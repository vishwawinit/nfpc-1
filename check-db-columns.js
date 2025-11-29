const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Dreamlabs%4013@103.131.121.65:5432/nfpc_new'
});

async function checkColumns() {
  try {
    // Get all columns from flat_daily_sales_report
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'flat_daily_sales_report'
      ORDER BY ordinal_position;
    `);

    console.log('\n=== ALL COLUMNS IN flat_daily_sales_report ===\n');
    result.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    console.log(`\nTotal columns: ${result.rows.length}\n`);

    // Check for item-related columns
    console.log('\n=== ITEM-RELATED COLUMNS ===\n');
    const itemCols = result.rows.filter(r => r.column_name.toLowerCase().includes('item'));
    itemCols.forEach(row => {
      console.log(`${row.column_name} (${row.data_type})`);
    });

    // Check for line-related columns
    console.log('\n=== LINE-RELATED COLUMNS ===\n');
    const lineCols = result.rows.filter(r => r.column_name.toLowerCase().includes('line'));
    lineCols.forEach(row => {
      console.log(`${row.column_name} (${row.data_type})`);
    });

    // Check for product-related columns
    console.log('\n=== PRODUCT-RELATED COLUMNS ===\n');
    const productCols = result.rows.filter(r => r.column_name.toLowerCase().includes('product'));
    productCols.forEach(row => {
      console.log(`${row.column_name} (${row.data_type})`);
    });

    // Sample one row to see actual data
    const sampleResult = await pool.query(`
      SELECT *
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
      LIMIT 1;
    `);

    console.log('\n=== SAMPLE ROW (column names only) ===\n');
    if (sampleResult.rows.length > 0) {
      const sampleRow = sampleResult.rows[0];
      Object.keys(sampleRow).forEach((key, idx) => {
        console.log(`${idx + 1}. ${key}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkColumns();
