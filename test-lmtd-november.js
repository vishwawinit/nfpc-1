const https = require('https')

async function testNovemberPerformance() {
  const baseUrl = 'http://localhost:3000'

  console.log('🧪 Testing LMTD Report - November 2025 Data\n')
  console.log('This was previously taking 10+ minutes and timing out...\n')
  console.log('─'.repeat(80))

  // Test with November data (the problematic month)
  const startDate = '2025-11-01'
  const endDate = '2025-11-30'

  console.log('\n📊 Test 1: Fetching LMTD data for November (no filters)...\n')
  console.log(`Date Range: ${startDate} to ${endDate}`)
  console.log('MTD: Nov 1-30, 2025')
  console.log('LMTD: Oct 1-30, 2025\n')

  const start1 = Date.now()

  try {
    const response1 = await fetch(`${baseUrl}/api/lmtd-secondary?startDate=${startDate}&endDate=${endDate}`)
    const duration1 = ((Date.now() - start1) / 1000).toFixed(2)

    if (!response1.ok) {
      console.log(`❌ API failed: ${response1.status} ${response1.statusText}`)
      const errorText = await response1.text()
      console.log('Error:', errorText.substring(0, 500))
    } else {
      const data1 = await response1.json()
      console.log(`✅ Data loaded in ${duration1} seconds`)
      console.log('\nData Summary:')
      console.log(`  Total Records: ${data1.data?.length?.toLocaleString() || 0}`)
      console.log(`  MTD Revenue: ${data1.summary?.mtd?.revenue?.toLocaleString() || 0}`)
      console.log(`  LMTD Revenue: ${data1.summary?.lmtd?.revenue?.toLocaleString() || 0}`)
      console.log(`  Variance: ${data1.summary?.variance?.revenuePercent?.toFixed(2) || 0}%`)
      console.log(`  Total Stores: ${data1.summary?.mtd?.stores || 0}`)
      console.log(`  Total Products: ${data1.summary?.mtd?.products || 0}`)
    }
  } catch (error) {
    console.log(`❌ Fetch error: ${error.message}`)
  }

  // Test with DXB filter
  console.log('\n📊 Test 2: Fetching LMTD data for November (DXB filter)...\n')

  const start2 = Date.now()

  try {
    const response2 = await fetch(`${baseUrl}/api/lmtd-secondary?startDate=${startDate}&endDate=${endDate}&subAreaCode=DXB`)
    const duration2 = ((Date.now() - start2) / 1000).toFixed(2)

    if (!response2.ok) {
      console.log(`❌ API failed: ${response2.status} ${response2.statusText}`)
    } else {
      const data2 = await response2.json()
      console.log(`✅ Filtered data loaded in ${duration2} seconds`)
      console.log('\nFiltered Data Summary (DXB only):')
      console.log(`  Total Records: ${data2.data?.length?.toLocaleString() || 0}`)
      console.log(`  MTD Revenue: ${data2.summary?.mtd?.revenue?.toLocaleString() || 0}`)
      console.log(`  LMTD Revenue: ${data2.summary?.lmtd?.revenue?.toLocaleString() || 0}`)
    }
  } catch (error) {
    console.log(`❌ Fetch error: ${error.message}`)
  }

  console.log('\n' + '─'.repeat(80))
  console.log('✅ Performance test complete\n')
}

testNovemberPerformance()
