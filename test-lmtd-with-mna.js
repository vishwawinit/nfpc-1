const https = require('https')

async function testWithMNA() {
  const baseUrl = 'http://localhost:3000'

  console.log('🧪 Testing LMTD Report with MNA Sub Area (FASTEST!)\n')
  console.log('This simulates what the user sees with the new default')
  console.log('─'.repeat(80))

  const startDate = '2025-11-01'
  const endDate = '2025-11-30'
  const subAreaCode = 'MNA'

  console.log(`\nDate Range: ${startDate} to ${endDate}`)
  console.log(`Sub Area: ${subAreaCode} (NEW DEFAULT - only 2,162 rows!)\n`)

  // Test 1: Fetch Filters
  console.log('📊 Step 1: Fetching filter options...\n')
  const filtersStart = Date.now()

  try {
    const filtersResponse = await fetch(`${baseUrl}/api/lmtd-secondary/filters?startDate=${startDate}&endDate=${endDate}`)
    const filtersDuration = ((Date.now() - filtersStart) / 1000).toFixed(2)

    if (!filtersResponse.ok) {
      console.log(`❌ Filters API failed: ${filtersResponse.status}`)
    } else {
      const filtersData = await filtersResponse.json()
      console.log(`✅ Filters loaded in ${filtersDuration} seconds`)
      console.log('\nAvailable Filter Options:')
      console.log(`  Team Leaders: ${filtersData.filters?.teamLeaders?.length || 0}`)
      console.log(`  Users: ${filtersData.filters?.users?.length || 0}`)
      console.log(`  Areas: ${filtersData.filters?.areas?.length || 0}`)
      console.log(`  Sub Areas: ${filtersData.filters?.subAreas?.length || 0}`)
      console.log(`  Chains: ${filtersData.filters?.chains?.length || 0}`)
      console.log(`  Stores: ${filtersData.filters?.stores?.length || 0}`)
      console.log(`  Categories: ${filtersData.filters?.categories?.length || 0}`)
      console.log(`  Products: ${filtersData.filters?.products?.length || 0}`)
    }
  } catch (error) {
    console.log(`❌ Filters fetch error: ${error.message}`)
  }

  // Test 2: Fetch Main Data with MNA filter
  console.log('\n📊 Step 2: Fetching main LMTD data (with MNA filter)...\n')
  const mainStart = Date.now()

  try {
    const mainResponse = await fetch(`${baseUrl}/api/lmtd-secondary?startDate=${startDate}&endDate=${endDate}&subAreaCode=${subAreaCode}`)
    const mainDuration = ((Date.now() - mainStart) / 1000).toFixed(2)

    if (!mainResponse.ok) {
      console.log(`❌ Main API failed: ${mainResponse.status}`)
      const errorText = await mainResponse.text()
      console.log('Error:', errorText.substring(0, 300))
    } else {
      const mainData = await mainResponse.json()
      console.log(`✅ Main data loaded in ${mainDuration} seconds`)
      console.log(`   Cached: ${mainData.cached}`)
      console.log('\nData Summary:')
      console.log(`  Total Records: ${mainData.data?.length?.toLocaleString() || 0}`)
      console.log(`  MTD Revenue: AED ${mainData.summary?.totalMtdRevenue?.toLocaleString() || 0}`)
      console.log(`  LMTD Revenue: AED ${mainData.summary?.totalLmtdRevenue?.toLocaleString() || 0}`)
      console.log(`  Revenue Variance: ${mainData.summary?.revenueVariancePercent?.toFixed(2) || 0}%`)
      console.log(`  Unique Stores: ${mainData.summary?.uniqueStores || 0}`)
      console.log(`  Unique Products: ${mainData.summary?.uniqueProducts || 0}`)
      console.log(`  Unique Users: ${mainData.summary?.uniqueUsers || 0}`)
      console.log(`  Daily Trend Days: ${mainData.dailyTrend?.length || 0}`)
      console.log(`  Top Products: ${mainData.topProducts?.length || 0}`)
    }
  } catch (error) {
    console.log(`❌ Main data fetch error: ${error.message}`)
  }

  // Calculate total time
  const totalTime = ((Date.now() - filtersStart) / 1000).toFixed(2)

  console.log('\n' + '─'.repeat(80))
  console.log(`\n⏱️  TOTAL TIME TO LOAD PAGE: ${totalTime} seconds`)
  console.log('\n📊 COMPARISON:\n')
  console.log('   Old Default (DXB): 183 seconds (700,390 rows)')
  console.log(`   New Default (MNA): ${totalTime} seconds (2,162 rows)`)
  console.log(`   🚀 IMPROVEMENT: ${((183 - parseFloat(totalTime)) / 183 * 100).toFixed(1)}% FASTER!\n`)
}

testWithMNA()
