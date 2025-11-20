import { useState, useEffect, useCallback, useMemo } from 'react'
import { dataService } from '@/services/dataService'
import type { DashboardKPI, SalesTrendData, Customer, Product, Transaction, FilterOptions } from '@/types'

// Helper function for safe fetch - no timeout to allow slow database queries
const safeFetch = async (url: string): Promise<Response> => {
  // Ensure we're in the browser
  if (typeof window === 'undefined') {
    throw new Error('Fetch can only be called in the browser')
  }

  try {
    const response = await globalThis.fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store' as RequestCache,
    })
    
    // If response is ok, return it
    if (response.ok) {
      return response
    }
    
    // If not ok, throw with status
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  } catch (error) {
    // Check if it's a network error
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Network error: Unable to connect to the server. Please check if the Next.js dev server is running on port 3000.')
    }
    
    // Re-throw other errors
    throw error
  }
}

interface UseDataServiceOptions {
  enabled?: boolean
  refreshInterval?: number // in milliseconds
  onError?: (error: string) => void
}

// Helper function to get multipliers based on date range
const getDateMultiplier = (dateRange: string) => {
  switch (dateRange) {
    case 'today':
      return { sales: 0.3, orders: 0.4, customers: 0.5, aov: 1.1, mtd: 0.8, ytd: 0.9 }
    case 'yesterday':
      return { sales: 0.4, orders: 0.5, customers: 0.6, aov: 0.95, mtd: 0.85, ytd: 0.92 }
    case 'thisWeek':
      return { sales: 0.6, orders: 0.7, customers: 0.8, aov: 0.9, mtd: 0.95, ytd: 0.96 }
    case 'thisMonth':
      return { sales: 1.0, orders: 1.0, customers: 1.0, aov: 1.0, mtd: 1.0, ytd: 1.0 }
    case 'lastMonth':
      return { sales: 1.2, orders: 1.1, customers: 1.05, aov: 1.08, mtd: 1.1, ytd: 1.02 }
    case 'thisQuarter':
      return { sales: 1.5, orders: 1.3, customers: 1.2, aov: 1.15, mtd: 1.3, ytd: 1.1 }
    case 'thisYear':
      return { sales: 2.0, orders: 1.8, customers: 1.6, aov: 1.2, mtd: 1.8, ytd: 1.5 }
    default:
      return { sales: 1.0, orders: 1.0, customers: 1.0, aov: 1.0, mtd: 1.0, ytd: 1.0 }
  }
}

// Dashboard KPI hook using real API
export function useDashboardKPI(
  dateRange: string = 'thisMonth',
  options: UseDataServiceOptions & { additionalParams?: URLSearchParams } = {}
) {
  const { enabled = true, refreshInterval, onError, additionalParams } = options
  const [data, setData] = useState<DashboardKPI | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Convert additionalParams to string for stable comparison
  const paramsString = useMemo(() => additionalParams?.toString() || '', [additionalParams])

  const fetchData = useCallback(async () => {
    if (!enabled) return
    
    // Ensure we're in the browser
    if (typeof window === 'undefined') return

    try {
      setLoading(true)
      setError(null)

      // Build query params with date range and additional filters
      const params = new URLSearchParams()
      params.append('range', dateRange)

      // Add additional params if provided
      if (paramsString) {
        const additionalURLParams = new URLSearchParams(paramsString)
        additionalURLParams.forEach((value, key) => {
          params.append(key, value)
        })
      }

      // Log the request for debugging
      console.log('KPI Hook: Fetching with params:', params.toString())

      // Use real API endpoint with date range and filters
      // Use longer timeout for KPI as it may involve complex aggregations
      const url = `/api/dashboard/kpi?${params}`
      const response = await safeFetch(url)
      
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

      const result = await response.json()

      if (result.success) {
        setData(result.data)
        console.log('KPI Hook: Successfully fetched data:', {
          currentSales: result.data.currentSales,
          dateRange,
          hasFilters: paramsString.length > 0
        })
      } else {
        throw new Error(result.error || 'Failed to fetch dashboard KPIs')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      
      // Handle timeout errors gracefully
      if (errorMessage.includes('timeout') || errorMessage.includes('Request timeout')) {
        const timeoutError = 'Query is taking longer than expected. This may be due to a large dataset or slow database. Try selecting a smaller date range or refreshing the page.'
        setError(timeoutError)
        onError?.(timeoutError)
        console.warn('Dashboard KPI timeout - query may be slow:', errorMessage)
        // Don't keep loading state - show error immediately
      } else if (err instanceof TypeError && err.message === 'Failed to fetch') {
        const networkError = 'Network error: Unable to connect to the server. Please check if the server is running.'
        setError(networkError)
        onError?.(networkError)
        console.error('Dashboard KPI network error:', networkError)
      } else {
        setError(errorMessage)
        onError?.(errorMessage)
        console.error('Dashboard KPI error:', err)
      }
    } finally {
      setLoading(false)
    }
  }, [enabled, onError, dateRange, paramsString])

  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (enabled) {
      fetchData()
    }
  }, [fetchData, enabled])

  useEffect(() => {
    if (!refreshInterval || !enabled) return
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchData, refreshInterval, enabled])

  return { data, loading, error, refresh }
}

