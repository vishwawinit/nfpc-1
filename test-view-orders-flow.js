const http = require('http');

console.log('Testing complete View Orders flow...\n');
console.log('='.repeat(100));

// Step 1: Get customers list
console.log('\nStep 1: Fetching customers list...\n');

http.get('http://localhost:3000/api/customers/details?range=thisMonth&limit=5&sortBy=total_sales&sortOrder=DESC', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);

      if (json.success && json.data.customers.length > 0) {
        console.log('✓ Got customers list');
        console.log(`  Total customers: ${json.data.pagination.totalCount}`);
        console.log(`  Showing top ${json.data.customers.length} customers\n`);

        // Show top 3 customers
        console.log('Top 3 Customers:');
        json.data.customers.slice(0, 3).forEach((customer, i) => {
          console.log(`  ${i + 1}. ${customer.customerCode} - ${customer.customerName}`);
          console.log(`     Total Sales: ${customer.totalSales.toFixed(2)} ${customer.currencyCode}`);
          console.log(`     Total Orders: ${customer.totalOrders}`);
        });

        // Step 2: Test "View Orders" for first customer
        const testCustomer = json.data.customers[0];
        console.log('\n' + '='.repeat(100));
        console.log(`\nStep 2: Testing "View Orders" for customer: ${testCustomer.customerCode} - ${testCustomer.customerName}\n`);

        // Test detailed transactions API (what the modal fetches)
        http.get(`http://localhost:3000/api/customers/transactions/details?customerCode=${testCustomer.customerCode}&range=thisMonth&limit=20`, (res2) => {
          let data2 = '';
          res2.on('data', (chunk) => { data2 += chunk; });
          res2.on('end', () => {
            try {
              const json2 = JSON.parse(data2);

              if (json2.success && json2.data) {
                console.log('✓ Transactions API returned data');
                console.log(`  Total transaction line items: ${json2.data.transactions.length}`);
                console.log(`  Total records in DB: ${json2.pagination.totalCount}\n`);

                if (json2.data.transactions.length > 0) {
                  // Group by transaction
                  const byTransaction = {};
                  json2.data.transactions.forEach(tx => {
                    if (!byTransaction[tx.transactionId]) {
                      byTransaction[tx.transactionId] = {
                        id: tx.transactionId,
                        date: tx.date,
                        total: tx.transactionTotal,
                        items: []
                      };
                    }
                    byTransaction[tx.transactionId].items.push(tx);
                  });

                  console.log('  Transactions breakdown:');
                  let txTotal = 0;
                  Object.values(byTransaction).forEach((tx, i) => {
                    txTotal += tx.total;
                    console.log(`    ${i + 1}. ${tx.id}`);
                    console.log(`       Date: ${new Date(tx.date).toLocaleDateString()}`);
                    console.log(`       Total: ${tx.total.toFixed(2)} ${json2.data.currencyCode}`);
                    console.log(`       Items: ${tx.items.length}`);
                  });

                  console.log('\n' + '='.repeat(100));
                  console.log('\n✅ VERIFICATION:');
                  console.log(`  Customer summary says: ${testCustomer.totalSales.toFixed(2)} ${testCustomer.currencyCode} in ${testCustomer.totalOrders} orders`);
                  console.log(`  Transactions show: ${txTotal.toFixed(2)} ${json2.data.currencyCode} in ${Object.keys(byTransaction).length} transactions`);

                  if (Math.abs(testCustomer.totalSales - txTotal) < 1 && testCustomer.totalOrders === Object.keys(byTransaction).length) {
                    console.log('\n  ✅ PERFECT! View Orders shows the correct transactions for this customer!');
                  } else {
                    console.log('\n  ❌ MISMATCH! Something is wrong.');
                    console.log(`     Sales difference: ${(testCustomer.totalSales - txTotal).toFixed(2)}`);
                    console.log(`     Orders difference: ${testCustomer.totalOrders - Object.keys(byTransaction).length}`);
                  }
                  console.log('\n' + '='.repeat(100));

                } else {
                  console.log('  ⚠️  No transactions found for this customer');
                }
              } else {
                console.log('  ❌ Transactions API failed:', json2.error);
                console.log('  Message:', json2.message);
              }
            } catch (error) {
              console.log('  ❌ Failed to parse transactions response:', error.message);
            }
          });
        }).on('error', (error) => {
          console.log('  ❌ HTTP request failed:', error.message);
        });

      } else {
        console.log('❌ No customers found');
      }
    } catch (error) {
      console.log('❌ Failed to parse customers response:', error.message);
    }
  });
}).on('error', (error) => {
  console.log('❌ HTTP request failed:', error.message);
});
