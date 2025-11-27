import { useState, useEffect, useCallback, useMemo } from 'react'

export interface FilterOption {
  value: string
  label: string
  available?: number
  areaCode?: string
  regionCode?: string // Keep for backward compatibility
  routeCode?: string
  teamLeaderCode?: string
  role?: string
  userCount?: number
  storeCount?: number
  subordinateCount?: number
  atlCount?: number
  promoterCount?: number
  merchandiserCount?: number
}

export interface DashboardFilters {
  startDate: string | null
  endDate: string | null
  areaCode: string | null
  subAreaCode: string | null
  regionCode: string | null // Keep for backward compatibility
  cityCode: string | null // Keep for backward compatibility
  fieldUserRole: string | null
  teamLeaderCode: string | null
  userCode: string | null
  chainName: string | null
  storeCode: string | null
}

export interface FilterOptions {
  areas: FilterOption[]
  subAreas: FilterOption[]
  regions: FilterOption[] // Keep for backward compatibility
  cities: FilterOption[] // Keep for backward compatibility
  fieldUserRoles: FilterOption[]
  teamLeaders: FilterOption[]
  fieldUsers: FilterOption[]
  chains: FilterOption[]
  stores: FilterOption[]
  summary: {
    totalAreas: number
    totalSubAreas: number
    totalRegions: number // Keep for backward compatibility
    totalRoutes: number
    totalUsers: number
    totalTeamLeaders: number
    totalChains: number
    totalStores: number
    dateRange: {
      min: string
      max: string
      daysWithData: number
    }
  }
}

export interface HierarchyInfo {
  loginUserCode: string | null
  isTeamLeader: boolean
  allowedUserCount: number
  allowedTeamLeaderCount: number
  allowedFieldUserCount: number
}

// Helper function to get default date range (this month)
const getDefaultDateRange = () => {
  const currentDate = new Date()
  const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const endDate = currentDate

  // Format date without timezone conversion to avoid off-by-one errors
  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate)
  }
}

