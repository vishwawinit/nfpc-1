// Test if GF5201 product shows correct sales amount (145,205 AED)

const testGF5201Product = async () => {
  console.log('=== Testing GF5201 Product Sales Amount ===\n')

  const startDate = '2025-11-01'
  const endDate = '2025-11-28'

  try {
    // Test with filters that should show GF5201 with 145,205 AED
    console.log('Fetching products with user filter...')
    const response = await fetch(`http://localhost:3000/api/daily-sales/products?startDate=${startDate}&endDate=${endDate}&userCode=187219`)
    const data = await response.json()

    console.log(`Total products returned: ${data.products.length}\n`)

    // Find GF5201 in the results
    const gf5201 = data.products.find(p => p.productCode === 'GF5201')

    if (gf5201) {
      console.log('✅ Found GF5201 (Safa SL Lban Origin 200mL12X1):')
      console.log(`   Product Name: ${gf5201.productName}`)
      console.log(`   Sales Amount: ${gf5201.sales.toFixed(2)} AED`)
      console.log(`   Net Sales: ${gf5201.netSales.toFixed(2)} AED`)
      console.log(`   Quantity: ${gf5201.quantity}`)
      console.log(`   Orders: ${gf5201.orders}`)
      console.log('')

      const expectedSales = 145205.00
      const difference = Math.abs(gf5201.sales - expectedSales)
      const percentDiff = (difference / expectedSales) * 100

      console.log('=== VERIFICATION ===')
      console.log(`Expected Sales: ${expectedSales.toFixed(2)} AED`)
      console.log(`Actual Sales: ${gf5201.sales.toFixed(2)} AED`)
      console.log(`Difference: ${difference.toFixed(2)} AED (${percentDiff.toFixed(2)}%)`)
      console.log('')

      if (percentDiff < 1) {
        console.log('✅ SUCCESS: Product sales amount is correct!')
      } else {
        console.log(`❌ PROBLEM: Sales amount differs by ${percentDiff.toFixed(2)}%`)
        console.log('   This could indicate:')
        if (Math.abs(gf5201.sales - (expectedSales / 100)) < 100) {
          console.log('   - Missing /100 division for fils conversion')
        } else if (Math.abs(gf5201.sales - (expectedSales * 100)) < 10000) {
          console.log('   - Extra *100 multiplication')
        } else {
          console.log('   - Different calculation logic')
        }
      }
    } else {
      console.log('❌ GF5201 not found in results')
      console.log('\nTop 5 products instead:')
      data.products.slice(0, 5).forEach((p, i) => {
        console.log(`  ${i+1}. ${p.productCode} (${p.productName}): ${p.sales.toFixed(2)} AED`)
      })
    }

  } catch (error) {
    console.error('Error:', error.message)
  }
}

testGF5201Product()
