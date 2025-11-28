const http = require('http');

const customerCode = '177736';
const url = `http://localhost:3000/api/customers/transactions/details?customerCode=${customerCode}&range=thisMonth&limit=10`;

console.log(`Testing detailed transactions API for customer: ${customerCode}\n`);

http.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);

      if (json.success) {
        console.log('✓ Detailed Transactions API works!\n');
        console.log('Customer:', json.data.customer?.customer_name || 'Unknown');
        console.log('Currency:', json.data.currencyCode);
        console.log('Number of transaction line items:', json.data.transactions?.length || 0);

        if (json.data.transactions && json.data.transactions.length > 0) {
          console.log('\nSample transaction line items (first 5):');
          console.log('='.repeat(120));
          json.data.transactions.slice(0, 5).forEach((tx, i) => {
            console.log(`\n${i + 1}. Transaction ID: ${tx.transactionId}`);
            console.log(`   Date: ${tx.date}`);
            console.log(`   Product Code: ${tx.productCode}`);
            console.log(`   Product Name: ${tx.productName}`);
            console.log(`   Quantity: ${tx.quantity.toFixed(2)} | Unit Price: ${tx.unitPrice.toFixed(2)}`);
            console.log(`   Total: ${tx.total.toFixed(2)} | Net Amount: ${tx.netAmount.toFixed(2)}`);
          });

          console.log('\n' + '='.repeat(120));
          console.log('PAGINATION:');
          console.log('  Current Page:', json.pagination.currentPage);
          console.log('  Total Pages:', json.pagination.totalPages);
          console.log('  Total Count:', json.pagination.totalCount);
          console.log('='.repeat(120));

          console.log('\n✅ SUCCESS: View Orders action will show detailed transaction line items!');
          console.log('Transaction details (Product Code, Product Name, Quantity, Unit Price, Total) are working correctly.');
        } else {
          console.log('\n⚠️  WARNING: No transaction details found for this customer in the selected period');
        }
      } else {
        console.log('✗ Detailed Transactions API failed');
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