export const useDashboardFilters = () => {
  // Initialize with default values - set default date range to this month
  const defaultDates = getDefaultDateRange()
  const [filters, setFilters] = useState<DashboardFilters>({
    startDate: defaultDates.startDate,
    endDate: defaultDates.endDate,
    areaCode: null,
    subAreaCode: 'ALN', // Default filter for dashboard: SUB AREA = ALN
    regionCode: null, // Keep for backward compatibility
    cityCode: 'ALN', // Keep for backward compatibility (sync with subAreaCode)
    fieldUserRole: null,
    teamLeaderCode: null,
    userCode: null,
    chainName: null,
    storeCode: null
  })

  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    areas: [],
    subAreas: [],
    regions: [], // Keep for backward compatibility
    cities: [], // Keep for backward compatibility
    fieldUserRoles: [],
    teamLeaders: [],
    fieldUsers: [],
    chains: [],
    stores: [],
    summary: {
      totalAreas: 0,
      totalSubAreas: 0,
      totalRegions: 0, // Keep for backward compatibility
      totalRoutes: 0,
      totalUsers: 0,
      totalTeamLeaders: 0,
      totalChains: 0,
      totalStores: 0,
      dateRange: {
        min: '',
        max: '',
        daysWithData: 0
      }
    }
  })

  const [hierarchyInfo, setHierarchyInfo] = useState<HierarchyInfo>({
    loginUserCode: null,
    isTeamLeader: false,
    allowedUserCount: 0,
    allowedTeamLeaderCount: 0,
    allowedFieldUserCount: 0
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch filter options based on current selections
  const fetchFilterOptions = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()

      // Add current filter values to params - use new parameter names
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)
      if (filters.areaCode) params.append('areaCode', filters.areaCode)
      if (filters.subAreaCode) params.append('subAreaCode', filters.subAreaCode)
      if (filters.fieldUserRole) params.append('fieldUserRole', filters.fieldUserRole)
      if (filters.teamLeaderCode) params.append('teamLeaderCode', filters.teamLeaderCode)
      if (filters.userCode) params.append('userCode', filters.userCode)
      if (filters.chainName) params.append('chainName', filters.chainName)
      if (filters.storeCode) params.append('storeCode', filters.storeCode)

      // Authentication removed - no hierarchy filtering

      const response = await fetch(`/api/dashboard/filters?${params}`)
      const result = await response.json()

      if (result.success || result.data) {
        // Map API response to expected structure
        const mappedData: FilterOptions = {
          areas: result.data?.areas || result.data?.regions || [],
          subAreas: result.data?.subAreas || result.data?.cities || result.data?.routes || [],
          regions: result.data?.regions || result.data?.areas || [], // Keep for backward compatibility
          cities: result.data?.cities || result.data?.subAreas || result.data?.routes || [], // Keep for backward compatibility
          fieldUserRoles: result.data?.fieldUserRoles || [],
          teamLeaders: result.data?.teamLeaders || result.data?.users || [],
          fieldUsers: result.data?.fieldUsers || result.data?.salesmen || result.data?.users || [],
          chains: result.data?.chains || result.data?.channels || [],
          stores: result.data?.stores || result.data?.customers || [],
          summary: result.data?.summary || {
            totalAreas: result.data?.areas?.length || result.data?.regions?.length || 0,
            totalSubAreas: result.data?.subAreas?.length || result.data?.cities?.length || result.data?.routes?.length || 0,
            totalRegions: result.data?.regions?.length || result.data?.areas?.length || 0,
            totalRoutes: result.data?.routes?.length || result.data?.subAreas?.length || 0,
            totalUsers: result.data?.users?.length || 0,
            totalTeamLeaders: result.data?.teamLeaders?.length || result.data?.users?.length || 0,
            totalChains: result.data?.chains?.length || result.data?.channels?.length || 0,
            totalStores: result.data?.stores?.length || result.data?.customers?.length || 0,
            dateRange: result.data?.summary?.dateRange || { min: '', max: '', daysWithData: 0 }
          }
        }
        setFilterOptions(mappedData)
        // Store hierarchy info from response
        if (result.hierarchy) {
          setHierarchyInfo(result.hierarchy)
        }
      } else {
        setError(result.error || 'Failed to fetch filter options')
      }
    } catch (err) {
      console.error('Error fetching filter options:', err)
      setError('Failed to fetch filter options')
    } finally {
      setLoading(false)
    }
  }, [
    filters.startDate,
    filters.endDate,
    filters.areaCode,
    filters.subAreaCode,
    filters.fieldUserRole,
    filters.teamLeaderCode,
    filters.userCode,
    filters.chainName,
    filters.storeCode
  ])

  // Update filter value with cascading logic
  const updateFilter = useCallback((key: keyof DashboardFilters, value: string | null) => {
    setFilters(prev => {
      const updated = { ...prev, [key]: value }

      // Sync areaCode with regionCode for backward compatibility
      if (key === 'areaCode') {
        updated.regionCode = value
        updated.subAreaCode = null
        updated.cityCode = null
        updated.teamLeaderCode = null
        updated.fieldUserRole = null
        updated.userCode = null
      }
      if (key === 'regionCode') {
        updated.areaCode = value
        updated.subAreaCode = null
        updated.cityCode = null
        updated.teamLeaderCode = null
        updated.fieldUserRole = null
        updated.userCode = null
      }

      // Sync subAreaCode with cityCode for backward compatibility
      if (key === 'subAreaCode') {
        updated.cityCode = value
        updated.teamLeaderCode = null
        updated.fieldUserRole = null
        updated.userCode = null
      }
      if (key === 'cityCode') {
        updated.subAreaCode = value
        updated.teamLeaderCode = null
        updated.fieldUserRole = null
        updated.userCode = null
      }

      if (key === 'teamLeaderCode') {
        // Team leader change clears field user role and user
        updated.fieldUserRole = null
        updated.userCode = null
      }

      if (key === 'fieldUserRole') {
        // Field user role change clears field user
        updated.userCode = null
      }

      if (key === 'chainName') {
        // Chain change may affect stores - clear store selection
        updated.storeCode = null
      }

      // Store is independent - doesn't cascade

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

  // Reset all filters - reset to default date range and default SubArea
  const resetFilters = useCallback(() => {
    const defaultDates = getDefaultDateRange()
    setFilters({
      startDate: defaultDates.startDate,
      endDate: defaultDates.endDate,
      areaCode: null,
      subAreaCode: 'ALN', // Default filter for dashboard: SUB AREA = ALN
      regionCode: null, // Keep for backward compatibility
      cityCode: 'ALN', // Keep for backward compatibility (sync with subAreaCode)
      fieldUserRole: null,
      teamLeaderCode: null,
      userCode: null,
      chainName: null,
      storeCode: null
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
    if (filters.fieldUserRole) params.append('fieldUserRole', filters.fieldUserRole)
    if (filters.teamLeaderCode) params.append('teamLeaderCode', filters.teamLeaderCode)
    if (filters.userCode) params.append('userCode', filters.userCode)
    if (filters.chainName) params.append('chainName', filters.chainName)
    if (filters.storeCode) params.append('storeCode', filters.storeCode)

    // Authentication removed - no hierarchy filtering

    return params
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
    summary: filterOptions.summary,
    hierarchyInfo
  }
}