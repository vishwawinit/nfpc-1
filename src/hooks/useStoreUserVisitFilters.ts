import { useState, useEffect, useCallback, useMemo } from 'react'

export interface StoreVisitFilterOption {
  value: string
  label: string
  visitCount?: number
  storeCount?: number
  userCount?: number
}

export interface StoreUserVisitFilters {
  startDate: string | null
  endDate: string | null
  areaCode: string | null
  subAreaCode: string | null
  routeCode: string | null
  teamLeaderCode: string | null
  userCode: string | null
  storeCode: string | null
  chainName: string | null
  storeClass: string | null
}

export interface StoreVisitFilterOptions {
  areas: StoreVisitFilterOption[]
  subAreas: StoreVisitFilterOption[]
  routes: StoreVisitFilterOption[]
  teamLeaders: StoreVisitFilterOption[]
  fieldUsers: StoreVisitFilterOption[]
  stores: StoreVisitFilterOption[]
  chains: StoreVisitFilterOption[]
  storeClasses: StoreVisitFilterOption[]
  summary: {
    totalVisits: number
    totalUsers: number
    totalStores: number
    totalRoutes: number
    dateRange: {
      min: string
      max: string
      daysWithData: number
    }
  }
}

// Helper function to get default date range (last month)
const getDefaultDateRange = () => {
  const currentDate = new Date()
  const lastMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
  const lastMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0)

  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return {
    startDate: formatDate(lastMonthStart),
    endDate: formatDate(lastMonthEnd)
  }
}

