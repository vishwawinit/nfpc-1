import { NextResponse } from 'next/server'
import {
  getDailySalesSummary,
  getDailyTrend,
  getProductPerformance,
  getStorePerformance,
  getUserPerformance,
  getTransactionDetails,
  getFilterOptions
} from '@/services/dailySalesService'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const testType = searchParams.get('test') || 'all'
  
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: {},
    status: 'running'
  }

  // Default test filters - last 30 days
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 30)
  
  const testFilters = {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  }

  console.log('🧪 Testing Daily Sales Queries with filters:', testFilters)

  try {
    // Test 1: Filter Options
    if (testType === 'all' || testType === 'filters') {
      console.log('Testing getFilterOptions...')
      try {
        const filters = await getFilterOptions()
        results.tests.filterOptions = {
          status: 'success',
          data: {
            storesCount: filters.stores.length,
            productsCount: filters.products.length,
            usersCount: filters.users.length,
            regionsCount: filters.regions.length,
            currenciesCount: filters.currencies.length,
            categoriesCount: filters.categories.length,
            sampleStores: filters.stores.slice(0, 3),
            sampleProducts: filters.products.slice(0, 3),
            sampleUsers: filters.users.slice(0, 3)
          }
        }
        console.log('✅ Filter options loaded successfully')
      } catch (error: any) {
        results.tests.filterOptions = {
          status: 'error',
          error: error.message
        }
        console.error('❌ Filter options failed:', error.message)
      }
    }

    // Test 2: Daily Sales Summary
    if (testType === 'all' || testType === 'summary') {
      console.log('Testing getDailySalesSummary...')
      try {
        const summary = await getDailySalesSummary(testFilters)
        results.tests.summary = {
          status: 'success',
          data: summary
        }
        console.log('✅ Summary loaded:', {
          orders: summary.totalOrders,
          stores: summary.totalStores,
          sales: summary.totalNetSales
        })
      } catch (error: any) {
        results.tests.summary = {
          status: 'error',
          error: error.message
        }
        console.error('❌ Summary failed:', error.message)
      }
    }

    // Test 3: Daily Trend
    if (testType === 'all' || testType === 'trend') {
      console.log('Testing getDailyTrend...')
      try {
        const trend = await getDailyTrend(testFilters)
        results.tests.trend = {
          status: 'success',
          data: {
            recordCount: trend.length,
            sample: trend.slice(0, 5),
            dateRange: trend.length > 0 ? {
              first: trend[0]?.date,
              last: trend[trend.length - 1]?.date
            } : null
          }
        }
        console.log('✅ Trend loaded:', trend.length, 'records')
      } catch (error: any) {
        results.tests.trend = {
          status: 'error',
          error: error.message
        }
        console.error('❌ Trend failed:', error.message)
      }
    }

    // Test 4: Product Performance
    if (testType === 'all' || testType === 'products') {
      console.log('Testing getProductPerformance...')
      try {
        const products = await getProductPerformance(testFilters)
        results.tests.products = {
          status: 'success',
          data: {
            count: products.length,
            topProducts: products.slice(0, 5)
          }
        }
        console.log('✅ Products loaded:', products.length, 'records')
      } catch (error: any) {
        results.tests.products = {
          status: 'error',
          error: error.message
        }
        console.error('❌ Products failed:', error.message)
      }
    }

    // Test 5: Store Performance
    if (testType === 'all' || testType === 'stores') {
      console.log('Testing getStorePerformance...')
      try {
        const stores = await getStorePerformance(testFilters)
        results.tests.stores = {
          status: 'success',
          data: {
            count: stores.length,
            topStores: stores.slice(0, 5)
          }
        }
        console.log('✅ Stores loaded:', stores.length, 'records')
      } catch (error: any) {
        results.tests.stores = {
          status: 'error',
          error: error.message
        }
        console.error('❌ Stores failed:', error.message)
      }
    }

    // Test 6: User Performance
    if (testType === 'all' || testType === 'users') {
      console.log('Testing getUserPerformance...')
      try {
        const users = await getUserPerformance(testFilters)
        results.tests.users = {
          status: 'success',
          data: {
            count: users.length,
            topUsers: users.slice(0, 5)
          }
        }
        console.log('✅ Users loaded:', users.length, 'records')
      } catch (error: any) {
        results.tests.users = {
          status: 'error',
          error: error.message
        }
        console.error('❌ Users failed:', error.message)
      }
    }

    // Test 7: Transaction Details
    if (testType === 'all' || testType === 'transactions') {
      console.log('Testing getTransactionDetails...')
      try {
        const transactions = await getTransactionDetails(testFilters)
        results.tests.transactions = {
          status: 'success',
          data: {
            count: transactions.length,
            sample: transactions.slice(0, 5)
          }
        }
        console.log('✅ Transactions loaded:', transactions.length, 'records')
      } catch (error: any) {
        results.tests.transactions = {
          status: 'error',
          error: error.message
        }
        console.error('❌ Transactions failed:', error.message)
      }
    }

    // Check overall status
    const testResults = Object.values(results.tests)
    const failedTests = testResults.filter((t: any) => t.status === 'error')
    const successTests = testResults.filter((t: any) => t.status === 'success')

    results.status = failedTests.length === 0 ? 'success' : 'partial'
    results.summary = {
      total: testResults.length,
      success: successTests.length,
      failed: failedTests.length
    }

    if (failedTests.length === 0) {
      console.log('✅ All tests passed!')
    } else {
      console.log(`⚠️ ${failedTests.length} of ${testResults.length} tests failed`)
    }

    return NextResponse.json(results, {
      status: failedTests.length === 0 ? 200 : 500
    })

  } catch (error) {
    console.error('Test suite error:', error)
    results.status = 'error'
    results.error = {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }
    return NextResponse.json(results, { status: 500 })
  }
}

