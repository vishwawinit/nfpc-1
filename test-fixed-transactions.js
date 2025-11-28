const http = require('http');

const customerCode = '179259';

console.log(`Testing FIXED transactions API for customer: ${customerCode}\n`);

http.get(`http://localhost:3000/api/customers/transactions/details?customerCode=${customerCode}&range=thisMonth&limit=100`, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.success) {
        console.log('Transaction Details:\n');

        // Group by transaction ID
        const byTransaction = {};
        json.data.transactions.forEach(tx => {
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

        let grandTotalFromTransactions = 0;
        Object.values(byTransaction).forEach((tx, i) => {
          grandTotalFromTransactions += tx.total;

          console.log(`${i + 1}. Transaction: ${tx.id}`);
          console.log(`   Date: ${new Date(tx.date).toLocaleDateString()}`);
          console.log(`   Transaction Total: ${tx.total.toFixed(2)} AED`);
          console.log(`   Items (${tx.items.length}):`);

          tx.items.forEach((item, j) => {
            console.log(`     ${j + 1}. ${item.productCode} - ${item.productName}`);
            console.log(`        Qty: ${item.quantity.toFixed(2)} x Price: ${item.unitPrice.toFixed(2)}`);
            console.log(`        Line Total: ${item.lineTotal.toFixed(2)} - Discount: ${item.lineDiscount.toFixed(2)} = Net: ${item.lineNetAmount.toFixed(2)}`);
          });
          console.log();
        });

        console.log('='.repeat(80));
        console.log(`Total from transaction totals: ${grandTotalFromTransactions.toFixed(2)} AED`);
        console.log(`Number of transactions: ${Object.keys(byTransaction).length}`);
        console.log('='.repeat(80));

        // Now compare with customer summary
        http.get(`http://localhost:3000/api/customers/details?range=thisMonth&customerCode=${customerCode}`, (res2) => {
          let data2 = '';
          res2.on('data', (chunk) => { data2 += chunk; });
          res2.on('end', () => {
            try {
              const json2 = JSON.parse(data2);
              if (json2.success && json2.data.customers.length > 0) {
                const customer = json2.data.customers[0];
                console.log(`\nCustomer Summary from Details API:`);
                console.log(`  Total Sales: ${customer.totalSales.toFixed(2)} AED`);
                console.log(`  Total Orders: ${customer.totalOrders}`);

                console.log(`\n✓ Comparison:`);
                console.log(`  Summary total: ${customer.totalSales.toFixed(2)}`);
                console.log(`  Transactions total: ${grandTotalFromTransactions.toFixed(2)}`);
                console.log(`  Difference: ${Math.abs(customer.totalSales - grandTotalFromTransactions).toFixed(2)}`);

                if (Math.abs(customer.totalSales - grandTotalFromTransactions) < 1) {
                  console.log(`\n✅ SUCCESS! Totals match!`);
                  console.log(`View Orders will now show the correct ${customer.totalOrders} transactions totaling ${customer.totalSales.toFixed(2)} AED`);
                } else {
                  console.log(`\n❌ Still a mismatch`);
                }
              }
            } catch (error) {
              console.log('Error:', error.message);
            }
          });
        });

      } else {
        console.log('❌ API failed:', json.error);
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
  });
}).on('error', (error) => {
  console.log('❌ HTTP request failed:', error.message);
});
