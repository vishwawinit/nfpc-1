'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Package, ShoppingCart, TrendingUp, Store, DollarSign, BarChart3, Maximize, Minimize, RefreshCw, ZoomIn, ZoomOut, X } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { LoadingBar } from '@/components/ui/LoadingBar'
import { businessColors } from '@/styles/businessColors'
import { useDashboardFilters } from '@/hooks/useDashboardFilters'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { useSalesByChannel } from '@/hooks/useDataService'
import { EnhancedKPICards } from '@/components/dashboard/EnhancedKPICards'
import { clientCache } from '@/lib/clientCache'

export const DailyStockSaleReport: React.FC = () => {
  const [selectedDateRange, setSelectedDateRange] = useState('lastMonth')
  const [isInitialized, setIsInitialized] = useState(false)
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary')
  const [loading, setLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Use the dashboard filters hook with hierarchy support
  const {
    filters,
    filterOptions,
    loading: filtersLoading,
    error: filtersError,
    updateFilter,
    setDateRange,
    resetFilters,
    getQueryParams,
    hierarchyInfo
  } = useDashboardFilters()

  // Channel colors for pie chart
  const CHANNEL_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

  // Data states
  const [summary, setSummary] = useState<any>(null)
  const [trendData, setTrendData] = useState<any[]>([])
  const [productsData, setProductsData] = useState<any[]>([])
  const [storesData, setStoresData] = useState<any[]>([])
  const [usersData, setUsersData] = useState<any[]>([])
  const [transactionsData, setTransactionsData] = useState<any[]>([])
  const [paginationInfo, setPaginationInfo] = useState<any>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [searchTerm, setSearchTerm] = useState('')

  // Table fullscreen and zoom state
  const [isTableFullscreen, setIsTableFullscreen] = useState(false)
  const [tableZoom, setTableZoom] = useState(100)

  // Get days from range
  const getDaysFromRange = (range: string): number => {
    switch (range) {
      case 'today': return 1
      case 'yesterday': return 2
      case 'thisWeek': return 7
      case 'lastWeek': return 14
      case 'thisMonth': return 30
      case 'lastMonth': return 60
      case 'thisQuarter': return 90
      case 'lastQuarter': return 90
      case 'thisYear': return 365
      default: return 30
    }
  }

  const getDateRangeLabel = (range: string): string => {
    switch (range) {
      case 'today': return 'Today'
      case 'yesterday': return 'Yesterday'
      case 'thisWeek': return 'Last 7 Days'
      case 'lastWeek': return 'Last 14 Days'
      case 'thisMonth': return 'This Month'
      case 'lastMonth': return 'Last Month'
      case 'thisQuarter': return 'This Quarter'
      case 'lastQuarter': return 'Last Quarter'
      case 'thisYear': return 'This Year'
      default: return 'This Month'
    }
  }

  // Handle date range preset selection - update filters accordingly
  const handleDateRangeSelect = (range: string) => {
    setSelectedDateRange(range)

    // Convert preset to actual dates and update filters
    const currentDate = new Date()
    let startDate: Date | null = null
    let endDate: Date | null = null

    switch (range) {
      case 'today':
        startDate = currentDate
        endDate = currentDate
        break
      case 'yesterday':
        const yesterday = new Date(currentDate)
        yesterday.setDate(yesterday.getDate() - 1)
        startDate = yesterday
        endDate = yesterday
        break
      case 'thisWeek':
        const weekStart = new Date(currentDate)
        weekStart.setDate(weekStart.getDate() - 6)
        startDate = weekStart
        endDate = currentDate
        break
      case 'thisMonth':
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        endDate = currentDate
        break
      case 'lastMonth':
        const lastMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
        const lastMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0)
        startDate = lastMonthStart
        endDate = lastMonthEnd
        break
      case 'thisQuarter':
        const quarterStart = new Date(currentDate.getFullYear(), Math.floor(currentDate.getMonth() / 3) * 3, 1)
        startDate = quarterStart
        endDate = currentDate
        break
      case 'lastQuarter':
        const currentQuarterStart = new Date(currentDate.getFullYear(), Math.floor(currentDate.getMonth() / 3) * 3, 1)
        const lastQuarterStart = new Date(currentQuarterStart)
        lastQuarterStart.setMonth(lastQuarterStart.getMonth() - 3)
        startDate = lastQuarterStart
        endDate = new Date(currentQuarterStart.getTime() - 1)
        break
      case 'thisYear':
        startDate = new Date(currentDate.getFullYear(), 0, 1)
        endDate = currentDate
        break
      default:
        const thirtyDaysAgo = new Date(currentDate)
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        startDate = thirtyDaysAgo
        endDate = currentDate
    }

    // Update filters with formatted dates (YYYY-MM-DD)
    if (startDate && endDate) {
      // Format date without timezone conversion to avoid off-by-one errors
      const formatDate = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
      setDateRange(formatDate(startDate), formatDate(endDate))
    }
  }

  // Initialize date range on mount
  useEffect(() => {
    if (!isInitialized) {
      handleDateRangeSelect(selectedDateRange)
      setIsInitialized(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, selectedDateRange])

  // Detect mobile
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Memoize query params to prevent infinite re-renders
  // Track all filter properties individually to ensure proper updates
  const queryParams = useMemo(() => {
    const params = getQueryParams()
    return params.toString()
  }, [
    filters.startDate,
    filters.endDate,
    filters.areaCode,
    filters.subAreaCode,
    filters.fieldUserRole,
    filters.teamLeaderCode,
    filters.userCode,
    filters.chainName,
    filters.storeCode,
    getQueryParams
  ])

  // Fetch sales by channel data
  const { data: salesByChannelData, loading: channelLoading } = useSalesByChannel({
    additionalParams: new URLSearchParams(queryParams)
  })

  // Memoize loadData to prevent unnecessary re-creations
  const loadData = useCallback(async () => {
    // Ensure we're in the browser and have valid query params
    if (typeof window === 'undefined') return

    // Get current query params fresh each time
    const currentQueryParams = getQueryParams().toString()

    if (!currentQueryParams || currentQueryParams.trim() === '') {
      console.warn('DailyStockSaleReport: Skipping loadData - queryParams is empty')
      return
    }

    // Check if we have valid date range
    if (!filters.startDate || !filters.endDate) {
      console.warn('DailyStockSaleReport: Skipping loadData - missing date range')
      return
    }

    setLoading(true)
    try {
      // Helper for safe fetch with client-side caching
      const cachedFetch = async (url: string): Promise<any> => {
        // Extract path and params from URL
        const [path, paramsStr] = url.split('?')
        const params = new URLSearchParams(paramsStr)

        // Check client cache first
        const cached = clientCache.get(path, params)
        if (cached) {
          return cached
        }

        // Fetch if not cached
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
          // Use browser default caching behavior to respect server Cache-Control headers
        })

        if (!response.ok) {
          const errorText = await response.text()
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`
          try {
            const errorJson = JSON.parse(errorText)
            errorMessage = errorJson.error || errorJson.message || errorMessage
          } catch {
            errorMessage = errorText || errorMessage
          }
          throw new Error(errorMessage)
        }

        const data = await response.json()

        // Store in client cache for 5 minutes
        clientCache.set(path, data, params, 5 * 60 * 1000)

        return data
      }

      // Add pagination params for transactions
      const transactionsParams = new URLSearchParams(currentQueryParams)
      transactionsParams.append('page', currentPage.toString())
      transactionsParams.append('limit', itemsPerPage.toString())

      // Fetch all data in parallel with client-side caching
      const [summaryData, trendResult, productsResult, storesResult, usersResult, transactionsResult] = await Promise.all([
        cachedFetch(`/api/daily-sales/summary?${currentQueryParams}`),
        cachedFetch(`/api/daily-sales/trend?${currentQueryParams}`),
        cachedFetch(`/api/daily-sales/products?${currentQueryParams}`),
        cachedFetch(`/api/daily-sales/stores?${currentQueryParams}`),
        cachedFetch(`/api/daily-sales/users?${currentQueryParams}`),
        cachedFetch(`/api/daily-sales/transactions?${transactionsParams.toString()}`)
      ])

      console.log('📊 Daily Sales Report - Data loaded with filters:', {
        queryParams: currentQueryParams,
        productsCount: productsResult?.products?.length || 0,
        topProduct: productsResult?.products?.[0]?.productCode,
        storesCount: storesResult?.stores?.length || 0,
        topStore: storesResult?.stores?.[0]?.storeCode
      })

      setSummary(summaryData)
      setTrendData(trendResult?.trend || [])
      setProductsData(productsResult?.products || [])
      setStoresData(storesResult?.stores || [])
      setUsersData(usersResult?.users || [])
      // Handle pagination response from API
      setTransactionsData(transactionsResult?.transactions || [])
      setPaginationInfo(transactionsResult?.pagination || null)
    } catch (error) {
      console.error('Error loading sales data:', error)
      // Check if it's a network error
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        const networkError = 'Network error: Unable to connect to the server. Please check if the server is running and try again.'
        console.error('Network error details:', {
          error,
          queryParams: currentQueryParams,
          url: window.location.href
        })
        // Optionally show user-friendly error message
        alert(networkError)
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch sales data'
        console.error('Detailed error:', errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }, [filters.startDate, filters.endDate, getQueryParams])

  // Reset to page 1 when filters change (but not when only pagination changes)
  useEffect(() => {
    setCurrentPage(1)
  }, [queryParams])

  // Load data when filters or pagination change
  useEffect(() => {
    if (filters.startDate && filters.endDate && queryParams) {
      loadData()
    }
  }, [queryParams, currentPage, itemsPerPage, loadData, filters.startDate, filters.endDate])

  const handleExport = useCallback(async () => {
    try {
      const currentQueryParams = getQueryParams().toString()
      window.location.href = `/api/daily-sales/export?${currentQueryParams}`
    } catch (error) {
      console.error('Export failed:', error)
    }
  }, [getQueryParams])

  // Format currency
  const formatCurrency = (amount: number | null | undefined) => {
    const currency = summary?.currencyCode || 'AED'
    const validAmount = amount ?? 0
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(validAmount)
  }

  // Get top products for chart - keep full info for tooltips
  const topProductsChart = useMemo(() => {
    if (!Array.isArray(productsData) || productsData.length === 0) return []

    const result = productsData
      .filter(p => p && p.productCode) // Filter out invalid items
      .map(p => ({
        name: (p.productName?.substring(0, 30) || p.productCode?.substring(0, 30)) + ((p.productName?.length || p.productCode?.length || 0) > 30 ? '...' : '') || 'Unknown Product',
        fullName: p.productName || p.productCode || 'Unknown Product',
        productCode: p.productCode || 'N/A',
        value: parseFloat(p.netSales) || 0
      }))
      .sort((a, b) => b.value - a.value) // Sort by netSales descending
      .slice(0, 10) // Take top 10

    console.log('📈 Top 10 Products Chart Updated:', {
      totalProducts: productsData.length,
      top3: result.slice(0, 3).map(p => ({ code: p.productCode, sales: p.value }))
    })

    return result
  }, [productsData])

  // Get top stores for chart
  const topStoresChart = useMemo(() => {
    if (!Array.isArray(storesData) || storesData.length === 0) return []

    const result = storesData
      .filter(s => s && s.storeCode) // Filter out invalid items
      .map(s => ({
        name: (s.storeName || s.storeCode || 'Unknown Store').substring(0, 40) + ((s.storeName || s.storeCode || '').length > 40 ? '...' : ''),
        fullName: s.storeName || s.storeCode || 'Unknown Store',
        storeCode: s.storeCode || 'N/A',
        value: parseFloat(s.netSales) || 0
      }))
      .sort((a, b) => b.value - a.value) // Sort by netSales descending
      .slice(0, 10) // Take top 10

    console.log('🏪 Top 10 Stores Chart Updated:', {
      totalStores: storesData.length,
      top3: result.slice(0, 3).map(s => ({ code: s.storeCode, sales: s.value }))
    })

    return result
  }, [storesData])

  // Pie chart data transformation - group channels < 5% as "Others"
  const pieChartData = useMemo(() => {
    if (!salesByChannelData || salesByChannelData.length === 0) return []

    const totalSales = salesByChannelData.reduce((sum: number, channel: any) => sum + Number(channel.sales), 0)

    const channelsWithPercentage = salesByChannelData.map((channel: any) => ({
      ...channel,
      percentage: (Number(channel.sales) / totalSales) * 100
    }))

    const significantChannels = channelsWithPercentage.filter((c: any) => c.percentage >= 5)
    const minorChannels = channelsWithPercentage.filter((c: any) => c.percentage < 5)

    const result = significantChannels.map((c: any) => ({
      channel: c.channel,
      sales: Number(c.sales),
      orders: c.orders,
      customers: c.customers,
      percentage: c.percentage
    }))

    if (minorChannels.length > 0) {
      const othersSales = minorChannels.reduce((sum: number, c: any) => sum + Number(c.sales), 0)
      const othersOrders = minorChannels.reduce((sum: number, c: any) => sum + c.orders, 0)
      const othersCustomers = minorChannels.reduce((sum: number, c: any) => sum + c.customers, 0)

      result.push({
        channel: 'Others',
        sales: othersSales,
        orders: othersOrders,
        customers: othersCustomers,
        percentage: (othersSales / totalSales) * 100
      })
    }

    return result
  }, [salesByChannelData])

  // Transform sales trend data for chart with appropriate date formatting
  const trendChartData = useMemo(() => {
    if (!Array.isArray(trendData) || trendData.length === 0) return []

    // First, filter and sort by date
    const validData = trendData
      .filter(item => item && item.date) // Filter out invalid items
      .map(item => {
        try {
          const date = new Date(item.date)
          // Check if date is valid
          if (isNaN(date.getTime())) {
            console.warn('Invalid date in trend data:', item.date)
            return null
          }
          return {
            ...item,
            parsedDate: date
          }
        } catch (error) {
          console.error('Error parsing date in trend data:', item, error)
          return null
        }
      })
      .filter(item => item !== null) // Remove null items
      .sort((a, b) => a!.parsedDate.getTime() - b!.parsedDate.getTime()) // Sort by date

    // Then format for display
    return validData.map(item => {
      const date = item!.parsedDate
      let formattedDate = ''
      let fullDate = ''

      // Format date based on selected range for better readability
      switch (selectedDateRange) {
        case 'thisYear':
          // Monthly aggregates - show month names
          formattedDate = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
          fullDate = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          break
        case 'thisQuarter':
        case 'lastQuarter':
          // Weekly aggregates - show week starting date
          formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          fullDate = 'Week of ' + date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          break
        default:
          // Daily aggregates - show month and day
          formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          fullDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      }

      return {
        date: formattedDate,
        fullDate: fullDate,
        sales: parseFloat(item!.sales) || 0,
        orders: parseInt(item!.orders) || 0,
        customers: parseInt(item!.customers) || 0
      }
    })
  }, [trendData, selectedDateRange])

  const COLORS = businessColors.charts

  // Use transactions data directly from API (server-side pagination)
  const paginatedTransactions = transactionsData

  // Get pagination info from API response
  const totalPages = paginationInfo?.totalPages || 1
  const totalTransactionsCount = paginationInfo?.total || 0
  const startIndex = paginationInfo ? (paginationInfo.page - 1) * paginationInfo.limit : 0
  const endIndex = paginationInfo ? Math.min(startIndex + paginationInfo.limit, totalTransactionsCount) : 0

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    // Scroll to top of table
    document.querySelector('.scrollable-table-container')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1)
    loadData()
  }

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-white p-6 space-y-6 overflow-y-auto" : "min-h-screen bg-slate-50 p-4 md:p-6"}>
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
              Daily Sales Report
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Comprehensive sales analysis with advanced filtering
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={loadData} disabled={loading} variant="outline" size="sm" className="sm:size-default">
              <RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              onClick={() => setIsFullscreen(!isFullscreen)}
              variant="outline"
              size="sm"
              className="sm:size-default"
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Dashboard Filters */}
      <DashboardFilters
        filters={filters}
        filterOptions={filterOptions}
        onFilterChange={updateFilter}
        onDateRangeChange={setDateRange}
        onReset={resetFilters}
        loading={filtersLoading}
        selectedDateRange={selectedDateRange}
        onDateRangeSelect={handleDateRangeSelect}
        showChainFilter={true}
        showStoreFilter={true}
        hierarchyInfo={hierarchyInfo}
      />

      {/* View Mode Toggle */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
          <button
            onClick={() => setViewMode('summary')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'summary'
              ? 'bg-blue-600 text-white'
              : 'text-gray-700 hover:text-gray-900'
              }`}
          >
            Summary View
          </button>
          <button
            onClick={() => setViewMode('detailed')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'detailed'
              ? 'bg-blue-600 text-white'
              : 'text-gray-700 hover:text-gray-900'
              }`}
          >
            Detailed View
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <LoadingBar message="Loading sales data..." />
      )}

      {/* KPI Cards */}
      {!loading && (
        <div className="mb-6">
          <EnhancedKPICards
            dateRange={selectedDateRange}
            additionalParams={getQueryParams()}
          />
        </div>
      )}

      {/* Summary View - Charts */}
      {!loading && viewMode === 'summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Daily Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Sales Trend</CardTitle>
              <CardDescription>Sales performance over time</CardDescription>
            </CardHeader>
            <CardContent>
              {trendChartData.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-gray-500">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No trend data available for the selected period</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={trendChartData} margin={{ top: 5, right: 50, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      label={{ value: 'Date', position: 'insideBottom', offset: -10, style: { fontSize: 12, fill: '#374151', fontWeight: 600 } }}
                      tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
                    />
                    {/* Left Y-Axis for Sales Amount in INR */}
                    <YAxis
                      yAxisId="left"
                      tickFormatter={(value) => `AED${(value / 1000).toFixed(0)}K`}
                      label={{ value: 'Sales (AED)', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#374151', fontWeight: 600 } }}
                      tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
                    />
                    {/* Right Y-Axis for Orders, Customers */}
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value.toString()}
                      label={{ value: 'Orders/Customers', angle: 90, position: 'insideRight', style: { fontSize: 11, fill: '#374151', fontWeight: 600 } }}
                      tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
                    />
                    <Tooltip
                      formatter={(value: any, name: string) => {
                        if (name === 'Sales (AED)') {
                          return [`AED${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name]
                        }
                        return [Number(value).toLocaleString(), name]
                      }}
                      labelFormatter={(label: string) => {
                        // Find the full date for this label
                        const dataPoint = trendChartData.find(d => d.date === label)
                        return dataPoint?.fullDate || label
                      }}
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '2px solid #3b82f6',
                        borderRadius: '8px',
                        fontSize: '14px',
                        padding: '12px 16px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                      }}
                      labelStyle={{
                        fontWeight: '600',
                        fontSize: '15px',
                        color: '#1f2937',
                        marginBottom: '8px'
                      }}
                      itemStyle={{
                        fontSize: '14px',
                        padding: '4px 0'
                      }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '10px' }}
                      iconType="line"
                    />
                    {/* Sales - Primary line (Blue) */}
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="sales"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={{ fill: '#3b82f6', strokeWidth: 2, r: 5 }}
                      activeDot={{ r: 8, strokeWidth: 3, fill: '#3b82f6', stroke: '#fff' }}
                      name="Sales (AED)"
                    />
                    {/* Orders - Line (Green) */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="orders"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 7, strokeWidth: 3, fill: '#10b981', stroke: '#fff' }}
                      name="Orders"
                    />
                    {/* Customers - Line (Orange) */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="customers"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={{ fill: '#f97316', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 7, strokeWidth: 3, fill: '#f97316', stroke: '#fff' }}
                      name="Customers"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top Products */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Products</CardTitle>
              <CardDescription>Best performing products by sales</CardDescription>
            </CardHeader>
            <CardContent>
              {topProductsChart.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-gray-500">
                  <div className="text-center">
                    <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No product data available for the selected period</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topProductsChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={true} vertical={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => `AED${(value / 1000).toFixed(0)}K`}
                      style={{ fontSize: '12px', fill: '#6b7280' }}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={150}
                      style={{ fontSize: '11px', fill: '#374151' }}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length > 0) {
                          const data = payload[0].payload
                          return (
                            <div style={{
                              backgroundColor: '#fff',
                              border: '2px solid #10b981',
                              borderRadius: '8px',
                              fontSize: '13px',
                              padding: '12px 16px',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                            }}>
                              <div style={{ marginBottom: '8px' }}>
                                <div style={{ fontWeight: '600', color: '#374151', marginBottom: '4px' }}>{data.fullName}</div>
                                {data.productCode && <div style={{ fontSize: '11px', color: '#6b7280' }}>Code: {data.productCode}</div>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
                                <span style={{ fontWeight: '600', color: '#1f2937' }}>
                                  AED{Number(payload[0].value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          )
                        }
                        return null
                      }}
                      cursor={{ fill: 'rgba(16, 185, 129, 0.1)' }}
                    />
                    <Bar
                      dataKey="value"
                      fill="#10b981"
                      name="Sales"
                      radius={[0, 6, 6, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top Stores */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Stores</CardTitle>
              <CardDescription>Best performing stores by sales</CardDescription>
            </CardHeader>
            <CardContent>
              {topStoresChart.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-gray-500">
                  <div className="text-center">
                    <Store className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No store data available for the selected period</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topStoresChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      style={{ fontSize: '11px', fill: '#374151' }}
                      interval={0}
                    />
                    <YAxis
                      tickFormatter={(value) => `AED${(value / 1000).toFixed(0)}K`}
                      style={{ fontSize: '12px', fill: '#6b7280' }}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length > 0) {
                          const data = payload[0].payload
                          return (
                            <div style={{
                              backgroundColor: '#fff',
                              border: '2px solid #3b82f6',
                              borderRadius: '8px',
                              fontSize: '13px',
                              padding: '12px 16px',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                            }}>
                              <div style={{ marginBottom: '8px' }}>
                                <div style={{ fontWeight: '600', color: '#374151', marginBottom: '4px' }}>{data.fullName}</div>
                                {data.storeCode && <div style={{ fontSize: '11px', color: '#6b7280' }}>Code: {data.storeCode}</div>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'inline-block' }}></span>
                                <span style={{ fontWeight: '600', color: '#1f2937' }}>
                                  AED{Number(payload[0].value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          )
                        }
                        return null
                      }}
                      cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                    />
                    <Bar
                      dataKey="value"
                      fill="#3b82f6"
                      name="Sales"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={60}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Sales by Channel */}
          <Card>
            <CardHeader>
              <CardTitle>Sales by Channel</CardTitle>
            </CardHeader>
            <CardContent>
              {channelLoading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  Loading channel data...
                </div>
              ) : salesByChannelData && salesByChannelData.length > 0 ? (
                <div>
                  {/* Pie Chart - Shows channels >= 5% individually, others grouped */}
                  <div style={{ height: isMobile ? '250px' : '300px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={true}
                          label={({ channel, percentage }) => {
                            // Shorten long channel names for better display
                            const shortName = channel.length > 12 ? channel.substring(0, 12) + '...' : channel
                            return `${shortName} ${percentage.toFixed(1)}%`
                          }}
                          outerRadius={isMobile ? 60 : 80}
                          fill="#8884d8"
                          dataKey="sales"
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) return null

                            const data = payload[0].payload

                            return (
                              <div style={{
                                backgroundColor: '#fff',
                                border: '2px solid #3b82f6',
                                borderRadius: '8px',
                                padding: '14px 18px',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                                fontSize: '13px',
                                lineHeight: '1.6'
                              }}>
                                <div style={{ fontWeight: '600', marginBottom: '6px', fontSize: '14px', color: '#1f2937' }}>
                                  {data.channel}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'inline-block' }}></span>
                                  <span>Sales: AED{Number(data.sales).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
                                  <span>Orders: {data.orders?.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }}></span>
                                  <span>Customers: {data.customers?.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#8b5cf6', display: 'inline-block' }}></span>
                                  <span>Share: {data.percentage?.toFixed(2)}%</span>
                                </div>
                              </div>
                            )
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Channel Legend - Shows ALL channels individually */}
                  <div style={{
                    marginTop: isMobile ? '12px' : '16px',
                    maxHeight: isMobile ? '150px' : '180px',
                    overflowY: 'auto',
                    paddingRight: isMobile ? '4px' : '8px'
                  }}>
                    {salesByChannelData.map((channel: any, index: number) => {
                      const percentage = (Number(channel.sales) / salesByChannelData.reduce((sum: number, c: any) => sum + Number(c.sales), 0)) * 100
                      return (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: isMobile ? '8px' : '10px 12px',
                            marginBottom: isMobile ? '6px' : '8px',
                            backgroundColor: '#f9fafb',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f3f4f6'
                            e.currentTarget.style.borderColor = '#d1d5db'
                            e.currentTarget.style.transform = 'translateX(4px)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#f9fafb'
                            e.currentTarget.style.borderColor = '#e5e7eb'
                            e.currentTarget.style.transform = 'translateX(0)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '10px', flex: 1 }}>
                            <div style={{
                              width: isMobile ? '10px' : '12px',
                              height: isMobile ? '10px' : '12px',
                              borderRadius: '50%',
                              backgroundColor: CHANNEL_COLORS[index % CHANNEL_COLORS.length],
                              flexShrink: 0
                            }} />
                            <span style={{
                              fontWeight: '500',
                              color: '#374151',
                              fontSize: isMobile ? '13px' : '14px'
                            }}>
                              {channel.channel}
                            </span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: '600', color: '#1f2937', fontSize: isMobile ? '13px' : '14px' }}>
                              {formatCurrency(Number(channel.sales))}
                            </div>
                            <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#6b7280', marginTop: '2px' }}>
                              {percentage.toFixed(2)}% • {channel.orders} orders
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                  No channel data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed View - Comprehensive Data Table */}
      {viewMode === 'detailed' && (
        <div className={isTableFullscreen ? "fixed inset-0 z-50 bg-white" : ""}>
          <Card className={isTableFullscreen ? "h-full rounded-none" : ""}>
            <CardHeader>
              <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                <div>
                  <CardTitle>Detailed Transaction Data</CardTitle>
                  <CardDescription>
                    {loading ? (
                      'Loading transaction data...'
                    ) : (
                      <>
                        Showing {startIndex + 1}-{endIndex} of {totalTransactionsCount} transactions
                      </>
                    )}
                  </CardDescription>
                </div>

                {/* Items Per Page Control */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Per page:</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                    className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                  </select>
                </div>

                {/* Table Controls */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={() => setTableZoom(Math.max(50, tableZoom - 10))}
                    variant="outline"
                    size="sm"
                    title="Zoom Out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="flex items-center px-2 text-sm text-gray-600">{tableZoom}%</span>
                  <Button
                    onClick={() => setTableZoom(Math.min(150, tableZoom + 10))}
                    variant="outline"
                    size="sm"
                    title="Zoom In"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => setIsTableFullscreen(!isTableFullscreen)}
                    variant="outline"
                    size="sm"
                    title={isTableFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                  >
                    {isTableFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                  </Button>
                  {isTableFullscreen && (
                    <Button
                      onClick={() => setIsTableFullscreen(false)}
                      variant="outline"
                      size="sm"
                      title="Close"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Button onClick={handleExport} variant="default" size="sm">
                    Export to Excel
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-12 py-0">
              {loading && transactionsData.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <RefreshCw className="h-8 w-8 text-gray-400 mx-auto mb-4 animate-spin" />
                    <p className="text-gray-600">Loading transaction data...</p>
                  </div>
                </div>
              ) : (
                <>
                  <style jsx>{`
              .scrollable-table-container {
                overflow-x: auto;
                overflow-y: auto;
                position: relative;
              }
              .scrollable-table-container::-webkit-scrollbar {
                width: 14px;
                height: 14px;
              }
              .scrollable-table-container::-webkit-scrollbar-track {
                background: #fafafa;
                border-radius: 8px;
                border: 1px solid #f0f0f0;
              }
              .scrollable-table-container::-webkit-scrollbar-thumb {
                background: linear-gradient(180deg, #e8e8e8 0%, #d4d4d4 100%);
                border-radius: 8px;
                border: 2px solid #fafafa;
              }
              .scrollable-table-container::-webkit-scrollbar-thumb:hover {
                background: linear-gradient(180deg, #d4d4d4 0%, #c0c0c0 100%);
              }
              .scrollable-table-container::-webkit-scrollbar-corner {
                background: #fafafa;
              }
              .table-wrapper {
                display: block;
                width: 100%;
                overflow: visible;
              }
              .sticky-header {
                position: sticky;
                top: 0;
                z-index: 100;
                background-color: #f3f4f6;
              }
              .sticky-header th {
                position: sticky;
                top: 0;
                background-color: #f3f4f6;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
            `}</style>
                  <div
                    className={`scrollable-table-container ${isTableFullscreen ? "max-h-[calc(100vh-200px)]" : "max-h-[600px]"}`}
                  >
                    <div className="table-wrapper" style={{ transform: `scale(${tableZoom / 100})`, transformOrigin: 'top left', width: `${10000 / tableZoom}%` }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead className="sticky-header">
                          <tr className="border-b-2 border-gray-400">
                            <th className="font-semibold text-gray-800 pl-12 pr-6 py-4 min-w-[140px] whitespace-nowrap text-left">Transaction Code</th>
                            <th className="font-semibold text-gray-800 px-6 py-4 min-w-[120px] whitespace-nowrap text-left">Date</th>
                            <th className="font-semibold text-gray-800 px-6 py-4 min-w-[140px] whitespace-nowrap text-left">Field User Code</th>
                            <th className="font-semibold text-gray-800 px-6 py-4 min-w-[180px] whitespace-nowrap text-left">Field User Name</th>
                            <th className="font-semibold text-gray-800 px-6 py-4 min-w-[120px] whitespace-nowrap text-left">AREA</th>
                            <th className="font-semibold text-gray-800 px-6 py-4 min-w-[120px] whitespace-nowrap text-left">Sub AREA</th>
                            <th className="font-semibold text-gray-800 px-6 py-4 min-w-[120px] whitespace-nowrap text-left">Store Code</th>
                            <th className="font-semibold text-gray-800 px-6 py-4 min-w-[200px] whitespace-nowrap text-left">Store Name</th>
                            <th className="font-semibold text-gray-800 px-6 py-4 min-w-[140px] whitespace-nowrap text-left">Product Code</th>
                            <th className="font-semibold text-gray-800 px-6 py-4 min-w-[250px] whitespace-nowrap text-left">Product Name</th>
                            <th className="font-semibold text-gray-800 px-6 py-4 min-w-[100px] text-right whitespace-nowrap">Quantity</th>
                            <th className="font-semibold text-gray-800 px-6 py-4 min-w-[130px] text-right whitespace-nowrap">Unit Price</th>
                            <th className="font-semibold text-gray-800 px-6 py-4 pr-12 min-w-[150px] text-right whitespace-nowrap">Total Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedTransactions.length === 0 ? (
                            <tr>
                              <td colSpan={13} className="text-center py-12 text-gray-500">
                                <div className="flex flex-col items-center gap-2">
                                  <Package className="h-12 w-12 text-gray-300" />
                                  <div className="text-lg font-medium">
                                    No transaction data available
                                  </div>
                                  <div className="text-sm">
                                    Select different filters or date range to view transactions
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            paginatedTransactions.map((trx, idx) => {
                              // Safe date formatting
                              const formatDate = (date: any) => {
                                try {
                                  if (!date) return '-'
                                  const d = new Date(date)
                                  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString()
                                } catch {
                                  return '-'
                                }
                              }

                              // Safe number formatting
                              const formatNumber = (num: any, decimals = 2) => {
                                const n = parseFloat(num)
                                return isNaN(n) ? '0.00' : n.toFixed(decimals)
                              }

                              return (
                                <tr key={`${trx.trxCode}-${startIndex + idx}`} className="hover:bg-gray-50 border-b border-gray-200">
                                  <td className="text-sm pl-12 pr-6 py-4 whitespace-nowrap">{trx.trxCode || '-'}</td>
                                  <td className="text-sm px-6 py-4 whitespace-nowrap">{formatDate(trx.trxDateOnly)}</td>
                                  <td className="text-sm px-6 py-4 whitespace-nowrap">{trx.fieldUserCode || '-'}</td>
                                  <td className="text-sm px-6 py-4">{trx.fieldUserName || '-'}</td>
                                  <td className="text-sm px-6 py-4 whitespace-nowrap">{trx.regionCode || '-'}</td>
                                  <td className="text-sm px-6 py-4 whitespace-nowrap">{trx.cityName || trx.cityCode || '-'}</td>
                                  <td className="text-sm px-6 py-4 whitespace-nowrap">{trx.storeCode || '-'}</td>
                                  <td className="text-sm px-6 py-4" title={trx.storeName}>{trx.storeName || '-'}</td>
                                  <td className="text-sm px-6 py-4 whitespace-nowrap">{trx.productCode || '-'}</td>
                                  <td className="text-sm px-6 py-4" title={trx.productName}>{trx.productName || '-'}</td>
                                  <td className="text-sm text-right px-6 py-4 whitespace-nowrap">{formatNumber(trx.quantity)}</td>
                                  <td className="text-sm text-right px-6 py-4 whitespace-nowrap">{formatCurrency(trx.unitPrice)}</td>
                                  <td className="text-sm text-right font-bold px-6 py-4 pr-12 whitespace-nowrap">{formatCurrency(trx.lineAmount)}</td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagination Controls */}
                  {paginatedTransactions.length > 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-4 border-t border-gray-200 bg-gray-50">
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">
                          {totalTransactionsCount === 0 ? 'No transactions found' :
                            `Showing ${startIndex + 1}-${endIndex} of ${totalTransactionsCount} transactions`}
                        </span>
                      </div>

                      {totalPages > 1 && (
                        <div className="flex items-center gap-1">
                          <Button
                            onClick={() => handlePageChange(1)}
                            disabled={currentPage === 1}
                            variant="outline"
                            size="sm"
                            className="hidden sm:inline-flex"
                          >
                            First
                          </Button>
                          <Button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            variant="outline"
                            size="sm"
                          >
                            Previous
                          </Button>

                          {/* Page Numbers */}
                          <div className="flex items-center gap-1 mx-2">
                            {totalPages <= 7 ? (
                              // Show all pages if 7 or fewer
                              [...Array(totalPages)].map((_, i) => (
                                <Button
                                  key={i + 1}
                                  onClick={() => handlePageChange(i + 1)}
                                  variant={currentPage === i + 1 ? "default" : "outline"}
                                  size="sm"
                                  className="w-8 h-8 p-0"
                                >
                                  {i + 1}
                                </Button>
                              ))
                            ) : (
                              // Show abbreviated pagination for many pages
                              <>
                                {currentPage > 3 && (
                                  <>
                                    <Button
                                      onClick={() => handlePageChange(1)}
                                      variant="outline"
                                      size="sm"
                                      className="w-8 h-8 p-0"
                                    >
                                      1
                                    </Button>
                                    {currentPage > 4 && <span className="text-gray-400 px-1">...</span>}
                                  </>
                                )}

                                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                                  const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i
                                  if (page > totalPages) return null
                                  return (
                                    <Button
                                      key={page}
                                      onClick={() => handlePageChange(page)}
                                      variant={currentPage === page ? "default" : "outline"}
                                      size="sm"
                                      className="w-8 h-8 p-0"
                                    >
                                      {page}
                                    </Button>
                                  )
                                })}

                                {currentPage < totalPages - 2 && (
                                  <>
                                    {currentPage < totalPages - 3 && <span className="text-gray-400 px-1">...</span>}
                                    <Button
                                      onClick={() => handlePageChange(totalPages)}
                                      variant="outline"
                                      size="sm"
                                      className="w-8 h-8 p-0"
                                    >
                                      {totalPages}
                                    </Button>
                                  </>
                                )}
                              </>
                            )}
                          </div>

                          <Button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            variant="outline"
                            size="sm"
                          >
                            Next
                          </Button>
                          <Button
                            onClick={() => handlePageChange(totalPages)}
                            disabled={currentPage === totalPages}
                            variant="outline"
                            size="sm"
                            className="hidden sm:inline-flex"
                          >
                            Last
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
