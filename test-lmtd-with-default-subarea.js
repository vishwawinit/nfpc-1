const https = require('https')

async function testWithDefaultSubArea() {
  const baseUrl = 'http://localhost:3000'

  console.log('🧪 Testing LMTD Report with Default Sub Area = DXB\n')
  console.log('This simulates what the user sees when opening the LMTD report page')
  console.log('─'.repeat(80))

  const startDate = '2025-11-01'
  const endDate = '2025-11-30'
  const subAreaCode = 'DXB'

  console.log(`\nDate Range: ${startDate} to ${endDate}`)
  console.log(`Sub Area: ${subAreaCode} (default)\n`)

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

  // Test 2: Fetch Main Data with DXB filter (what user sees by default)
  console.log('\n📊 Step 2: Fetching main LMTD data (with DXB filter)...\n')
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
      console.log('\nData Summary:')
      console.log(`  Total Records: ${mainData.data?.length?.toLocaleString() || 0}`)
      console.log(`  MTD Revenue: AED ${mainData.summary?.mtd?.revenue?.toLocaleString() || 0}`)
      console.log(`  LMTD Revenue: AED ${mainData.summary?.lmtd?.revenue?.toLocaleString() || 0}`)
      console.log(`  Revenue Variance: ${mainData.summary?.variance?.revenuePercent?.toFixed(2) || 0}%`)
      console.log(`  MTD Stores: ${mainData.summary?.mtd?.stores || 0}`)
      console.log(`  MTD Products: ${mainData.summary?.mtd?.products || 0}`)
      console.log(`  MTD Users: ${mainData.summary?.mtd?.users || 0}`)
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
  console.log('\nThis is what the user experiences when opening the LMTD report')
  console.log('with the default Sub Area filter (DXB) applied.\n')
}

testWithDefaultSubArea()
