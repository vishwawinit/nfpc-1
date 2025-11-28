// Compare what values we're getting vs what we expect

const testProductTotals = async () => {
  console.log('=== Testing Product Sales Calculations ===\n')

  const startDate = '2025-11-01'
  const endDate = '2025-11-28'
  const userCode = '187219'

  try {
    // Test Daily Sales API
    console.log('1. Daily Sales Report API (GF5201):')
    const dailySalesResp = await fetch(`http://localhost:3000/api/daily-sales/products?startDate=${startDate}&endDate=${endDate}&userCode=${userCode}`)
    const dailySalesData = await dailySalesResp.json()
    const dailyGF5201 = dailySalesData.products.find(p => p.productCode === 'GF5201')

    if (dailyGF5201) {
      console.log(`   Sales: ${dailyGF5201.sales.toFixed(2)} AED`)
      console.log(`   Net Sales: ${dailyGF5201.netSales.toFixed(2)} AED`)
      console.log(`   Quantity: ${dailyGF5201.quantity}`)
    } else {
      console.log('   NOT FOUND')
    }
    console.log('')

    // Test Dashboard API
    console.log('2. Dashboard API (GF5201):')
    const dashboardResp = await fetch(`http://localhost:3000/api/products/top?startDate=${startDate}&endDate=${endDate}&userCode=${userCode}&limit=100`)
    const dashboardData = await dashboardResp.json()
    const dashGF5201 = dashboardData.data ? dashboardData.data.find(p => p.productCode === 'GF5201') : null

    if (dashGF5201) {
      console.log(`   Sales: ${dashGF5201.salesAmount} AED`)
      console.log(`   Quantity: ${dashGF5201.quantitySold}`)
    } else {
      console.log('   NOT FOUND')
    }
    console.log('')

    // Analysis
    console.log('=== ANALYSIS ===')
    console.log(`Expected value (from user): 145,205.00 AED`)
    console.log(`Daily Sales shows: ${dailyGF5201 ? dailyGF5201.sales.toFixed(2) : 'N/A'} AED`)
    console.log(`Dashboard shows: ${dashGF5201 ? dashGF5201.salesAmount : 'N/A'} AED`)
    console.log('')

    if (dailyGF5201 && dashGF5201) {
      const dailyValue = dailyGF5201.sales
      const dashValue = dashGF5201.salesAmount
      const expected = 145205

      console.log('Observations:')
      console.log(`- Both APIs show similar value (~1,454 AED)`)
      console.log(`- Expected value is 100x larger (145,205 AED)`)
      console.log(`- Ratio: ${expected} / ${dailyValue.toFixed(2)} = ${(expected / dailyValue).toFixed(2)}x`)
      console.log('')
      console.log('CONCLUSION:')
      console.log('The /100.0 division is WRONG for line-item calculations.')
      console.log('The data is already in AED, not fils.')
      console.log('REMOVE the /100.0 division from both:')
      console.log('  - src/services/dailySalesService.ts (getProductPerformance)')
      console.log('  - src/app/api/products/top/route.ts')
    }

  } catch (error) {
    console.error('Error:', error.message)
  }
}

testProductTotals()
