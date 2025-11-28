const { Client } = require('pg');
require('dotenv').config();

async function testRealCustomer() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Get a customer with actual sales transactions
    const customerQuery = `
      SELECT
        customer_code,
        MAX(customer_description) as customer_name,
        COUNT(DISTINCT trx_trxcode) as order_count,
        SUM(trx_totalamount) as total_sales,
        MAX(trx_trxdate::date) as last_order_date
      FROM flat_daily_sales_report
      WHERE trx_trxtype = '1'
        AND trx_trxdate::date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY customer_code
      HAVING COUNT(DISTINCT trx_trxcode) > 5
      ORDER BY SUM(trx_totalamount) DESC
      LIMIT 5
    `;

    const result = await client.query(customerQuery);

    console.log('Top 5 customers with sales in last 30 days:');
    console.log('='.repeat(80));
    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. Code: ${row.customer_code}`);
      console.log(`   Name: ${row.customer_name}`);
      console.log(`   Orders: ${row.order_count}`);
      console.log(`   Total Sales: AED ${Number(row.total_sales).toLocaleString()}`);
      console.log(`   Last Order: ${row.last_order_date}`);
      console.log();
    });

    if (result.rows.length > 0) {
      const testCustomer = result.rows[0];
      console.log('\n' + '='.repeat(80));
      console.log(`Testing with customer: ${testCustomer.customer_code} (${testCustomer.customer_name})`);
      console.log('='.repeat(80) + '\n');

      // Now get daily transactions for this customer
      const transactionsQuery = `
        SELECT
          trx_trxdate::date as transaction_date,
          COUNT(DISTINCT trx_trxcode) as order_count,
          SUM(trx_totalamount) as total_amount,
          SUM(line_quantitybu) as total_quantity
        FROM flat_daily_sales_report
        WHERE customer_code = $1
          AND trx_trxtype = '1'
          AND trx_trxdate::date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY trx_trxdate::date
        ORDER BY trx_trxdate::date DESC
        LIMIT 10
      `;

      const txResult = await client.query(transactionsQuery, [testCustomer.customer_code]);

      console.log(`Daily transactions for last 30 days (limit 10):`);
      console.log('-'.repeat(80));
      txResult.rows.forEach(row => {
        console.log(`Date: ${row.transaction_date} | Orders: ${row.order_count} | Amount: AED ${Number(row.total_amount).toLocaleString()}`);
      });

      console.log('\n' + '='.repeat(80));
      console.log(`✓ Customer ${testCustomer.customer_code} has ${txResult.rows.length} days of transactions`);
      console.log('='.repeat(80));
    } else {
      console.log('No customers found with recent sales data');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

testRealCustomer();
