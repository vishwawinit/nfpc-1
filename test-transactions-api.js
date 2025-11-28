const http = require('http');

const customerCode = '177736';
const url = `http://localhost:3000/api/customers/transactions/daily?customerCode=${customerCode}&range=thisMonth&limit=10`;

console.log(`Testing transactions API for customer: ${customerCode}\n`);

http.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);

      if (json.success) {
        console.log('✓ Transactions API works!\n');
        console.log('Customer:', json.data.customer?.customer_name || 'Unknown');
        console.log('Currency:', json.data.currencyCode);
        console.log('Number of transaction days:', json.data.transactions?.length || 0);

        if (json.data.transactions && json.data.transactions.length > 0) {
          console.log('\nSample transactions (first 3 days):');
          console.log('='.repeat(80));
          json.data.transactions.slice(0, 3).forEach((tx, i) => {
            console.log(`\n${i + 1}. Date: ${tx.date}`);
            console.log(`   Sales: ${tx.sales.amount.toFixed(2)} (${tx.sales.count} orders, ${tx.sales.quantity} units)`);
            console.log(`   Good Returns: ${tx.goodReturns.amount.toFixed(2)} (${tx.goodReturns.count} returns)`);
            console.log(`   Bad Returns: ${tx.badReturns.amount.toFixed(2)} (${tx.badReturns.count} returns)`);
            console.log(`   Deliveries: ${tx.deliveries.amount.toFixed(2)} (${tx.deliveries.count} deliveries)`);
            console.log(`   Net Amount: ${tx.netAmount.toFixed(2)}`);
          });

          console.log('\n' + '='.repeat(80));
          console.log('TOTALS:');
          console.log('  Sales Amount:', json.data.totals.salesAmount.toFixed(2));
          console.log('  Sales Count:', json.data.totals.salesCount);
          console.log('  Good Returns Amount:', json.data.totals.goodReturnsAmount.toFixed(2));
          console.log('  Good Returns Count:', json.data.totals.goodReturnsCount);
          console.log('  Bad Returns Amount:', json.data.totals.badReturnsAmount.toFixed(2));
          console.log('  Bad Returns Count:', json.data.totals.badReturnsCount);
          console.log('  Net Amount:', json.data.totals.netAmount.toFixed(2));
          console.log('='.repeat(80));

          console.log('\n✅ SUCCESS: View Orders action is working correctly!');
          console.log('Transactions are being fetched and displayed properly.');
        } else {
          console.log('\n⚠️  WARNING: No transactions found for this customer in the selected period');
        }
      } else {
        console.log('✗ Transactions API failed');
        console.log('Error:', json.error);
        console.log('Message:', json.message);
      }
    } catch (error) {
      console.log('✗ Failed to parse response');
      console.log('Error:', error.message);
      console.log('Response:', data);
    }
  });
}).on('error', (error) => {
  console.log('✗ HTTP request failed');
  console.log('Error:', error.message);
});
