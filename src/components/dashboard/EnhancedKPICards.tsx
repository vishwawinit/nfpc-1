import React, { useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DollarSign, ShoppingCart, Users, Target, CircleHelp } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { useDashboardKPI } from '@/hooks/useDataService'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface EnhancedKPICardsProps {
  dateRange?: string
  additionalParams?: URLSearchParams
  onError?: (error: string) => void
  enabled?: boolean
}

export const EnhancedKPICards: React.FC<EnhancedKPICardsProps> = ({
  dateRange = 'thisMonth',
  additionalParams,
  onError,
  enabled = true
}) => {
  // Memoize params to prevent unnecessary re-renders
  const params = useMemo(() => {
    return additionalParams || new URLSearchParams()
  }, [additionalParams])

  const { data, loading, error } = useDashboardKPI(dateRange, {
    enabled,
    onError,
    additionalParams: params
  })

  // Default values for loading state or missing data
  const kpiData = data || {
    currentNetSales: 0,
    currentTotalSales: 0,
    currentGoodReturns: 0,
    currentBadReturns: 0,
    currentNetOrders: 0,
    currentTotalOrders: 0,
    currentGoodReturnOrders: 0,
    currentBadReturnOrders: 0,
    currentUniqueCustomers: 0,
    currentAvgOrder: 0,
    netSalesChange: 0,
    netOrdersChange: 0,
    uniqueCustomersChange: 0,
    avgOrderChange: 0,
    currencyCode: 'AED',
    currencySymbol: 'AED'
  }

  const currencyCode = kpiData.currencyCode || 'AED'

  // Get comparison text based on date range
  const getComparisonText = () => {
    switch(dateRange) {
      case 'today': return 'from yesterday'
      case 'yesterday': return 'from day before'
      case 'thisWeek': return 'from last week'
      case 'lastWeek': return 'from previous week'
      case 'thisMonth': return 'from last month'
      case 'lastMonth': return 'from previous month'
      case 'thisQuarter': return 'from last quarter'
      case 'thisYear': return 'from last year'
      default: return 'from last year'
    }
  }

  const comparisonText = getComparisonText()

  // Get period text based on date range
  const getPeriodText = () => {
    switch(dateRange) {
      case 'today': return "Today's Customers"
      case 'yesterday': return "Yesterday's Customers"
      case 'thisWeek': return "This Week's Customers"
      case 'lastWeek': return "Last Week's Customers"
      case 'thisMonth': return "This Month's Customers"
      case 'lastMonth': return "Last Month's Customers"
      case 'thisQuarter': return "This Quarter's Customers"
      case 'lastQuarter': return "Last Quarter's Customers"
      case 'thisYear': return "This Year's Customers"
      default: return 'Customers'
    }
  }

  const periodText = getPeriodText()

  // Calculate values
  const grossSales = kpiData.currentTotalSales || 0
  const goodReturns = Math.abs(kpiData.currentGoodReturns || 0)
  const badReturns = Math.abs(kpiData.currentBadReturns || 0)
  const netSales = grossSales - goodReturns - badReturns

  const totalOrders = kpiData.currentTotalOrders || 0
  const goodReturnOrders = Math.abs(kpiData.currentGoodReturnOrders || 0)
  const badReturnOrders = Math.abs(kpiData.currentBadReturnOrders || 0)
  const netOrders = totalOrders - goodReturnOrders - badReturnOrders

  const customers = kpiData.currentUniqueCustomers || 0
  const avgOrderValue = kpiData.currentAvgOrder || (netOrders > 0 ? netSales / netOrders : 0)

  const salesChange = kpiData.netSalesChange || 0
  const ordersChange = kpiData.netOrdersChange || 0
  const customersChange = kpiData.uniqueCustomersChange || 0
  const avgOrderChange = kpiData.avgOrderChange || 0

  return (
    <TooltipProvider>
      <div className="space-y-3 md:space-y-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {/* Net Sales Card */}
          <div className="rounded-lg border bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-row items-center justify-between space-y-0 p-4">
              <div className="flex items-center gap-2">
                <h3 className="tracking-tight text-sm font-medium text-gray-600">Net Sales</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleHelp className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-sm">Total sales after deducting good and bad returns</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <DollarSign className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </div>
            <div className="p-4 pt-0">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-8 bg-gray-200 animate-pulse rounded" />
                  <div className="h-4 bg-gray-200 animate-pulse rounded w-3/4" />
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      {currencyCode}
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                      {formatNumber(netSales)}
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Gross Sales</span>
                      <span className="font-semibold text-gray-900">{formatNumber(grossSales)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-blue-600">Good Returns</span>
                      <span className="font-semibold text-blue-600">-{formatNumber(goodReturns)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-red-600">Bad Returns</span>
                      <span className="font-semibold text-red-600">-{formatNumber(badReturns)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Net Orders Card */}
          <div className="rounded-lg border bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-row items-center justify-between space-y-0 p-4">
              <div className="flex items-center gap-2">
                <h3 className="tracking-tight text-sm font-medium text-gray-600">Net Orders</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleHelp className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-sm">Total orders after deducting good and bad returns</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <ShoppingCart className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </div>
            <div className="p-4 pt-0">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-8 bg-gray-200 animate-pulse rounded" />
                  <div className="h-4 bg-gray-200 animate-pulse rounded w-3/4" />
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      Orders
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                      {formatNumber(netOrders)}
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Total Orders</span>
                      <span className="font-semibold text-gray-900">{formatNumber(totalOrders)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-blue-600">Good Returns</span>
                      <span className="font-semibold text-blue-600">-{formatNumber(goodReturnOrders)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-red-600">Bad Returns</span>
                      <span className="font-semibold text-red-600">-{formatNumber(badReturnOrders)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Customers Card */}
          <div className="rounded-lg border bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-row items-center justify-between space-y-0 p-4">
              <div className="flex items-center gap-2">
                <h3 className="tracking-tight text-sm font-medium text-gray-600">{periodText}</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleHelp className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-sm">Unique customers who made purchases in the selected period</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="text-gray-400">
                <Users className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <div className="p-4 pt-0">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-8 bg-gray-200 animate-pulse rounded" />
                  <div className="h-4 bg-gray-200 animate-pulse rounded w-1/2" />
                </div>
              ) : (
                <>
                  <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                    {formatNumber(customers)}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Avg Order Value Card */}
          <div className="rounded-lg border bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-row items-center justify-between space-y-0 p-4">
              <div className="flex items-center gap-2">
                <h3 className="tracking-tight text-sm font-medium text-gray-600">Avg Order Value</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleHelp className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-sm">Average revenue per order</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="text-gray-400">
                <Target className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <div className="p-4 pt-0">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-8 bg-gray-200 animate-pulse rounded" />
                  <div className="h-4 bg-gray-200 animate-pulse rounded w-1/2" />
                </div>
              ) : (
                <>
                  <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        {currencyCode}
                      </div>
                      <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                        {avgOrderValue.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