// Sales Trend hook using real API - supports both days and date ranges
export function useSalesTrend(param: number | string = 30, options: UseDataServiceOptions & { additionalParams?: URLSearchParams } = {}) {
  const { enabled = true, refreshInterval, onError, additionalParams } = options
  const [data, setData] = useState<SalesTrendData[] | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Convert additionalParams to string for stable comparison
  const paramsString = useMemo(() => additionalParams?.toString() || '', [additionalParams])

  const fetchData = useCallback(async () => {
    if (!enabled) return
    
    // Ensure we're in the browser
    if (typeof window === 'undefined') return

    try {
      setLoading(true)
      setError(null)

      // Build query params
      const params = new URLSearchParams()
      
      // Check if custom dates are provided in additionalParams
      const additionalURLParams = paramsString ? new URLSearchParams(paramsString) : null
      const hasCustomDates = additionalURLParams && additionalURLParams.has('startDate') && additionalURLParams.has('endDate')
      
      // If custom dates are provided, use 'custom' as range to ensure API prioritizes them
      // Otherwise, use the provided range parameter
      if (hasCustomDates) {
        params.append('range', 'custom')
      } else if (typeof param === 'string') {
        // Date range parameter
        params.append('range', param)
      } else {
        // Days parameter (legacy support)
        params.append('days', param.toString())
      }

      // Add additional params if provided (this includes startDate and endDate)
      if (paramsString) {
        additionalURLParams!.forEach((value, key) => {
          params.append(key, value)
        })
      }
      
      console.log('useSalesTrend - Query params:', {
        range: params.get('range'),
        startDate: params.get('startDate'),
        endDate: params.get('endDate'),
        hasCustomDates,
        allParams: params.toString()
      })

      const response = await safeFetch(`/api/dashboard/sales-trend?${params}`)
      
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

      const result = await response.json()

      if (result.success) {
        setData(result.data)
      } else {
        throw new Error(result.error || 'Failed to fetch sales trend')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      // Handle timeout errors gracefully
      if (errorMessage.includes('timeout') || errorMessage.includes('Request timeout')) {
        const timeoutError = 'Query is taking longer than expected. Try selecting a smaller date range.'
        setError(timeoutError)
        onError?.(timeoutError)
        console.warn('Sales trend timeout:', errorMessage)
      } else if (err instanceof TypeError && err.message === 'Failed to fetch') {
        const networkError = 'Network error: Unable to connect to the server. Please check if the server is running.'
        setError(networkError)
        onError?.(networkError)
        console.error('Sales trend network error:', networkError)
      } else {
        setError(errorMessage)
        onError?.(errorMessage)
        console.error('Sales trend error:', err)
      }
    } finally {
      setLoading(false)
    }
  }, [param, enabled, onError, paramsString])

  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!refreshInterval || !enabled) return
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchData, refreshInterval, enabled])

  return { data, loading, error, refresh }
}

