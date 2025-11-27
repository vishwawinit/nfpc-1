const { query } = require('./src/lib/database.ts');

async function testSampleData() {
  try {
    // Query sample data with cities
    const result = await query(`
      SELECT
        customer_code,
        customer_description,
        customer_citycode,
        city_description,
        customer_regioncode,
        region_description,
        customer_channelcode,
        customer_channel_description,
        route_salesmancode,
        trx_usercode,
        user_description,
        user_usertype
      FROM flat_daily_sales_report
      WHERE city_description IS NOT NULL
      LIMIT 5
    `);

    console.log('Sample data with cities:');
    console.log(JSON.stringify(result.rows, null, 2));

    // Query distinct cities
    const citiesResult = await query(`
      SELECT DISTINCT
        customer_citycode,
        city_description
      FROM flat_daily_sales_report
      WHERE city_description IS NOT NULL
      LIMIT 10
    `);

    console.log('\nDistinct cities:');
    console.log(JSON.stringify(citiesResult.rows, null, 2));

    // Query distinct channels
    const channelsResult = await query(`
      SELECT DISTINCT
        customer_channelcode,
        customer_channel_description
      FROM flat_daily_sales_report
      WHERE customer_channel_description IS NOT NULL
      LIMIT 10
    `);

    console.log('\nDistinct channels:');
    console.log(JSON.stringify(channelsResult.rows, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testSampleData();
