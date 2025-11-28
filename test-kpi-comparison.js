// Test script to compare KPI values between Dashboard and Daily Sales Report

const testKPIComparison = async () => {
  console.log('=== Testing KPI Comparison ===\n')

  // Get current date range (this month)
  const now = new Date()
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  console.log(`Date Range: ${startDate} to ${endDate}\n`)

  try {
    // Fetch Dashboard KPI
    console.log('Fetching Dashboard KPI...')
    const dashboardResponse = await fetch(`http://localhost:3000/api/dashboard/kpi?range=thisMonth&startDate=${startDate}&endDate=${endDate}`)
    const dashboardData = await dashboardResponse.json()

    if (!dashboardData.success) {
      console.error('Dashboard API Error:', dashboardData.error)
      return
    }

    console.log('Dashboard KPI Data:')
    console.log(`  Total Sales: ${dashboardData.data.currentTotalSales}`)
    console.log(`  Net Sales: ${dashboardData.data.currentNetSales}`)
    console.log(`  Total Orders: ${dashboardData.data.currentTotalOrders}`)
    console.log(`  Customers: ${dashboardData.data.currentUniqueCustomers}`)
    console.log(`  Units: ${dashboardData.data.currentTotalQuantity}`)
    console.log(`  Avg Order Value: ${dashboardData.data.averageOrderValue}\n`)

    // Fetch Daily Sales Summary
    console.log('Fetching Daily Sales Summary...')
    const dailySalesResponse = await fetch(`http://localhost:3000/api/daily-sales/summary?startDate=${startDate}&endDate=${endDate}`)
    const dailySalesData = await dailySalesResponse.json()

    console.log('Daily Sales Summary Data:')
    console.log(`  Total Sales (Gross): ${dailySalesData.totalSales}`)
    console.log(`  Net Sales: ${dailySalesData.totalNetSales}`)
    console.log(`  Total Orders: ${dailySalesData.totalOrders}`)
    console.log(`  Customers (Stores): ${dailySalesData.totalStores}`)
    console.log(`  Units: ${dailySalesData.totalQuantity}`)
    console.log(`  Avg Order Value: ${dailySalesData.avgOrderValue}\n`)

    // Compare values
    console.log('=== COMPARISON ===')
    console.log(`Total Sales Diff: ${Math.abs(dashboardData.data.currentTotalSales - dailySalesData.totalSales).toFixed(2)}`)
    console.log(`Net Sales Diff: ${Math.abs(dashboardData.data.currentNetSales - dailySalesData.totalNetSales).toFixed(2)}`)
    console.log(`Orders Diff: ${Math.abs(dashboardData.data.currentTotalOrders - dailySalesData.totalOrders)}`)
    console.log(`Customers Diff: ${Math.abs(dashboardData.data.currentUniqueCustomers - dailySalesData.totalStores)}`)
    console.log(`Units Diff: ${Math.abs(dashboardData.data.currentTotalQuantity - dailySalesData.totalQuantity).toFixed(2)}`)
    console.log(`Avg Order Diff: ${Math.abs(dashboardData.data.averageOrderValue - dailySalesData.avgOrderValue).toFixed(2)}`)

    // Show percentages
    console.log('\n=== PERCENTAGE DIFFERENCES ===')
    if (dailySalesData.totalNetSales > 0) {
      const salesDiffPct = ((dashboardData.data.currentNetSales - dailySalesData.totalNetSales) / dailySalesData.totalNetSales * 100).toFixed(2)
      console.log(`Net Sales: ${salesDiffPct}%`)
    }
    if (dailySalesData.totalOrders > 0) {
      const ordersDiffPct = ((dashboardData.data.currentTotalOrders - dailySalesData.totalOrders) / dailySalesData.totalOrders * 100).toFixed(2)
      console.log(`Orders: ${ordersDiffPct}%`)
    }

  } catch (error) {
    console.error('Error:', error.message)
  }
}

testKPIComparison()
