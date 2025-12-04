const { Pool } = require('pg');
require('dotenv').config();

async function quickCheck() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔍 Quick channel check...\n');

    // Just get distinct channel codes (fast query)
    const result = await pool.query(`
      SELECT DISTINCT
        customer_channelcode,
        customer_channel_description
      FROM flat_daily_sales_report
      WHERE customer_channelcode IS NOT NULL
        AND customer_channelcode != ''
      LIMIT 50
    `);

    console.log('Sample of available channels:');
    console.log('='.repeat(80));
    result.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. "${row.customer_channelcode}" - ${row.customer_channel_description}`);
    });

    // Check for exact match
    const exactMatch = result.rows.find(r => r.customer_channelcode === 'HORECA - FS');
    const noSpaceMatch = result.rows.find(r => r.customer_channelcode === 'HORECA-FS');
    const anyHoreca = result.rows.filter(r =>
      r.customer_channelcode?.toUpperCase().includes('HORECA')
    );

    console.log('\n🔍 Search Results:');
    console.log(`  "HORECA - FS" (with spaces): ${exactMatch ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`  "HORECA-FS" (no spaces): ${noSpaceMatch ? '✅ FOUND' : '❌ NOT FOUND'}`);

    if (anyHoreca.length > 0) {
      console.log(`\n  HORECA-related channels found: ${anyHoreca.length}`);
      anyHoreca.forEach(r => {
        console.log(`    - "${r.customer_channelcode}"`);
      });
    }

    await pool.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

quickCheck();