// Top Customers hook - now supports date range filtering
export function useTopCustomers(limit: number = 20, dateRange: string = 'thisMonth', options: UseDataServiceOptions & { additionalParams?: URLSearchParams } = {}) {
  const { enabled = true, refreshInterval, onError, additionalParams } = options
  const [data, setData] = useState<Customer[] | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Convert additionalParams to string for stable comparison
  const paramsString = useMemo(() => additionalParams?.toString() || '', [additionalParams])

  const fetchData = useCallback(async () => {
    if (!enabled) return
    
    // Ensure we're in the browser
    if (typeof window === 'undefined') return

    try {
      setLoading(true)
      setError(null)

      // Build query params
      const params = new URLSearchParams()
      params.append('limit', limit.toString())
      params.append('range', dateRange)

      // Add additional params if provided
      if (paramsString) {
        const additionalURLParams = new URLSearchParams(paramsString)
        additionalURLParams.forEach((value, key) => {
          params.append(key, value)
        })
      }

      const response = await safeFetch(`/api/customers/top?${params}`)
      
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

      const result = await response.json()

      if (result.success) {
        setData(result.data)
      } else {
        throw new Error(result.error || 'Failed to fetch top customers')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      // Handle timeout errors gracefully
      if (errorMessage.includes('timeout') || errorMessage.includes('Request timeout')) {
        const timeoutError = 'Query is taking longer than expected. Try selecting a smaller date range.'
        setError(timeoutError)
        onError?.(timeoutError)
        console.warn('Top customers timeout:', errorMessage)
      } else if (err instanceof TypeError && err.message === 'Failed to fetch') {
        const networkError = 'Network error: Unable to connect to the server. Please check if the server is running.'
        setError(networkError)
        onError?.(networkError)
        console.error('Top customers network error:', networkError)
      } else {
        setError(errorMessage)
        onError?.(errorMessage)
        console.error('Top customers error:', err)
      }
    } finally {
      setLoading(false)
    }
  }, [limit, enabled, onError, dateRange, paramsString])

  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!refreshInterval || !enabled) return
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchData, refreshInterval, enabled])

  return { data, loading, error, refresh }
}

// Top Products hook - now supports date range filtering
export function useTopProducts(limit: number = 20, dateRange: string = 'thisMonth', options: UseDataServiceOptions & { additionalParams?: URLSearchParams } = {}) {
  const { enabled = true, refreshInterval, onError, additionalParams } = options
  const [data, setData] = useState<Product[] | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Convert additionalParams to string for stable comparison
  const paramsString = useMemo(() => additionalParams?.toString() || '', [additionalParams])

  const fetchData = useCallback(async () => {
    if (!enabled) return
    
    // Ensure we're in the browser
    if (typeof window === 'undefined') return

    try {
      setLoading(true)
      setError(null)

      // Build query params
      const params = new URLSearchParams()
      params.append('limit', limit.toString())
      params.append('range', dateRange)

      // Add additional params if provided
      if (paramsString) {
        const additionalURLParams = new URLSearchParams(paramsString)
        additionalURLParams.forEach((value, key) => {
          params.append(key, value)
        })
      }

      const response = await safeFetch(`/api/products/top?${params}`)
      
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

      const result = await response.json()

      if (result.success) {
        setData(result.data)
      } else {
        throw new Error(result.error || 'Failed to fetch top products')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      // Handle timeout errors gracefully
      if (errorMessage.includes('timeout') || errorMessage.includes('Request timeout')) {
        const timeoutError = 'Query is taking longer than expected. Try selecting a smaller date range.'
        setError(timeoutError)
        onError?.(timeoutError)
        console.warn('Top products timeout:', errorMessage)
      } else if (err instanceof TypeError && err.message === 'Failed to fetch') {
        const networkError = 'Network error: Unable to connect to the server. Please check if the server is running.'
        setError(networkError)
        onError?.(networkError)
        console.error('Top products network error:', networkError)
      } else {
        setError(errorMessage)
        onError?.(errorMessage)
        console.error('Top products error:', err)
      }
    } finally {
      setLoading(false)
    }
  }, [limit, enabled, onError, dateRange, paramsString])

  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!refreshInterval || !enabled) return
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchData, refreshInterval, enabled])

  return { data, loading, error, refresh }
}

// Sales by Channel hook - fetches sales distribution by chain/channel
export function useSalesByChannel(options: UseDataServiceOptions & { additionalParams?: URLSearchParams } = {}) {
  const { enabled = true, refreshInterval, onError, additionalParams } = options
  const [data, setData] = useState<any[] | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Convert additionalParams to string for stable comparison
  const paramsString = useMemo(() => additionalParams?.toString() || '', [additionalParams])

  const fetchData = useCallback(async () => {
    if (!enabled) return
    
    // Ensure we're in the browser
    if (typeof window === 'undefined') return

    try {
      setLoading(true)
      setError(null)

      // Build query params
      const params = new URLSearchParams()

      // Add additional params if provided
      if (paramsString) {
        const additionalURLParams = new URLSearchParams(paramsString)
        additionalURLParams.forEach((value, key) => {
          params.append(key, value)
        })
      }

      const response = await safeFetch(`/api/dashboard/sales-by-channel?${params}`)
      
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

      const result = await response.json()

      if (result.success) {
        setData(result.data)
      } else {
        throw new Error(result.error || 'Failed to fetch sales by channel')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      // Handle timeout errors gracefully
      if (errorMessage.includes('timeout') || errorMessage.includes('Request timeout')) {
        const timeoutError = 'Query is taking longer than expected. Try selecting a smaller date range.'
        setError(timeoutError)
        onError?.(timeoutError)
        console.warn('Sales by channel timeout:', errorMessage)
      } else if (err instanceof TypeError && err.message === 'Failed to fetch') {
        const networkError = 'Network error: Unable to connect to the server. Please check if the server is running.'
        setError(networkError)
        onError?.(networkError)
        console.error('Sales by channel network error:', networkError)
      } else {
        setError(errorMessage)
        onError?.(errorMessage)
        console.error('Sales by channel error:', err)
      }
    } finally {
      setLoading(false)
    }
  }, [enabled, onError, paramsString])

  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!refreshInterval || !enabled) return
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchData, refreshInterval, enabled])

  return { data, loading, error, refresh }
}

