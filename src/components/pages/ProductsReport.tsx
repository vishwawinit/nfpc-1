'use client'

import React, { useState, useEffect } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { Package, TrendingUp, TrendingDown, DollarSign, RefreshCw, ChevronDown, Download, X, Search, Filter, AlertTriangle, BarChart3, Users } from 'lucide-react'
import ExcelJS from 'exceljs'
import { formatCurrency, formatNumber, formatPercentage } from '@/lib/utils'
import { CustomDatePicker } from '@/components/ui/CustomDatePicker'
import { clientCache } from '@/lib/clientCache'

// Chart colors
const CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28DFF', '#FF6666', '#8DD1E1', '#83A6ED', '#8884D8', '#82CA9D']

// --- Interfaces ---
interface ProductMetric {
  // Comprehensive KPIs
  totalRevenue: number
  totalOrders: number
  totalQuantity: number
  uniqueCustomers: number
  uniqueProducts: number
  avgOrderValue: number

  // Product-specific metrics
  totalProducts: number
  activeProducts: number
  totalSales: number
  fastMoving: number
  slowMoving: number
  noSales: number
  currencyCode: string
}

interface SalesByBrand {
  brand: string
  sales: number
  products: number
  quantity: number
}

interface BrandSalesDistribution {
  brand: string
  sales: number
  products: number
  quantity: number
  percentage: number
}

interface TopProduct {
  productCode: string
  productName: string
  category: string
  brand: string
  sales: number
  quantity: number
  avgPrice: number
  movementStatus: string
  currencyCode: string
}

interface ProductAnalyticsData {
  metrics: ProductMetric
  salesByBrand: SalesByBrand[]
  brandSalesDistribution: BrandSalesDistribution[]
  topProducts: TopProduct[]
}

interface DetailedProduct {
  productCode: string
  productName: string
  category: string
  subcategory: string
  productGroup: string
  brand: string
  baseUom: string
  imageUrl: string
  maxPrice: number
  minPrice: number
  totalSales: number
  totalQuantity: number
  totalOrders: number
  avgPrice: number
  movementStatus: string
  isActive: boolean
  isDelist: boolean
  currencyCode: string
}

interface FilterOptions {
  channels: Array<{ code: string; name: string }>
  products?: Array<{ code: string; name: string }>
  brands?: Array<{ code: string; name: string }>
}

