const https = require('https')

async function testLMTDPerformance() {
  const baseUrl = 'http://localhost:3000'

  // Get current date for testing
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  const currentDate = `${year}-${month}-${day}`
  const startDate = `${year}-${month}-01`

  console.log('🧪 Testing LMTD Report Performance\n')
  console.log(`Date Range: ${startDate} to ${currentDate}`)
  console.log('─'.repeat(80))

  // Test 1: Fetch filters
  console.log('\n📊 Test 1: Fetching filter options...\n')
  const filtersUrl = `${baseUrl}/api/lmtd-secondary/filters?startDate=${startDate}&endDate=${currentDate}`

  const filtersStart = Date.now()

  try {
    const filtersResponse = await fetch(filtersUrl)
    const filtersDuration = ((Date.now() - filtersStart) / 1000).toFixed(2)

    if (!filtersResponse.ok) {
      console.log(`❌ Filters API failed: ${filtersResponse.status} ${filtersResponse.statusText}`)
      const errorText = await filtersResponse.text()
      console.log('Error:', errorText.substring(0, 500))
    } else {
      const filtersData = await filtersResponse.json()
      console.log(`✅ Filters loaded in ${filtersDuration} seconds`)
      console.log('\nFilter Options Available:')
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

  // Test 2: Fetch main data without filters
  console.log('\n📊 Test 2: Fetching main data (no filters)...\n')
  const mainUrl = `${baseUrl}/api/lmtd-secondary?startDate=${startDate}&endDate=${currentDate}`

  const mainStart = Date.now()

  try {
    const mainResponse = await fetch(mainUrl)
    const mainDuration = ((Date.now() - mainStart) / 1000).toFixed(2)

    if (!mainResponse.ok) {
      console.log(`❌ Main API failed: ${mainResponse.status} ${mainResponse.statusText}`)
      const errorText = await mainResponse.text()
      console.log('Error:', errorText.substring(0, 500))
    } else {
      const mainData = await mainResponse.json()
      console.log(`✅ Main data loaded in ${mainDuration} seconds`)
      console.log('\nData Summary:')
      console.log(`  Total Records: ${mainData.data?.length || 0}`)
      console.log(`  MTD Revenue: ${mainData.summary?.mtd?.revenue?.toLocaleString() || 0}`)
      console.log(`  LMTD Revenue: ${mainData.summary?.lmtd?.revenue?.toLocaleString() || 0}`)
      console.log(`  Variance: ${mainData.summary?.variance?.revenuePercent?.toFixed(2) || 0}%`)
    }
  } catch (error) {
    console.log(`❌ Main data fetch error: ${error.message}`)
  }

  // Test 3: Fetch with subarea filter (DXB)
  console.log('\n📊 Test 3: Fetching data with Sub Area = DXB filter...\n')
  const subareaUrl = `${baseUrl}/api/lmtd-secondary?startDate=${startDate}&endDate=${currentDate}&subAreaCode=DXB`

  const subareaStart = Date.now()

  try {
    const subareaResponse = await fetch(subareaUrl)
    const subareaDuration = ((Date.now() - subareaStart) / 1000).toFixed(2)

    if (!subareaResponse.ok) {
      console.log(`❌ Subarea API failed: ${subareaResponse.status} ${subareaResponse.statusText}`)
      const errorText = await subareaResponse.text()
      console.log('Error:', errorText.substring(0, 500))
    } else {
      const subareaData = await subareaResponse.json()
      console.log(`✅ Filtered data loaded in ${subareaDuration} seconds`)
      console.log('\nFiltered Data Summary:')
      console.log(`  Total Records: ${subareaData.data?.length || 0}`)
      console.log(`  MTD Revenue: ${subareaData.summary?.mtd?.revenue?.toLocaleString() || 0}`)
      console.log(`  LMTD Revenue: ${subareaData.summary?.lmtd?.revenue?.toLocaleString() || 0}`)
    }
  } catch (error) {
    console.log(`❌ Subarea fetch error: ${error.message}`)
  }

  console.log('\n' + '─'.repeat(80))
  console.log('✅ Performance test complete\n')
}

testLMTDPerformance()
