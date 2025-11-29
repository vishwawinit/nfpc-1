const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Dreamlabs%4013@103.131.121.65:5432/nfpc_new'
});

async function checkAllColumns() {
  try {
    console.log('\n=== CHECKING ALL COLUMNS IN flat_daily_sales_report ===\n');

    // Get all columns
    const result = await pool.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'flat_daily_sales_report'
      ORDER BY ordinal_position;
    `);

    console.log(`Total columns found: ${result.rows.length}\n`);

    result.rows.forEach((row, idx) => {
      const nullable = row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const hasDefault = row.column_default ? ` DEFAULT ${row.column_default}` : '';
      console.log(`${(idx + 1).toString().padStart(3, ' ')}. ${row.column_name.padEnd(40)} ${row.data_type.padEnd(20)} ${nullable}${hasDefault}`);
    });

    // Check for specific columns we're interested in
    console.log('\n=== CHECKING SPECIFIC COLUMNS ===\n');
    const columnsToCheck = [
      'item_isactive',
      'item_imagepath',
      'item_image',
      'product_image',
      'line_image',
      'user_isactive'
    ];

    columnsToCheck.forEach(col => {
      const exists = result.rows.find(r => r.column_name.toLowerCase() === col.toLowerCase());
      if (exists) {
        console.log(`✅ ${col.padEnd(30)} EXISTS (${exists.data_type})`);
      } else {
        console.log(`❌ ${col.padEnd(30)} DOES NOT EXIST`);
      }
    });

    // Sample one row to see actual data
    console.log('\n=== SAMPLE DATA (1 row) ===\n');
    const sampleResult = await pool.query(`
      SELECT *
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
      LIMIT 1;
    `);

    if (sampleResult.rows.length > 0) {
      const sample = sampleResult.rows[0];
      console.log('Sample row columns and values:');
      Object.keys(sample).forEach((key, idx) => {
        const value = sample[key];
        const displayValue = value === null ? 'NULL' :
                           value === '' ? '(empty string)' :
                           typeof value === 'string' && value.length > 50 ? value.substring(0, 50) + '...' :
                           value;
        console.log(`${(idx + 1).toString().padStart(3, ' ')}. ${key.padEnd(40)} = ${displayValue}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

checkAllColumns();