// --- Main Component ---
export function ProductsReport() {
  const [activeTab, setActiveTab] = useState('summary')
  const [analytics, setAnalytics] = useState<ProductAnalyticsData | null>(null)
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(true)

  // Filters state
  const [filters, setFilters] = useState({
    dateRange: 'lastMonth',
    channel: 'all',
    searchTerm: 'all',
    brand: 'all'
  })

  // Custom date range state
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Applied filters state
  const [appliedFilters, setAppliedFilters] = useState(filters)
  const [appliedCustomDates, setAppliedCustomDates] = useState({ start: '', end: '' })

  // Detailed view state
  const [allProducts, setAllProducts] = useState<DetailedProduct[]>([]) // Store all products
  const [detailedProducts, setDetailedProducts] = useState<DetailedProduct[]>([]) // Visible products for current page
  const [currentPage, setCurrentPage] = useState(1)
  const [totalProducts, setTotalProducts] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [sortBy, setSortBy] = useState('total_sales')
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC')

  // Fetch analytics data
  const fetchAnalytics = async () => {
    try {
      setAnalyticsLoading(true)
      const params = new URLSearchParams({
        range: appliedFilters.dateRange,
        ...(appliedCustomDates.start && { startDate: appliedCustomDates.start }),
        ...(appliedCustomDates.end && { endDate: appliedCustomDates.end }),
        ...(appliedFilters.channel !== 'all' && { channel: appliedFilters.channel }),
        ...(appliedFilters.searchTerm !== 'all' && { productCode: appliedFilters.searchTerm }),
        ...(appliedFilters.brand !== 'all' && { brand: appliedFilters.brand }),
      })

      // Check client cache first
      const cached = clientCache.get('/api/products/analytics', params)
      if (cached) {
        if (cached.success) {
          console.log('📊 Setting analytics data from cache:', cached.data)
          setAnalytics(cached.data)
          setError(null)
        } else {
          console.error('📊 Analytics fetch failed (cached):', cached.error)
          setError(cached.error || 'Failed to fetch analytics')
        }
        setAnalyticsLoading(false)
        return
      }

      const response = await fetch(`/api/products/analytics?${params}`)
      const result = await response.json()

      console.log('📊 Products Analytics Response:', result)

      // Store in client cache
      clientCache.set('/api/products/analytics', result, params, 5 * 60 * 1000)

      if (result.success) {
        console.log('📊 Setting analytics data:', result.data)
        console.log('📊 Metrics:', result.data?.metrics)
        setAnalytics(result.data)
        setError(null)
      } else {
        console.error('📊 Analytics fetch failed:', result.error)
        setError(result.error || 'Failed to fetch analytics')
      }
    } catch (err) {
      setError('Failed to fetch analytics')
      console.error('Error fetching analytics:', err)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  // Fetch filter options
  const fetchFilterOptions = async () => {
    try {
      const params = new URLSearchParams({
        range: appliedFilters.dateRange,
        includeProducts: 'true',
        ...(appliedCustomDates.start && { startDate: appliedCustomDates.start }),
        ...(appliedCustomDates.end && { endDate: appliedCustomDates.end }),
        ...(appliedFilters.channel !== 'all' && { channel: appliedFilters.channel }),
        ...(appliedFilters.brand !== 'all' && { brand: appliedFilters.brand }),
      })

      // Check client cache first
      const cached = clientCache.get('/api/products/filters', params)
      if (cached) {
        if (cached.success) {
          setFilterOptions(cached.data)
        }
        return
      }

      const response = await fetch(`/api/products/filters?${params}`)
      const result = await response.json()

      // Store in client cache
      clientCache.set('/api/products/filters', result, params, 5 * 60 * 1000)

      if (result.success) {
        setFilterOptions(result.data)
      }
    } catch (err) {
      console.error('Error fetching filter options:', err)
    }
  }

  // Fetch detailed products - Fetch ALL products at once for frontend pagination
  const fetchDetailedProducts = async () => {
    try {
      setDetailsLoading(true)
      const params = new URLSearchParams({
        range: appliedFilters.dateRange,
        limit: '999999', // Fetch all products
        sortBy: 'total_sales', // Default sort from backend
        sortOrder: 'DESC',
        ...(appliedCustomDates.start && { startDate: appliedCustomDates.start }),
        ...(appliedCustomDates.end && { endDate: appliedCustomDates.end }),
        ...(appliedFilters.channel !== 'all' && { channel: appliedFilters.channel }),
        ...(appliedFilters.searchTerm !== 'all' && { productCode: appliedFilters.searchTerm }),
        ...(appliedFilters.brand !== 'all' && { brand: appliedFilters.brand }),
      })

      // Check client cache first
      const cached = clientCache.get('/api/products/details', params)
      if (cached) {
        if (cached.success) {
          setAllProducts(cached.data.products)
          setTotalProducts(cached.data.products.length)
        } else {
          setError(cached.error || 'Failed to fetch products')
        }
        setDetailsLoading(false)
        return
      }

      const response = await fetch(`/api/products/details?${params}`)
      const result = await response.json()

      // Store in client cache
      clientCache.set('/api/products/details', result, params, 5 * 60 * 1000)

      if (result.success) {
        setAllProducts(result.data.products)
        setTotalProducts(result.data.products.length)
      } else {
        setError(result.error || 'Failed to fetch products')
      }
    } catch (err) {
      console.error('Error fetching detailed products:', err)
      setError('Failed to load product details')
    } finally {
      setDetailsLoading(false)
    }
  }

  const applyFilters = () => {
    setAppliedFilters(filters)
    setAppliedCustomDates({ start: customStartDate, end: customEndDate })
    setCurrentPage(1)
  }

  const resetFilters = () => {
    const initialFilters = {
      dateRange: 'lastMonth',
      channel: 'all',
      searchTerm: 'all',
      brand: 'all'
    }
    setFilters(initialFilters)
    setCustomStartDate('')
    setCustomEndDate('')
    setAppliedFilters(initialFilters)
    setAppliedCustomDates({ start: '', end: '' })
    setCurrentPage(1)
    setPageSize(25)
  }

  // Count active filters
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value && value !== 'all' && key !== 'dateRange'
  ).length

  useEffect(() => {
    fetchAnalytics()
    fetchFilterOptions()
  }, [appliedFilters.dateRange, appliedFilters.channel, appliedFilters.searchTerm, appliedFilters.brand, appliedCustomDates.start, appliedCustomDates.end])

  useEffect(() => {
    // Only fetch detailed products when on detailed tab and when filters change
    if (activeTab === 'detailed') {
      fetchDetailedProducts()
    }
  }, [activeTab, appliedFilters.dateRange, appliedFilters.channel, appliedFilters.searchTerm, appliedFilters.brand, appliedCustomDates.start, appliedCustomDates.end])

  // Frontend pagination and sorting logic
  useEffect(() => {
    if (allProducts.length === 0) {
      setDetailedProducts([])
      return
    }

    // Sort products on the frontend
    const sortedProducts = [...allProducts].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortBy) {
        case 'product_code':
          aValue = a.productCode
          bValue = b.productCode
          break
        case 'product_name':
          aValue = a.productName
          bValue = b.productName
          break
        case 'total_quantity':
          aValue = a.totalQuantity
          bValue = b.totalQuantity
          break
        case 'avg_price':
          aValue = a.avgPrice
          bValue = b.avgPrice
          break
        case 'total_sales':
          aValue = a.totalSales
          bValue = b.totalSales
          break
        default:
          aValue = a.totalSales
          bValue = b.totalSales
      }

      if (typeof aValue === 'string') {
        return sortOrder === 'ASC'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      } else {
        return sortOrder === 'ASC'
          ? aValue - bValue
          : bValue - aValue
      }
    })

    // Paginate on the frontend
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    const paginatedProducts = sortedProducts.slice(startIndex, endIndex)

    setDetailedProducts(paginatedProducts)
  }, [allProducts, currentPage, pageSize, sortBy, sortOrder])

  // Export to Excel - Use allProducts array with frontend sorting
  const exportToExcel = async () => {
    try {
      // Sort products same as current view
      const sortedProducts = [...allProducts].sort((a, b) => {
        let aValue: any
        let bValue: any

        switch (sortBy) {
          case 'product_code':
            aValue = a.productCode
            bValue = b.productCode
            break
          case 'product_name':
            aValue = a.productName
            bValue = b.productName
            break
          case 'total_quantity':
            aValue = a.totalQuantity
            bValue = b.totalQuantity
            break
          case 'avg_price':
            aValue = a.avgPrice
            bValue = b.avgPrice
            break
          case 'total_sales':
            aValue = a.totalSales
            bValue = b.totalSales
            break
          default:
            aValue = a.totalSales
            bValue = b.totalSales
        }

        if (typeof aValue === 'string') {
          return sortOrder === 'ASC'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue)
        } else {
          return sortOrder === 'ASC'
            ? aValue - bValue
            : bValue - aValue
        }
      })

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Products Report')

      worksheet.columns = [
        { header: 'Product Code', key: 'productCode', width: 15 },
        { header: 'Product Name', key: 'productName', width: 40 },
        { header: 'Product Brand', key: 'brand', width: 20 },
        { header: 'Quantity', key: 'totalQuantity', width: 15 },
        { header: 'Avg Price', key: 'avgPrice', width: 15 },
        { header: 'Total Amount', key: 'totalSales', width: 18 },
      ]

      worksheet.addRows(sortedProducts.map((p: DetailedProduct) => ({
        productCode: p.productCode,
        productName: p.productName,
        brand: p.brand || 'No Brand',
        totalQuantity: p.totalQuantity,
        avgPrice: parseFloat(p.avgPrice.toFixed(2)),
        totalSales: parseFloat(p.totalSales.toFixed(2)),
      })))

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Products_Report_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export to Excel:', err)
    }
  }

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC')
    } else {
      setSortBy(column)
      setSortOrder('DESC')
    }
  }

  const getSortIndicator = (column: string) => {
    if (sortBy === column) {
      return sortOrder === 'ASC' ? ' ▲' : ' ▼'
    }
    return ''
  }

  const getMovementStatusBadge = (status: string) => {
    switch (status) {
      case 'Fast':
        return <Badge className="bg-green-500 text-white">Fast Moving</Badge>
      case 'Medium':
        return <Badge variant="secondary">Medium Velocity</Badge>
      case 'Slow':
        return <Badge className="bg-orange-500 text-white">Low Velocity</Badge>
      case 'No Sales':
        return <Badge variant="destructive">Inactive</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatYAxis = (value: number) => {
    if (value >= 10000000) return `AED${(value / 10000000).toFixed(1)}Cr`
    if (value >= 100000) return `AED${(value / 100000).toFixed(0)}L`
    if (value >= 1000) return `AED${(value / 1000).toFixed(0)}K`
    return `AED${value}`
  }

  const totalPages = Math.ceil(totalProducts / pageSize)
  const metrics = analytics?.metrics

  console.log('📊 Rendering - Analytics:', analytics)
  console.log('📊 Rendering - Metrics:', metrics)
  console.log('📊 Rendering - analyticsLoading:', analyticsLoading)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Product Analysis</h1>
          <p className="text-gray-600 mt-1">
            Comprehensive product performance and sales analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={fetchAnalytics} disabled={analyticsLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${analyticsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div
          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3">
            <Filter className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-800">Filters</h3>
            {activeFilterCount > 0 && (
              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                {activeFilterCount} active
              </span>
            )}
            {(analyticsLoading || detailsLoading) && (
              <RefreshCw className="w-4 h-4 text-gray-500 animate-spin" />
            )}
          </div>
          <ChevronDown
            className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>

        {isExpanded && (
          <div className="p-5 border-t border-gray-200 space-y-5">
            {/* Filter Controls Row */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Filter size={18} className="text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-700">Filter Controls</h2>
                <span className="text-xs text-slate-500">Configure data parameters</span>
              </div>
              <button
                onClick={resetFilters}
                className="text-xs font-medium text-slate-600 hover:text-slate-800"
                type="button"
              >
                Reset Filters
              </button>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
                  Date Range
                </label>
                <Select
                  value={filters.dateRange}
                  onValueChange={(value) => {
                    const newFilters = { ...filters, dateRange: value }
                    setFilters(newFilters)
                    setAppliedFilters(newFilters)
                    setCurrentPage(1)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="thisWeek">Last 7 Days</SelectItem>
                    <SelectItem value="thisMonth">This Month</SelectItem>
                    <SelectItem value="lastMonth">Last Month</SelectItem>
                    <SelectItem value="thisQuarter">This Quarter</SelectItem>
                    <SelectItem value="lastQuarter">Last Quarter</SelectItem>
                    <SelectItem value="thisYear">This Year</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={filters.dateRange !== 'custom' ? 'opacity-50 pointer-events-none' : ''}>
                <CustomDatePicker
                  value={customStartDate}
                  onChange={(date) => {
                    setCustomStartDate(date)
                    if (date && customEndDate) {
                      setAppliedCustomDates({ start: date, end: customEndDate })
                      setCurrentPage(1)
                    }
                  }}
                  label="Start Date"
                  placeholder="Select start date"
                />
              </div>
              <div className={filters.dateRange !== 'custom' ? 'opacity-50 pointer-events-none' : ''}>
                <CustomDatePicker
                  value={customEndDate}
                  onChange={(date) => {
                    setCustomEndDate(date)
                    if (customStartDate && date) {
                      setAppliedCustomDates({ start: customStartDate, end: date })
                      setCurrentPage(1)
                    }
                  }}
                  label="End Date"
                  placeholder="Select end date"
                />
              </div>
            </div>

            {/* Main Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Product Brand Filter */}
              <SearchableSelect
                value={filters.brand === 'all' ? '' : filters.brand}
                onChange={(value) => {
                  const newFilters = { ...filters, brand: value || 'all', searchTerm: 'all' }
                  setFilters(newFilters)
                  setAppliedFilters(newFilters)
                  setCurrentPage(1)
                }}
                options={[
                  ...(filterOptions?.brands || []).map(b => ({
                    value: b.code,
                    label: b.name
                  }))
                ]}
                placeholder="All Brands"
                label="Product Brand"
              />

              {/* Product Search Filter */}
              <SearchableSelect
                value={filters.searchTerm === 'all' ? '' : filters.searchTerm}
                onChange={(value) => {
                  const newFilters = { ...filters, searchTerm: value || 'all' }
                  setFilters(newFilters)
                  setAppliedFilters(newFilters)
                  setCurrentPage(1)
                }}
                options={[
                  ...(filterOptions?.products || []).map(p => ({
                    value: p.code,
                    label: `${p.name} - ${p.code}`
                  }))
                ]}
                placeholder="All Products"
                label=" Product"
              />
            </div>

            {/* Filter Status and Reset */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                {activeFilterCount > 0 && (
                  <span>
                    Showing filtered data with {activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={resetFilters}
                  variant="outline"
                  className="flex items-center gap-2"
                  disabled={activeFilterCount === 0 || analyticsLoading || detailsLoading}
                >
                  <X className="w-4 h-4" />
                  Reset All Filters
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex justify-center mb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
          <TabsList className="grid grid-cols-2 h-10 items-center justify-center rounded-lg bg-slate-100 p-1 gap-1">
            <TabsTrigger 
              value="summary"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white px-6 py-2 rounded-md font-medium transition-all"
            >
              Summary View
            </TabsTrigger>
            <TabsTrigger 
              value="detailed"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white px-6 py-2 rounded-md font-medium transition-all"
            >
              Detailed View
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Summary Tab */}
        <TabsContent value="summary" className="mt-0 space-y-6">
          {/* Comprehensive KPIs Row 1 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analyticsLoading ? '...' : formatCurrency(metrics?.totalRevenue || 0, metrics?.currencyCode || 'AED')}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatNumber(metrics?.totalOrders || 0)} orders
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Quantity Sold</CardTitle>
                <Package className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analyticsLoading ? '...' : formatNumber(metrics?.totalQuantity || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Units sold
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unique Customers</CardTitle>
                <Users className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analyticsLoading ? '...' : formatNumber(metrics?.uniqueCustomers || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active buyers
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
                <DollarSign className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analyticsLoading ? '...' : formatCurrency(metrics?.avgOrderValue || 0, metrics?.currencyCode || 'AED')}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Per transaction
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Product-Specific KPIs Row 2 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                <Package className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analyticsLoading ? '...' : formatNumber(metrics?.totalProducts || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatNumber(metrics?.activeProducts || 0)} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Fast Moving</CardTitle>
                <Package className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{analyticsLoading ? '...' : formatNumber(metrics?.fastMoving || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  High demand products
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Slow Moving Products</CardTitle>
                <Package className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{analyticsLoading ? '...' : formatNumber(metrics?.slowMoving || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Low sales velocity
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Inactive Products</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {analyticsLoading ? '...' : formatNumber(metrics?.noSales || 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  No recent sales
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Sales by Brand Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Sales By Brand</CardTitle>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="h-[480px] flex items-center justify-center text-gray-500">Loading...</div>
                ) : analytics?.salesByBrand.length === 0 ? (
                  <div className="h-[480px] flex items-center justify-center text-gray-500">No data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={480}>
                    <BarChart data={analytics?.salesByBrand.slice(0, 10)} margin={{ top: 10, right: 15, left: 45, bottom: 70 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                      <XAxis
                        dataKey="brand"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tick={{ fontSize: 11 }}
                        label={{ value: 'Brand', position: 'insideBottom', offset: -10, style: { fontSize: 12, fill: '#1f2937', fontWeight: 600 } }}
                      />
                      <YAxis
                        tickFormatter={formatYAxis}
                        tick={{ fontSize: 11 }}
                        width={60}
                        label={{ value: 'Sales (AED)', angle: -90, position: 'left', style: { fontSize: 12, fill: '#1f2937', fontWeight: 600, textAnchor: 'middle' } }}
                      />
                      <Tooltip formatter={(value: number) => formatCurrency(value, 'AED')} />
                      <Bar dataKey="sales" fill="#0088FE" name="Sales" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Product Brand Distribution - Pie Chart & List Combined */}
            <Card>
              <CardHeader>
                <CardTitle>Product Category Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="h-[300px] flex items-center justify-center text-gray-500">Loading...</div>
                ) : analytics?.brandSalesDistribution.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-gray-500">No data available</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Pie Chart */}
                    <div>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={(() => {
                              const brands = analytics?.brandSalesDistribution || []
                              const mainBrands = brands.filter(b => b.percentage >= 10)
                              const otherBrands = brands.filter(b => b.percentage < 10)

                              if (otherBrands.length > 0) {
                                const othersTotal = otherBrands.reduce((sum, b) => sum + b.sales, 0)
                                const othersPercentage = otherBrands.reduce((sum, b) => sum + b.percentage, 0)
                                const othersProducts = otherBrands.reduce((sum, b) => sum + b.products, 0)

                                return [
                                  ...mainBrands,
                                  {
                                    brand: 'Others',
                                    sales: othersTotal,
                                    percentage: othersPercentage,
                                    products: othersProducts
                                  }
                                ]
                              }
                              return brands
                            })()}
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            fill="#8884d8"
                            dataKey="sales"
                            nameKey="brand"
                            label={({ brand, percentage }) => percentage > 5 ? `${formatPercentage(percentage)}` : ''}
                          >
                            {(() => {
                              const brands = analytics?.brandSalesDistribution || []
                              const mainBrands = brands.filter(b => b.percentage >= 10)
                              const otherBrands = brands.filter(b => b.percentage < 10)
                              const pieData = otherBrands.length > 0 ? [...mainBrands, { brand: 'Others' }] : brands

                              return pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))
                            })()}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatCurrency(value, 'AED')} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* List - Show all brands */}
                    <div className="space-y-2 max-h-[280px] overflow-y-auto">
                      {analytics?.brandSalesDistribution.map((brand, index) => (
                        <div
                          key={brand.brand}
                          className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center space-x-2">
                            <div
                              className="w-3 h-3 rounded"
                              style={{
                                backgroundColor: brand.percentage >= 10
                                  ? CHART_COLORS[analytics.brandSalesDistribution.filter(b => b.percentage >= 10).findIndex(b => b.brand === brand.brand) % CHART_COLORS.length]
                                  : CHART_COLORS[analytics.brandSalesDistribution.filter(b => b.percentage >= 10).length % CHART_COLORS.length]
                              }}
                            />
                            <div>
                              <div className="font-medium text-sm text-gray-900">{brand.brand}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatNumber(brand.products)} products
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-sm text-gray-900">
                              {formatCurrency(brand.sales, 'AED')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatPercentage(brand.percentage)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Products */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Products by Sales</CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <div className="text-center py-8 text-gray-500">Loading products...</div>
              ) : analytics?.topProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No products found</div>
              ) : (
                <div className="space-y-3">
                  {analytics?.topProducts.slice(0, 10).map((product, index) => (
                    <div
                      key={product.productCode}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-4 flex-1">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{product.productName}</div>
                          <div className="text-sm text-muted-foreground">
                            <span className="font-mono text-blue-600">{product.productCode}</span>
                            {/* Show category/brand - only once if they're the same */}
                            {(() => {
                              const hasCategory = product.category && product.category !== '-' && product.category !== 'Uncategorized'
                              const hasBrand = product.brand && product.brand !== '-' && product.brand !== 'No Brand'
                              
                              if (hasCategory && hasBrand && product.category === product.brand) {
                                // If both exist and are the same, show only category
                                return (
                                  <>
                                    <span className="mx-1">•</span>
                                    <span>{product.category}</span>
                                  </>
                                )
                              } else if (hasCategory) {
                                // Show category
                                return (
                                  <>
                                    <span className="mx-1">•</span>
                                    <span>{product.category}</span>
                                  </>
                                )
                              } else if (hasBrand) {
                                // Show brand if no category
                                return (
                                  <>
                                    <span className="mx-1">•</span>
                                    <span>{product.brand}</span>
                                  </>
                                )
                              }
                              return null
                            })()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-gray-900">
                          {formatCurrency(product.sales, 'AED')}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatNumber(product.quantity)} units
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detailed List Tab */}
        <TabsContent value="detailed" className="mt-6">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Product Details</h2>
                <p className="text-sm text-gray-600">
                  Showing {detailedProducts.length > 0 ? ((currentPage - 1) * pageSize) + 1 : 0} to {Math.min(currentPage * pageSize, totalProducts)} of {totalProducts} products
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={exportToExcel} variant="outline" size="sm" className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Export Excel
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[700px]">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-300 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors min-w-[140px]"
                      onClick={() => handleSort('product_code')}
                    >
                      Product Code{getSortIndicator('product_code')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors min-w-[300px]"
                      onClick={() => handleSort('product_name')}
                    >
                      Product Name{getSortIndicator('product_name')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[150px]"
                    >
                      Product Brand
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors min-w-[120px]"
                      onClick={() => handleSort('total_quantity')}
                    >
                      Quantity{getSortIndicator('total_quantity')}
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors min-w-[140px]"
                      onClick={() => handleSort('avg_price')}
                    >
                      Avg Price{getSortIndicator('avg_price')}
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors min-w-[160px]"
                      onClick={() => handleSort('total_sales')}
                    >
                      Total Amount{getSortIndicator('total_sales')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {detailsLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                        Loading products...
                      </td>
                    </tr>
                  ) : detailedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                        No products found
                      </td>
                    </tr>
                  ) : (
                    detailedProducts.map((product) => (
                      <tr key={product.productCode} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono text-blue-600 font-medium whitespace-nowrap">
                          {product.productCode}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="font-medium">{product.productName}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {product.brand || 'No Brand'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 whitespace-nowrap">
                          {product.totalQuantity > 0 ? formatNumber(product.totalQuantity) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 whitespace-nowrap">
                          {product.avgPrice > 0 ? formatCurrency(product.avgPrice, 'AED') : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-gray-900 whitespace-nowrap">
                          {product.totalSales > 0 ? formatCurrency(product.totalSales, 'AED') : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 0 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  {/* Items per page selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Show:</span>
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(value) => {
                        setPageSize(parseInt(value))
                        setCurrentPage(1)
                      }}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-gray-600">
                      items (Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalProducts)} of {totalProducts})
                    </span>
                  </div>

                  {/* Page navigation */}
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1 || detailsLoading}
                      >
                        First
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1 || detailsLoading}
                      >
                        Previous
                      </Button>

                      {/* Page number buttons */}
                      <div className="flex items-center gap-1">
                        {(() => {
                          const pages = []
                          const maxPagesToShow = 5
                          let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2))
                          let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1)

                          if (endPage - startPage + 1 < maxPagesToShow) {
                            startPage = Math.max(1, endPage - maxPagesToShow + 1)
                          }

                          if (startPage > 1) {
                            pages.push(
                              <span key="ellipsis-start" className="px-2 text-gray-600">...</span>
                            )
                          }

                          for (let i = startPage; i <= endPage; i++) {
                            pages.push(
                              <Button
                                key={i}
                                variant={currentPage === i ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCurrentPage(i)}
                                disabled={detailsLoading}
                                className="min-w-[40px]"
                              >
                                {i}
                              </Button>
                            )
                          }

                          if (endPage < totalPages) {
                            pages.push(
                              <span key="ellipsis-end" className="px-2 text-gray-600">...</span>
                            )
                          }

                          return pages
                        })()}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages || detailsLoading}
                      >
                        Next
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages || detailsLoading}
                      >
                        Last
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
