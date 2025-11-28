// Test if products filtering works correctly

const testProductsFilter = async () => {
  console.log('=== Testing Products Filtering ===\n')

  const startDate = '2025-11-01'
  const endDate = '2025-11-28'

  try {
    // Test 1: No filters
    console.log('1. WITHOUT FILTERS:')
    const noFilterResp = await fetch(`http://localhost:3000/api/daily-sales/products?startDate=${startDate}&endDate=${endDate}`)
    const noFilterData = await noFilterResp.json()
    console.log('Top 3 products:')
    noFilterData.products.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i+1}. ${p.productCode} (${p.productName}): ${p.netSales.toFixed(2)} AED`)
    })
    console.log('')

    // Test 2: With user filter
    console.log('2. WITH USER FILTER (userCode=187219):')
    const userFilterResp = await fetch(`http://localhost:3000/api/daily-sales/products?startDate=${startDate}&endDate=${endDate}&userCode=187219`)
    const userFilterData = await userFilterResp.json()
    console.log('Top 3 products:')
    userFilterData.products.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i+1}. ${p.productCode} (${p.productName}): ${p.netSales.toFixed(2)} AED`)
    })
    console.log('')

    // Test 3: With area filter
    console.log('3. WITH AREA FILTER (subAreaCode=ALN):')
    const areaFilterResp = await fetch(`http://localhost:3000/api/daily-sales/products?startDate=${startDate}&endDate=${endDate}&subAreaCode=ALN`)
    const areaFilterData = await areaFilterResp.json()
    console.log('Top 3 products:')
    areaFilterData.products.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i+1}. ${p.productCode} (${p.productName}): ${p.netSales.toFixed(2)} AED`)
    })
    console.log('')

    // Compare
    console.log('=== COMPARISON ===')
    console.log(`Total products without filter: ${noFilterData.products.length}`)
    console.log(`Total products with user filter: ${userFilterData.products.length}`)
    console.log(`Total products with area filter: ${areaFilterData.products.length}`)
    console.log('')

    const topNoFilter = noFilterData.products[0].productCode
    const topUserFilter = userFilterData.products[0].productCode
    const topAreaFilter = areaFilterData.products[0].productCode

    console.log('Top product codes:')
    console.log(`  No filter: ${topNoFilter}`)
    console.log(`  User filter: ${topUserFilter}`)
    console.log(`  Area filter: ${topAreaFilter}`)
    console.log('')

    if (topNoFilter === topUserFilter && topUserFilter === topAreaFilter) {
      console.log('❌ PROBLEM: All filters show same products! Filtering is NOT working.')
    } else {
      console.log('✅ GOOD: Filters show different products. Filtering appears to work.')
    }

  } catch (error) {
    console.error('Error:', error.message)
  }
}

testProductsFilter()
