const https = require('https');
const http = require('http');

// Test configurations
const tests = [
  {
    name: "Last Month (Full Month)",
    params: "startDate=2024-11-01&endDate=2024-11-30"
  },
  {
    name: "Current Month MTD",
    params: "startDate=2024-12-01&endDate=2024-12-15"
  },
  {
    name: "With Team Leader Filter",
    params: "startDate=2024-11-01&endDate=2024-11-30&teamLeaderCode=TL001"
  }
];

async function testEndpoint(testConfig) {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:3000/api/lmtd-secondary?${testConfig.params}`;
    const startTime = Date.now();

    console.log(`\n🔄 Testing: ${testConfig.name}`);
    console.log(`   URL: ${url}`);
    console.log(`   Started at: ${new Date().toLocaleTimeString()}`);

    http.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const endTime = Date.now();
        const duration = endTime - startTime;

        try {
          const json = JSON.parse(data);

          console.log(`\n✅ Test Complete: ${testConfig.name}`);
          console.log(`   ⏱️  Response Time: ${duration}ms (${(duration/1000).toFixed(2)}s)`);
          console.log(`   📊 Records Returned: ${json.data?.length || 0}`);
          console.log(`   💰 MTD Revenue: ${json.summary?.totalMtdRevenue?.toLocaleString() || 0}`);
          console.log(`   📈 LMTD Revenue: ${json.summary?.totalLmtdRevenue?.toLocaleString() || 0}`);
          console.log(`   🏪 Unique Stores: ${json.summary?.uniqueStores || 0}`);
          console.log(`   📦 Unique Products: ${json.summary?.uniqueProducts || 0}`);
          console.log(`   💾 Cached: ${json.cached ? 'Yes' : 'No'}`);

          resolve({
            name: testConfig.name,
            duration,
            recordCount: json.data?.length || 0,
            cached: json.cached
          });
        } catch (error) {
          console.error(`   ❌ Error parsing response: ${error.message}`);
          reject(error);
        }
      });
    }).on('error', (error) => {
      console.error(`   ❌ Request failed: ${error.message}`);
      reject(error);
    });
  });
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 LMTD Secondary Sales API Performance Test');
  console.log('═══════════════════════════════════════════════════════');

  const results = [];

  for (const test of tests) {
    try {
      const result = await testEndpoint(test);
      results.push(result);

      // Wait 1 second between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Test failed: ${error.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════');

  results.forEach((result, index) => {
    const timeColor = result.duration > 5000 ? '🔴' : result.duration > 2000 ? '🟡' : '🟢';
    console.log(`${timeColor} ${result.name}`);
    console.log(`   Time: ${result.duration}ms (${(result.duration/1000).toFixed(2)}s)`);
    console.log(`   Records: ${result.recordCount}`);
    console.log(`   Cached: ${result.cached ? 'Yes' : 'No'}`);
  });

  const avgTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  console.log(`\n📈 Average Response Time: ${avgTime.toFixed(0)}ms (${(avgTime/1000).toFixed(2)}s)`);
  console.log('═══════════════════════════════════════════════════════\n');
}

runTests().catch(console.error);
