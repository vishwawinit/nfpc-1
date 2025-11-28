const http = require('http');

const customerCode = '179259';

console.log(`Checking line item calculations for customer: ${customerCode}\n`);

http.get(`http://localhost:3000/api/customers/transactions/details?customerCode=${customerCode}&range=thisMonth&limit=100`, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.success) {
        console.log('Transaction breakdown:\n');

        // Group by transaction ID
        const byTransaction = {};
        json.data.transactions.forEach(tx => {
          if (!byTransaction[tx.transactionId]) {
            byTransaction[tx.transactionId] = [];
          }
          byTransaction[tx.transactionId].push(tx);
        });

        let grandTotal = 0;
        Object.keys(byTransaction).forEach((txId, i) => {
          const items = byTransaction[txId];
          const txTotal = items.reduce((sum, item) => sum + item.netAmount, 0);
          grandTotal += txTotal;

          console.log(`${i + 1}. Transaction: ${txId}`);
          console.log(`   Items: ${items.length}`);
          console.log(`   Transaction total: ${txTotal.toFixed(2)}`);

          items.forEach((item, j) => {
            console.log(`     ${j + 1}. ${item.productCode} - ${item.productName}`);
            console.log(`        Qty: ${item.quantity.toFixed(2)} x Price: ${item.unitPrice.toFixed(2)} = ${item.netAmount.toFixed(2)}`);
          });
          console.log();
        });

        console.log('='.repeat(80));
        console.log(`Grand Total (sum of all line items): ${grandTotal.toFixed(2)}`);
        console.log('='.repeat(80));

        // Now get the customer summary
        http.get(`http://localhost:3000/api/customers/details?range=thisMonth&customerCode=${customerCode}`, (res2) => {
          let data2 = '';
          res2.on('data', (chunk) => { data2 += chunk; });
          res2.on('end', () => {
            try {
              const json2 = JSON.parse(data2);
              if (json2.success && json2.data.customers.length > 0) {
                const customer = json2.data.customers[0];
                console.log(`\nCustomer Summary says: ${customer.totalSales.toFixed(2)}`);
                console.log(`Line items sum to: ${grandTotal.toFixed(2)}`);
                console.log(`\nDifference: ${(customer.totalSales - grandTotal).toFixed(2)}`);

                if (Math.abs(customer.totalSales - grandTotal) < 1) {
                  console.log('\n✓ Totals match!');
                } else {
                  console.log('\n❌ Totals DO NOT match!');
                  console.log('The line-level calculations are wrong.');
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
