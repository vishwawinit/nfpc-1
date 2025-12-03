const https = require('https')

async function testFreshPerformance() {
  const baseUrl = 'http://localhost:3000'

  console.log('🧪 Testing FRESH LMTD Performance (No Cache)\n')
  console.log('─'.repeat(80))

  const startDate = '2025-11-01'
  const endDate = '2025-11-30'
  const subAreaCode = 'DXB'

  // Add cache-busting parameter
  const timestamp = Date.now()

  console.log(`\nDate Range: ${startDate} to ${endDate}`)
  console.log(`Sub Area: ${subAreaCode}\n`)
  console.log('Testing with cache-busting to ensure fresh query...\n')

  const mainStart = Date.now()

  try {
    const mainResponse = await fetch(`${baseUrl}/api/lmtd-secondary?startDate=${startDate}&endDate=${endDate}&subAreaCode=${subAreaCode}&_t=${timestamp}`, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    })
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

      console.log('\n' + '─'.repeat(80))
      console.log(`\n⏱️  QUERY TIME: ${mainDuration} seconds`)

      if (mainData.cached) {
        console.log('\n⚠️  WARNING: This was a cached result!')
        console.log('For true performance, wait for cache to expire or restart the server.')
      } else {
        console.log('\n✅ This was a FRESH database query (not cached)')
        console.log('This is the real performance of the optimized queries.')
      }
    }
  } catch (error) {
    console.log(`❌ Main data fetch error: ${error.message}`)
  }
}

testFreshPerformance()
