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
  regionCode: string | null // Alias for areaCode (backward compatibility)
  cityCode: string | null // Alias for subAreaCode (backward compatibility)
  routeCode: string | null
  teamLeaderCode: string | null
  fieldUserRole: string | null // Not used in store visits, but needed for compatibility
  userCode: string | null
  storeCode: string | null
  chainName: string | null
  storeClass: string | null
}

export interface StoreVisitFilterOptions {
  areas: StoreVisitFilterOption[]
  subAreas: StoreVisitFilterOption[]
  regions: StoreVisitFilterOption[] // Alias for areas
  cities: StoreVisitFilterOption[] // Alias for subAreas
  routes: StoreVisitFilterOption[]
  teamLeaders: StoreVisitFilterOption[]
  fieldUsers: StoreVisitFilterOption[]
  fieldUserRoles: StoreVisitFilterOption[] // Empty array for compatibility
  stores: StoreVisitFilterOption[]
  chains: StoreVisitFilterOption[]
  storeClasses: StoreVisitFilterOption[]
  summary: {
    totalVisits: number
    totalUsers: number
    totalStores: number
    totalRoutes: number
    totalAreas: number
    totalSubAreas: number
    totalRegions: number
    totalChains: number
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
    regionCode: null, // Alias for areaCode
    cityCode: null, // Alias for subAreaCode
    routeCode: null,
    teamLeaderCode: null,
    fieldUserRole: null, // Not used, but needed for compatibility
    userCode: null,
    storeCode: null,
    chainName: null,
    storeClass: null
  })

  const [filterOptions, setFilterOptions] = useState<StoreVisitFilterOptions>({
    areas: [],
    subAreas: [],
    regions: [], // Alias for areas
    cities: [], // Alias for subAreas
    routes: [],
    teamLeaders: [],
    fieldUsers: [],
    fieldUserRoles: [], // Empty array for compatibility
    stores: [],
    chains: [],
    storeClasses: [],
    summary: {
      totalVisits: 0,
      totalUsers: 0,
      totalStores: 0,
      totalRoutes: 0,
      totalAreas: 0,
      totalSubAreas: 0,
      totalRegions: 0,
      totalChains: 0,
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
        const areas = result.data.areas || []
        const subAreas = result.data.subAreas || []

        setFilterOptions({
          areas,
          subAreas,
          regions: areas, // Alias for backward compatibility
          cities: subAreas, // Alias for backward compatibility
          routes: result.data.routes || [],
          teamLeaders: result.data.teamLeaders || [],
          fieldUsers: result.data.fieldUsers || [],
          fieldUserRoles: [], // Empty array - Store visits don't have roles
          stores: result.data.stores || [],
          chains: result.data.chains || [],
          storeClasses: result.data.storeClasses || [],
          summary: {
            totalVisits: result.data.summary?.totalVisits || 0,
            totalUsers: result.data.summary?.totalUsers || 0,
            totalStores: result.data.summary?.totalStores || 0,
            totalRoutes: result.data.summary?.totalRoutes || 0,
            totalAreas: areas.length,
            totalSubAreas: subAreas.length,
            totalRegions: areas.length,
            totalChains: (result.data.chains || []).length,
            dateRange: result.data.summary?.dateRange || { min: '', max: '', daysWithData: 0 }
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

      // Sync aliases for backward compatibility
      if (key === 'areaCode') {
        updated.regionCode = value
        updated.subAreaCode = null
        updated.cityCode = null
        updated.routeCode = null
        updated.teamLeaderCode = null
        updated.userCode = null
        updated.storeCode = null
      }

      if (key === 'regionCode') {
        updated.areaCode = value
        updated.subAreaCode = null
        updated.cityCode = null
        updated.routeCode = null
        updated.teamLeaderCode = null
        updated.userCode = null
        updated.storeCode = null
      }

      if (key === 'subAreaCode') {
        updated.cityCode = value
        updated.routeCode = null
        updated.teamLeaderCode = null
        updated.userCode = null
        updated.storeCode = null
      }

      if (key === 'cityCode') {
        updated.subAreaCode = value
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

      // fieldUserRole is not used in store visits, just ignore it
      if (key === 'fieldUserRole') {
        // Do nothing, this filter is not applicable
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
      regionCode: null,
      cityCode: null,
      routeCode: null,
      teamLeaderCode: null,
      fieldUserRole: null,
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

  // Get active filter count (excluding date range and aliases)
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
    // Don't count aliases (regionCode, cityCode, fieldUserRole)
    return count
  }, [
    filters.areaCode,
    filters.subAreaCode,
    filters.routeCode,
    filters.teamLeaderCode,
    filters.userCode,
    filters.storeCode,
    filters.chainName,
    filters.storeClass
  ])

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
