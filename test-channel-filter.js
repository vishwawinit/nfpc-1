const { Pool } = require('pg');
require('dotenv').config();

async function testChannelFilter() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🔍 Testing channel filter for Orders Report...\n');

    // Get all available channels
    console.log('📋 Step 1: Fetching all available channels...');
    const channelsResult = await pool.query(`
      SELECT DISTINCT
        customer_channelcode,
        customer_channel_description,
        COUNT(*) as order_count
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND customer_channelcode IS NOT NULL
        AND customer_channelcode != ''
        AND trx_trxdate >= CURRENT_DATE - INTERVAL '3 months'
      GROUP BY customer_channelcode, customer_channel_description
      ORDER BY customer_channelcode
    `);

    console.log('\nAvailable Channels:');
    console.log('='.repeat(80));
    channelsResult.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. Code: "${row.customer_channelcode}" | Description: "${row.customer_channel_description}" | Orders: ${row.order_count}`);
    });

    // Check for HORECA variants
    console.log('\n🔎 Step 2: Searching for HORECA-related channels...');
    const horecaChannels = channelsResult.rows.filter(row =>
      (row.customer_channelcode && row.customer_channelcode.toLowerCase().includes('horeca')) ||
      (row.customer_channel_description && row.customer_channel_description.toLowerCase().includes('horeca'))
    );

    if (horecaChannels.length > 0) {
      console.log('\n✅ Found HORECA channels:');
      horecaChannels.forEach((row, idx) => {
        console.log(`${idx + 1}. Code: "${row.customer_channelcode}" | Description: "${row.customer_channel_description}"`);
      });
    } else {
      console.log('\n❌ No HORECA channels found!');
    }

    // Test specific channel "HORECA - FS"
    console.log('\n🧪 Step 3: Testing data with "HORECA - FS" filter...');
    const testResult = await pool.query(`
      SELECT COUNT(DISTINCT trx_trxcode) as order_count
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND customer_channelcode = $1
        AND trx_trxdate >= CURRENT_DATE - INTERVAL '1 month'
    `, ['HORECA - FS']);

    console.log(`Orders with channel "HORECA - FS" (last month): ${testResult.rows[0].order_count}`);

    // Test without spaces
    console.log('\n🧪 Step 4: Testing data with "HORECA-FS" (no spaces) filter...');
    const testResult2 = await pool.query(`
      SELECT COUNT(DISTINCT trx_trxcode) as order_count
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND customer_channelcode = $1
        AND trx_trxdate >= CURRENT_DATE - INTERVAL '1 month'
    `, ['HORECA-FS']);

    console.log(`Orders with channel "HORECA-FS" (last month): ${testResult2.rows[0].order_count}`);

    // Try pattern matching
    console.log('\n🧪 Step 5: Testing with LIKE pattern...');
    const testResult3 = await pool.query(`
      SELECT
        customer_channelcode,
        COUNT(DISTINCT trx_trxcode) as order_count
      FROM flat_daily_sales_report
      WHERE trx_trxtype = 1
        AND customer_channelcode ILIKE '%HORECA%FS%'
        AND trx_trxdate >= CURRENT_DATE - INTERVAL '1 month'
      GROUP BY customer_channelcode
    `);

    if (testResult3.rows.length > 0) {
      console.log('Channels matching HORECA*FS pattern:');
      testResult3.rows.forEach(row => {
        console.log(`  - "${row.customer_channelcode}": ${row.order_count} orders`);
      });
    } else {
      console.log('No channels matching HORECA*FS pattern found');
    }

    await pool.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testChannelFilter();