// Transactions hook using real API - now supports limit parameter for dashboard display
export function useTransactions(filters: Partial<FilterOptions> = {}, limit: number = 20, options: UseDataServiceOptions & { additionalParams?: URLSearchParams } = {}) {
  const { enabled = true, refreshInterval, onError, additionalParams } = options
  const [data, setData] = useState<Transaction[] | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Stabilize filters object to prevent infinite re-renders
  const stableFilters = useMemo(() => filters, [
    filters?.startDate,
    filters?.endDate,
    filters?.userCode,
    filters?.organizationCode,
    filters?.customerType,
    filters?.productCategory
  ])

  // Convert additionalParams to string for stable comparison
  const paramsString = useMemo(() => additionalParams?.toString() || '', [additionalParams])

  const fetchData = useCallback(async () => {
    if (!enabled) return
    
    // Ensure we're in the browser
    if (typeof window === 'undefined') return

    try {
      setLoading(true)
      setError(null)

      // Build query parameters
      const params = new URLSearchParams()

      // Add limit parameter for dashboard top 20 display
      params.append('limit', limit.toString())

      if (stableFilters.startDate) {
        params.append('startDate', new Date(stableFilters.startDate).toISOString().split('T')[0])
      }
      if (stableFilters.endDate) {
        params.append('endDate', new Date(stableFilters.endDate).toISOString().split('T')[0])
      }
      if (stableFilters.userCode) {
        params.append('userCode', stableFilters.userCode)
      }

      // Add additional params if provided
      if (paramsString) {
        const additionalURLParams = new URLSearchParams(paramsString)
        additionalURLParams.forEach((value, key) => {
          params.append(key, value)
        })
      }

      const response = await safeFetch(`/api/transactions/recent?${params.toString()}`)
      
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

      const result = await response.json()

      if (result.success) {
        setData(result.data)
      } else {
        throw new Error(result.error || 'Failed to fetch recent transactions')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      onError?.(errorMessage)
      console.error('Recent transactions error:', err)
    } finally {
      setLoading(false)
    }
  }, [stableFilters, limit, enabled, onError, paramsString])

  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!refreshInterval || !enabled) return
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchData, refreshInterval, enabled])

  return { data, loading, error, refresh }
}

// Recent Transactions hook using real API
export function useRecentTransactions(limit: number = 5, options: UseDataServiceOptions = {}) {
  const { enabled = true, refreshInterval, onError } = options
  const [data, setData] = useState<any[] | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!enabled) return
    
    // Ensure we're in the browser
    if (typeof window === 'undefined') return

    try {
      setLoading(true)
      setError(null)

      const response = await safeFetch(`/api/transactions/recent?limit=${limit}`)
      
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

      const result = await response.json()

      if (result.success) {
        setData(result.data)
      } else {
        throw new Error(result.error || 'Failed to fetch recent transactions')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      onError?.(errorMessage)
      console.error('Recent transactions error:', err)
    } finally {
      setLoading(false)
    }
  }, [limit, enabled, onError])

  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!refreshInterval || !enabled) return
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchData, refreshInterval, enabled])

  return { data, loading, error, refresh }
}

