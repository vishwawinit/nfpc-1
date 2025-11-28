// Test if stores/customers filtering works correctly

const testStoresFilter = async () => {
  console.log('=== Testing Stores/Customers Filtering ===\n')

  const startDate = '2025-11-01'
  const endDate = '2025-11-28'

  try {
    // Test 1: No filters
    console.log('1. WITHOUT FILTERS:')
    const noFilterResp = await fetch(`http://localhost:3000/api/daily-sales/stores?startDate=${startDate}&endDate=${endDate}`)
    const noFilterData = await noFilterResp.json()
    console.log(`Total stores: ${noFilterData.stores.length}`)
    console.log('Top 3 stores:')
    noFilterData.stores.slice(0, 3).forEach((s, i) => {
      console.log(`  ${i+1}. ${s.storeCode} (${s.storeName}): ${s.netSales.toFixed(2)} AED, Orders: ${s.orders}`)
    })
    console.log('')

    // Test 2: With user filter
    console.log('2. WITH USER FILTER (userCode=187219):')
    const userFilterResp = await fetch(`http://localhost:3000/api/daily-sales/stores?startDate=${startDate}&endDate=${endDate}&userCode=187219`)
    const userFilterData = await userFilterResp.json()
    console.log(`Total stores: ${userFilterData.stores.length}`)
    console.log('Top 3 stores:')
    userFilterData.stores.slice(0, 3).forEach((s, i) => {
      console.log(`  ${i+1}. ${s.storeCode} (${s.storeName}): ${s.netSales.toFixed(2)} AED, Orders: ${s.orders}`)
    })
    console.log('')

    // Test 3: With area filter
    console.log('3. WITH AREA FILTER (subAreaCode=ALN):')
    const areaFilterResp = await fetch(`http://localhost:3000/api/daily-sales/stores?startDate=${startDate}&endDate=${endDate}&subAreaCode=ALN`)
    const areaFilterData = await areaFilterResp.json()
    console.log(`Total stores: ${areaFilterData.stores.length}`)
    console.log('Top 3 stores:')
    areaFilterData.stores.slice(0, 3).forEach((s, i) => {
      console.log(`  ${i+1}. ${s.storeCode} (${s.storeName}): ${s.netSales.toFixed(2)} AED, Orders: ${s.orders}`)
    })
    console.log('')

    // Compare
    console.log('=== COMPARISON ===')
    console.log(`Total stores without filter: ${noFilterData.stores.length}`)
    console.log(`Total stores with user filter: ${userFilterData.stores.length}`)
    console.log(`Total stores with area filter: ${areaFilterData.stores.length}`)
    console.log('')

    const topNoFilter = noFilterData.stores[0]?.storeCode
    const topUserFilter = userFilterData.stores[0]?.storeCode
    const topAreaFilter = areaFilterData.stores[0]?.storeCode

    console.log('Top store codes:')
    console.log(`  No filter: ${topNoFilter}`)
    console.log(`  User filter: ${topUserFilter}`)
    console.log(`  Area filter: ${topAreaFilter}`)
    console.log('')

    if (topNoFilter === topUserFilter && topUserFilter === topAreaFilter) {
      console.log('❌ PROBLEM: All filters show same stores! Filtering is NOT working.')
    } else {
      console.log('✅ GOOD: Filters show different stores. Filtering appears to work.')
    }

    // Verify sales amounts are reasonable (using trx_totalamount)
    console.log('\n=== SALES AMOUNT VERIFICATION ===')
    const sampleStore = noFilterData.stores[0]
    if (sampleStore) {
      console.log(`Sample store: ${sampleStore.storeCode}`)
      console.log(`  Net Sales: ${sampleStore.netSales.toFixed(2)} AED`)
      console.log(`  Orders: ${sampleStore.orders}`)
      console.log(`  Avg Order Value: ${sampleStore.avgOrderValue.toFixed(2)} AED`)

      if (sampleStore.netSales > 0 && sampleStore.orders > 0) {
        console.log('✅ Sales amounts look reasonable')
      } else {
        console.log('❌ Sales amounts might be incorrect')
      }
    }

  } catch (error) {
    console.error('Error:', error.message)
  }
}

testStoresFilter()