export const useStoreUserVisitFilters = () => {
  const defaultDates = getDefaultDateRange()

  const [filters, setFilters] = useState<StoreUserVisitFilters>({
    startDate: defaultDates.startDate,
    endDate: defaultDates.endDate,
    areaCode: null,
    subAreaCode: null,
    routeCode: null,
    teamLeaderCode: null,
    userCode: null,
    storeCode: null,
    chainName: null,
    storeClass: null
  })

  const [filterOptions, setFilterOptions] = useState<StoreVisitFilterOptions>({
    areas: [],
    subAreas: [],
    routes: [],
    teamLeaders: [],
    fieldUsers: [],
    stores: [],
    chains: [],
    storeClasses: [],
    summary: {
      totalVisits: 0,
      totalUsers: 0,
      totalStores: 0,
      totalRoutes: 0,
      dateRange: {
        min: '',
        max: '',
        daysWithData: 0
      }
    }
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch filter options dynamically based on current selections
  const fetchFilterOptions = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()

      // Add current filter values to params
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)
      if (filters.areaCode) params.append('areaCode', filters.areaCode)
      if (filters.subAreaCode) params.append('subAreaCode', filters.subAreaCode)
      if (filters.routeCode) params.append('routeCode', filters.routeCode)
      if (filters.teamLeaderCode) params.append('teamLeaderCode', filters.teamLeaderCode)
      if (filters.userCode) params.append('userCode', filters.userCode)
      if (filters.storeCode) params.append('storeCode', filters.storeCode)
      if (filters.chainName) params.append('chainName', filters.chainName)
      if (filters.storeClass) params.append('storeClass', filters.storeClass)

      const response = await fetch(`/api/store-visits/filters?${params}`)
      const result = await response.json()

      if (result.success && result.data) {
        setFilterOptions({
          areas: result.data.areas || [],
          subAreas: result.data.subAreas || [],
          routes: result.data.routes || [],
          teamLeaders: result.data.teamLeaders || [],
          fieldUsers: result.data.fieldUsers || [],
          stores: result.data.stores || [],
          chains: result.data.chains || [],
          storeClasses: result.data.storeClasses || [],
          summary: result.data.summary || {
            totalVisits: 0,
            totalUsers: 0,
            totalStores: 0,
            totalRoutes: 0,
            dateRange: { min: '', max: '', daysWithData: 0 }
          }
        })
      } else {
        setError(result.error || 'Failed to fetch filter options')
      }
    } catch (err) {
      console.error('Error fetching store visit filter options:', err)
      setError('Failed to fetch filter options')
    } finally {
      setLoading(false)
    }
  }, [
    filters.startDate,
    filters.endDate,
    filters.areaCode,
    filters.subAreaCode,
    filters.routeCode,
    filters.teamLeaderCode,
    filters.userCode,
    filters.storeCode,
    filters.chainName,
    filters.storeClass
  ])

  // Update filter value with cascading logic
  const updateFilter = useCallback((key: keyof StoreUserVisitFilters, value: string | null) => {
    setFilters(prev => {
      const updated = { ...prev, [key]: value }

      // Cascading filter logic
      if (key === 'areaCode') {
        // Area change clears all dependent filters
        updated.subAreaCode = null
        updated.routeCode = null
        updated.teamLeaderCode = null
        updated.userCode = null
        updated.storeCode = null
      }

      if (key === 'subAreaCode') {
        // Sub-area change clears route and dependent filters
        updated.routeCode = null
        updated.teamLeaderCode = null
        updated.userCode = null
        updated.storeCode = null
      }

      if (key === 'routeCode') {
        // Route change clears team leader and field user
        updated.teamLeaderCode = null
        updated.userCode = null
        updated.storeCode = null
      }

      if (key === 'teamLeaderCode') {
        // Team leader change clears field user
        updated.userCode = null
        updated.storeCode = null
      }

      if (key === 'userCode') {
        // User change clears store selection
        updated.storeCode = null
      }

      if (key === 'chainName') {
        // Chain change may affect stores - clear store selection
        updated.storeCode = null
      }

      if (key === 'storeClass') {
        // Store class change may affect stores - clear store selection
        updated.storeCode = null
      }

      return updated
    })
  }, [])

  // Set date range
  const setDateRange = useCallback((startDate: string | null, endDate: string | null) => {
    setFilters(prev => ({
      ...prev,
      startDate,
      endDate
    }))
  }, [])

  // Reset all filters to default (last month, no other filters)
  const resetFilters = useCallback(() => {
    const defaultDates = getDefaultDateRange()
    setFilters({
      startDate: defaultDates.startDate,
      endDate: defaultDates.endDate,
      areaCode: null,
      subAreaCode: null,
      routeCode: null,
      teamLeaderCode: null,
      userCode: null,
      storeCode: null,
      chainName: null,
      storeClass: null
    })
  }, [])

  // Fetch filter options on mount and when filters change
  useEffect(() => {
    fetchFilterOptions()
  }, [fetchFilterOptions])

  // Build query params for data APIs
  const getQueryParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams()

    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    if (filters.areaCode) params.append('areaCode', filters.areaCode)
    if (filters.subAreaCode) params.append('subAreaCode', filters.subAreaCode)
    if (filters.routeCode) params.append('routeCode', filters.routeCode)
    if (filters.teamLeaderCode) params.append('teamLeaderCode', filters.teamLeaderCode)
    if (filters.userCode) params.append('userCode', filters.userCode)
    if (filters.storeCode) params.append('storeCode', filters.storeCode)
    if (filters.chainName) params.append('chainName', filters.chainName)
    if (filters.storeClass) params.append('storeClass', filters.storeClass)

    return params
  }, [filters])

  // Get active filter count (excluding date range)
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.areaCode) count++
    if (filters.subAreaCode) count++
    if (filters.routeCode) count++
    if (filters.teamLeaderCode) count++
    if (filters.userCode) count++
    if (filters.storeCode) count++
    if (filters.chainName) count++
    if (filters.storeClass) count++
    return count
  }, [filters])

  return {
    filters,
    filterOptions,
    loading,
    error,
    updateFilter,
    setDateRange,
    resetFilters,
    getQueryParams,
    activeFilterCount,
    summary: filterOptions.summary,
    refetch: fetchFilterOptions
  }
}
