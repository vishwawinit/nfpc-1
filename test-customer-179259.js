const http = require('http');

const customerCode = '179259';

console.log(`Testing customer: ${customerCode} (Bandidos Retail LLC)\n`);
console.log('='.repeat(100));

// Test 1: Get customer summary from details API
console.log('\n1. Testing Customer Details API...\n');

http.get(`http://localhost:3000/api/customers/details?range=thisMonth&customerCode=${customerCode}`, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.success && json.data.customers.length > 0) {
        const customer = json.data.customers[0];
        console.log('Customer Summary from API:');
        console.log('  Name:', customer.customerName);
        console.log('  Total Sales:', customer.totalSales);
        console.log('  Total Orders:', customer.totalOrders);
        console.log('  Avg Order Value:', customer.avgOrderValue);

        // Test 2: Get detailed transactions
        console.log('\n' + '='.repeat(100));
        console.log('\n2. Testing Detailed Transactions API...\n');

        http.get(`http://localhost:3000/api/customers/transactions/details?customerCode=${customerCode}&range=thisMonth&limit=1000`, (res2) => {
          let data2 = '';
          res2.on('data', (chunk) => { data2 += chunk; });
          res2.on('end', () => {
            try {
              const json2 = JSON.parse(data2);
              if (json2.success) {
                console.log('Transaction Details from API:');
                console.log('  Total transaction line items:', json2.data.transactions.length);
                console.log('  Total records in DB:', json2.pagination.totalCount);

                // Calculate totals from transactions
                const totalAmount = json2.data.transactions.reduce((sum, tx) => sum + tx.netAmount, 0);
                const uniqueTransactions = new Set(json2.data.transactions.map(tx => tx.transactionId));

                console.log('\n  Calculated from transaction details:');
                console.log('    Unique Transaction IDs:', uniqueTransactions.size);
                console.log('    Total Amount:', totalAmount.toFixed(2));

                // Show unique transaction IDs
                console.log('\n  List of unique transaction IDs:');
                Array.from(uniqueTransactions).forEach((txId, i) => {
                  const txItems = json2.data.transactions.filter(tx => tx.transactionId === txId);
                  const txTotal = txItems.reduce((sum, tx) => sum + tx.netAmount, 0);
                  console.log(`    ${i + 1}. ${txId} (${txItems.length} items, total: ${txTotal.toFixed(2)})`);
                });

                console.log('\n' + '='.repeat(100));
                console.log('\n3. Comparison:\n');
                console.log('  Summary API says: ' + customer.totalOrders + ' orders, Sales: ' + customer.totalSales.toFixed(2));
                console.log('  Details API says: ' + uniqueTransactions.size + ' transactions, Sales: ' + totalAmount.toFixed(2));

                if (customer.totalOrders !== uniqueTransactions.size) {
                  console.log('\n  ❌ MISMATCH in order count!');
                } else {
                  console.log('\n  ✓ Order counts match');
                }

                if (Math.abs(customer.totalSales - totalAmount) > 0.01) {
                  console.log('  ❌ MISMATCH in total sales!');
                  console.log('  Difference:', (customer.totalSales - totalAmount).toFixed(2));
                } else {
                  console.log('  ✓ Total sales match');
                }

                console.log('\n' + '='.repeat(100));
              } else {
                console.log('❌ Detailed transactions API failed:', json2.error);
              }
            } catch (error) {
              console.log('❌ Failed to parse detailed transactions response:', error.message);
            }
          });
        }).on('error', (error) => {
          console.log('❌ HTTP request failed:', error.message);
        });

      } else {
        console.log('❌ Customer not found in details API');
      }
    } catch (error) {
      console.log('❌ Failed to parse customer details response:', error.message);
    }
  });
}).on('error', (error) => {
  console.log('❌ HTTP request failed:', error.message);
});