// Targets Achievement hook
export function useTargetsAchievement(dateRange: string = 'thisYear', userId?: string, options: UseDataServiceOptions = {}) {
  const { enabled = true, refreshInterval, onError } = options
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!enabled) return
    
    // Ensure we're in the browser
    if (typeof window === 'undefined') return

    try {
      setLoading(true)
      setError(null)

      // Build query parameters
      const params = new URLSearchParams({ range: dateRange })
      if (userId) params.append('userId', userId)

      const response = await safeFetch(`/api/targets/achievement?${params.toString()}`)
      
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

      const result = await response.json()

      if (result.success) {
        setData(result.data)
      } else {
        // Check if user not found error
        throw new Error(result.error || 'Failed to fetch targets achievement data')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      onError?.(errorMessage)
      console.error('Targets achievement error:', err)
    } finally {
      setLoading(false)
    }
  }, [enabled, onError, dateRange, userId])

  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!refreshInterval || !enabled) return
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchData, refreshInterval, enabled])

  return { data, loading, error, refresh }
}

// Category Performance hook
export function useCategoryPerformance(limit: number = 10, dateRange: string = 'thisMonth', options: UseDataServiceOptions = {}) {
  const { enabled = true, refreshInterval, onError } = options
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!enabled) return
    
    // Ensure we're in the browser
    if (typeof window === 'undefined') return

    try {
      setLoading(true)
      setError(null)

      // Use new category performance API
      const response = await safeFetch(`/api/categories/performance?limit=${limit}&range=${dateRange}`)
      
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

      const result = await response.json()

      if (result.success) {
        setData(result.data)
      } else {
        throw new Error(result.error || 'Failed to fetch category performance')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      onError?.(errorMessage)
      console.error('Category performance error:', err)
    } finally {
      setLoading(false)
    }
  }, [limit, enabled, onError, dateRange])

  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!refreshInterval || !enabled) return
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchData, refreshInterval, enabled])

  return { data, loading, error, refresh }
}

// Customer Analytics hook
export function useCustomerAnalytics(
  dateRange: string = 'last30Days',
  filters: {
    channel?: string;
    classification?: string;
    region?: string;
    type?: string;
    status?: string;
    search?: string;
  } = {},
  pagination: {
    page?: number;
    limit?: number;
  } = {},
  options: UseDataServiceOptions = {}
) {
  const { enabled = true, refreshInterval, onError } = options
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Stabilize filters object to prevent infinite re-renders
  const stableFilters = useMemo(() => filters, [
    filters?.channel,
    filters?.classification,
    filters?.region,
    filters?.type,
    filters?.status,
    filters?.search
  ])

  // Stabilize pagination object
  const stablePagination = useMemo(() => pagination, [
    pagination?.page,
    pagination?.limit
  ])

  const fetchData = useCallback(async () => {
    if (!enabled) return
    
    // Ensure we're in the browser
    if (typeof window === 'undefined') return

    try {
      setLoading(true)
      setError(null)

      // Build query parameters
      const params = new URLSearchParams({ range: dateRange })

      if (stableFilters.channel && stableFilters.channel !== 'all') {
        params.append('channel', stableFilters.channel)
      }
      if (stableFilters.classification && stableFilters.classification !== 'all') {
        params.append('classification', stableFilters.classification)
      }
      if (stableFilters.region && stableFilters.region !== 'all') {
        params.append('region', stableFilters.region)
      }
      if (stableFilters.type && stableFilters.type !== 'all') {
        params.append('type', stableFilters.type)
      }
      if (stableFilters.status && stableFilters.status !== 'all') {
        params.append('status', stableFilters.status)
      }
      if (stableFilters.search) {
        params.append('search', stableFilters.search)
      }
      if (stablePagination.page) {
        params.append('page', stablePagination.page.toString())
      }
      if (stablePagination.limit) {
        params.append('limit', stablePagination.limit.toString())
      }

      const response = await safeFetch(`/api/customers/analytics?${params.toString()}`)
      
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

      const result = await response.json()

      if (result.success) {
        setData({
          ...result.data,
          pagination: result.pagination // Include pagination from API response
        })
      } else {
        throw new Error(result.error || 'Failed to fetch customer analytics data')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      onError?.(errorMessage)
      console.error('Customer analytics error:', err)
    } finally {
      setLoading(false)
    }
  }, [enabled, onError, dateRange, stableFilters, stablePagination])

  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!refreshInterval || !enabled) return
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchData, refreshInterval, enabled])

  return { data, loading, error, refresh }
}

// Additional utility hooks
export function useBatchRefresh() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshAll = useCallback(async (refreshFunctions: (() => void)[]) => {
    setLoading(true)
    setError(null)

    try {
      refreshFunctions.forEach(fn => fn())
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      console.error('Batch refresh error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, error, refreshAll }
}