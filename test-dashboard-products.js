// Test Dashboard products API to see what value GF5201 shows

const testDashboardProducts = async () => {
  console.log('=== Testing Dashboard Products API ===\n')

  const startDate = '2025-11-01'
  const endDate = '2025-11-28'

  try {
    // Test Dashboard top products with user filter
    console.log('Fetching Dashboard top products with user filter...')
    const response = await fetch(`http://localhost:3000/api/products/top?startDate=${startDate}&endDate=${endDate}&userCode=187219&limit=100`)
    const data = await response.json()

    console.log(`Total products returned: ${data.products ? data.products.length : 0}\n`)

    if (data.products) {
      // Find GF5201 in the results
      const gf5201 = data.products.find(p => p.productCode === 'GF5201')

      if (gf5201) {
        console.log('✅ Found GF5201 in Dashboard API:')
        console.log(`   Product Name: ${gf5201.productName}`)
        console.log(`   Sales Amount: ${gf5201.salesAmount} AED`)
        console.log(`   Quantity: ${gf5201.quantitySold}`)
        console.log(`   Orders: ${gf5201.totalOrders}`)
        console.log(`   Average Price: ${gf5201.averagePrice}`)
      } else {
        console.log('❌ GF5201 not found in Dashboard results')
        console.log('\nTop 5 products from Dashboard:')
        data.products.slice(0, 5).forEach((p, i) => {
          console.log(`  ${i+1}. ${p.productCode} (${p.productName}): ${p.salesAmount} AED`)
        })
      }
    } else {
      console.log('Error: No products array in response')
      console.log('Response:', JSON.stringify(data, null, 2))
    }

  } catch (error) {
    console.error('Error:', error.message)
  }
}

testDashboardProducts()
