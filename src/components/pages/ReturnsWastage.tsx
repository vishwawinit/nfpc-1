'use client'

import React, { useState, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ComposedChart, Area } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  PackageX, AlertTriangle, RefreshCw, Loader2,
  AlertCircle, BarChart3, Calendar, DollarSign, FileText, HelpCircle, Download, ListFilter
} from 'lucide-react'
import { businessColors } from '@/styles/businessColors'
import { useResponsive } from '@/hooks/useResponsive'
import ExcelJS from 'exceljs'
import { clientCache } from '@/lib/clientCache'

export function ReturnsWastage() {
  const [activeTab, setActiveTab] = useState('return-reasons')
  const [dateRange, setDateRange] = useState('lastMonth')
  const [areaCode, setAreaCode] = useState<string | null>(null)
  const [subAreaCode, setSubAreaCode] = useState<string | null>('DXB') // Default to DXB for faster loading
  const [teamLeaderCode, setTeamLeaderCode] = useState<string | null>(null)
  const [fieldUserRole, setFieldUserRole] = useState<string | null>(null)
  const [fieldUser, setFieldUser] = useState<string | null>(null) // Removed default user, using subArea instead
  const [routeCode, setRouteCode] = useState<string | null>(null)
  const { isMobile} = useResponsive()

  // State for data
  const [data, setData] = useState<any>(null)
  const [filters, setFilters] = useState<any>({
    areas: [],
    subAreas: [],
    fieldUserRoles: [],
    teamLeaders: [],
    fieldUsers: [],
    routes: []
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Pagination state for Good Returns Detail table
  const [goodReturnsCurrentPage, setGoodReturnsCurrentPage] = useState(1)
  const goodReturnsItemsPerPage = 20

  // Pagination state for Bad Returns Detail table
  const [badReturnsCurrentPage, setBadReturnsCurrentPage] = useState(1)
  const badReturnsItemsPerPage = 20

  // Fetch filter options when date range changes
  useEffect(() => {
    fetchFilters()
  }, [dateRange])

  // Fetch filter options when any filter changes (for cascading updates)
  useEffect(() => {
    fetchFilters()
  }, [areaCode, subAreaCode, teamLeaderCode, fieldUserRole])

  // Fetch data when filters change
  useEffect(() => {
    fetchData()
  }, [dateRange, areaCode, subAreaCode, teamLeaderCode, fieldUserRole, fieldUser, routeCode])


  const fetchFilters = async () => {
    try {
      const params = new URLSearchParams({ range: dateRange })

      if (areaCode) params.append('areaCode', areaCode)
      if (subAreaCode) params.append('subAreaCode', subAreaCode)
      if (teamLeaderCode) params.append('teamLeaderCode', teamLeaderCode)
      if (fieldUserRole) params.append('fieldUserRole', fieldUserRole)

      // Check client cache first
      const cached = clientCache.get('/api/returns-wastage/filters', params)
      if (cached && cached.success) {
        setFilters({
          areas: cached.areas || [],
          subAreas: cached.subAreas || [],
          fieldUserRoles: cached.fieldUserRoles || [],
          teamLeaders: cached.teamLeaders || [],
          fieldUsers: cached.fieldUsers || [],
          routes: cached.routes || []
        })
        return
      }

      const response = await fetch(`/api/returns-wastage/filters?${params}`, {
        cache: 'default' // Use browser cache
      })
      const result = await response.json()

      // Store in client cache
      clientCache.set('/api/returns-wastage/filters', result, params, 5 * 60 * 1000)

      if (result.success) {
        setFilters({
          areas: result.areas || [],
          subAreas: result.subAreas || [],
          fieldUserRoles: result.fieldUserRoles || [],
          teamLeaders: result.teamLeaders || [],
          fieldUsers: result.fieldUsers || [],
          routes: result.routes || []
        })
      }
    } catch (error) {
      console.error('Error fetching filters:', error)
    }
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ range: dateRange })

      if (areaCode) params.append('areaCode', areaCode)
      if (subAreaCode) params.append('subAreaCode', subAreaCode)
      if (teamLeaderCode) params.append('teamLeaderCode', teamLeaderCode)
      if (fieldUserRole) params.append('fieldUserRole', fieldUserRole)
      if (fieldUser) params.append('fieldUser', fieldUser)
      if (routeCode) params.append('routeCode', routeCode)

      // Check client cache first
      const cached = clientCache.get('/api/returns-wastage', params)
      if (cached && cached.success) {
        setData(cached.data)
        setLoading(false)
        return
      }

      const response = await fetch(`/api/returns-wastage?${params}`, {
        cache: 'default' // Use browser cache
      })
      const result = await response.json()

      // Store in client cache
      clientCache.set('/api/returns-wastage', result, params, 5 * 60 * 1000)

      if (result.success) {
        setData(result.data)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    // Invalidate cache and refetch
    await fetch('/api/returns-wastage', {
      method: 'POST'
      // POST requests are not cached by default
    })
    // Force fresh data fetch by adding cache-busting timestamp
    const timestamp = Date.now()
    const params = new URLSearchParams({ range: dateRange, _t: timestamp.toString() })

    if (areaCode) params.append('areaCode', areaCode)
    if (subAreaCode) params.append('subAreaCode', subAreaCode)
    if (teamLeaderCode) params.append('teamLeaderCode', teamLeaderCode)
    if (fieldUserRole) params.append('fieldUserRole', fieldUserRole)
    if (fieldUser) params.append('fieldUser', fieldUser)
    if (routeCode) params.append('routeCode', routeCode)

    const response = await fetch(`/api/returns-wastage?${params}`)
    // Cache-busting timestamp forces fresh fetch on manual refresh
    const result = await response.json()
    if (result.success) {
      setData(result.data)
    }
    setRefreshing(false)
  }

  const formatCurrency = (value: number, currencyCode: string = 'AED') => {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2
    }).format(value)
  }

  // Helper functions to get filter labels for export
  const getAreaLabel = () => {
    if (!areaCode) return 'All Areas'
    const area = filters.areas.find((a: any) => a.value === areaCode)
    return area?.label || areaCode
  }

  const getSubAreaLabel = () => {
    if (!subAreaCode) return 'All Sub Areas'
    const subArea = filters.subAreas.find((s: any) => s.value === subAreaCode)
    return subArea?.label || subAreaCode
  }

  const getTeamLeaderLabel = () => {
    if (!teamLeaderCode) return 'All Team Leaders'
    const tl = filters.teamLeaders.find((t: any) => t.value === teamLeaderCode)
    return tl?.label || teamLeaderCode
  }

  const getFieldUserRoleLabel = () => {
    if (!fieldUserRole) return 'All Roles'
    const role = filters.fieldUserRoles.find((r: any) => r.value === fieldUserRole)
    return role?.label || fieldUserRole
  }

  const getFieldUserLabel = () => {
    if (!fieldUser) return 'All Field Users'
    const user = filters.fieldUsers.find((u: any) => u.value === fieldUser)
    return user?.label || fieldUser
  }

  const getRouteLabel = () => {
    if (!routeCode) return 'All Routes'
    const route = filters.routes.find((r: any) => r.value === routeCode)
    return route?.label || routeCode
  }

  // Helper to get currency code from data
  const getCurrency = () => {
    return data?.returnReasons?.summary?.currency_code ||
           data?.periodReturns?.summary?.currency_code ||
           data?.skuReturnPercentage?.summary?.currency_code ||
           data?.returnOnSales?.summary?.currency_code ||
           'AED'
  }

  // Wrapper that automatically uses the data's currency
  const formatValue = (value: number) => {
    return formatCurrency(value, getCurrency())
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value)
  }

  // Format values with K/M suffix for compact display
  const formatCompactValue = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`
    }
    return value.toFixed(0)
  }

  const exportToExcel = async () => {
    if (!data?.returnReasons?.byProduct) return

    const currency = getCurrency()
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Top Returned Products')

    // Set column widths
    worksheet.columns = [
      { width: 10 },  // Rank
      { width: 12 },  // Category
      { width: 15 },  // Product Code
      { width: 35 },  // Product Name
      { width: 25 },  // Reason
      { width: 12 },  // Quantity
      { width: 18 }   // Value
    ]

    let currentRow = 1

    // Add title row
    const titleRow = worksheet.addRow(['Returns & Wastage Analysis - Top 20 Returned Products'])
    titleRow.font = { size: 16, bold: true, color: { argb: 'FF1F2937' } }
    titleRow.alignment = { horizontal: 'center' }
    worksheet.mergeCells(`A${currentRow}:H${currentRow}`)
    titleRow.height = 35
    titleRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' }
    }
    currentRow++

    // Add date and filter info
    const dateRangeLabels: { [key: string]: string } = {
      'today': 'Today',
      'yesterday': 'Yesterday',
      'thisWeek': 'This Week',
      'thisMonth': 'This Month',
      'lastMonth': 'Last Month',
      'thisQuarter': 'This Quarter',
      'thisYear': 'This Year'
    }

    const selectedAreaName = getAreaLabel()
    const selectedSubAreaName = getSubAreaLabel()
    const selectedTeamLeaderName = getTeamLeaderLabel()
    const selectedFieldUserRoleName = getFieldUserRoleLabel()
    const selectedFieldUserName = getFieldUserLabel()
    const selectedRouteName = getRouteLabel()

    const infoRow1 = worksheet.addRow([`Date Range: ${dateRangeLabels[dateRange] || dateRange}`, '', '', '', '', '', '', `Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`])
    infoRow1.font = { size: 10, italic: true }
    worksheet.mergeCells(`A${currentRow}:D${currentRow}`)
    worksheet.mergeCells(`E${currentRow}:H${currentRow}`)
    infoRow1.getCell(8).alignment = { horizontal: 'right' }
    currentRow++

    const infoRow2 = worksheet.addRow([`AREA: ${selectedAreaName}`, '', '', '', `Sub AREA: ${selectedSubAreaName}`])
    infoRow2.font = { size: 10, italic: true }
    worksheet.mergeCells(`A${currentRow}:D${currentRow}`)
    worksheet.mergeCells(`E${currentRow}:H${currentRow}`)
    currentRow++

    const infoRow3 = worksheet.addRow([`Team Leader: ${selectedTeamLeaderName}`, '', '', '', `Field User: ${selectedFieldUserName}`])
    const infoRow4 = worksheet.addRow([`Route: ${selectedRouteName}`])
    infoRow2.font = { size: 10, italic: true }
    worksheet.mergeCells(`A${currentRow}:D${currentRow}`)
    worksheet.mergeCells(`E${currentRow}:H${currentRow}`)
    currentRow++

    // Add empty row
    worksheet.addRow([])
    currentRow++

    // Add Summary Section Header
    const summaryHeaderRow = worksheet.addRow(['RETURNS SUMMARY'])
    summaryHeaderRow.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
    summaryHeaderRow.alignment = { horizontal: 'center' }
    worksheet.mergeCells(`A${currentRow}:H${currentRow}`)
    summaryHeaderRow.height = 25
    summaryHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' }
    }
    currentRow++

    // Calculate percentages
    const goodPercent = ((parseFloat(data?.returnReasons?.summary?.good_return_count || 0) / parseFloat(data?.returnReasons?.summary?.total_return_count || 1)) * 100).toFixed(1)
    const badPercent = ((parseFloat(data?.returnReasons?.summary?.bad_return_count || 0) / parseFloat(data?.returnReasons?.summary?.total_return_count || 1)) * 100).toFixed(1)
    const goodValuePercent = ((parseFloat(data?.returnReasons?.summary?.good_return_value || 0) / parseFloat(data?.returnReasons?.summary?.total_return_value || 1)) * 100).toFixed(1)
    const badValuePercent = ((parseFloat(data?.returnReasons?.summary?.bad_return_value || 0) / parseFloat(data?.returnReasons?.summary?.total_return_value || 1)) * 100).toFixed(1)

    // Good Returns Summary
    const goodSummaryRow = worksheet.addRow([
      'GOOD RETURNS (Sellable)',
      '',
      `Count: ${formatNumber(data?.returnReasons?.summary?.good_return_count || 0)}`,
      `(${goodPercent}%)`,
      `Value: ${formatValue(data?.returnReasons?.summary?.good_return_value || 0)}`,
      `(${goodValuePercent}%)`,
      `Qty: ${formatNumber(data?.returnReasons?.summary?.good_return_qty || 0)}`
    ])
    worksheet.mergeCells(`A${currentRow}:B${currentRow}`)
    goodSummaryRow.font = { bold: true }
    goodSummaryRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD1FAE5' }
    }
    goodSummaryRow.getCell(1).font = { bold: true, color: { argb: 'FF047857' } }
    currentRow++

    // Bad Returns Summary
    const badSummaryRow = worksheet.addRow([
      'BAD RETURNS (Wastage)',
      '',
      `Count: ${formatNumber(data?.returnReasons?.summary?.bad_return_count || 0)}`,
      `(${badPercent}%)`,
      `Value: ${formatValue(data?.returnReasons?.summary?.bad_return_value || 0)}`,
      `(${badValuePercent}%)`,
      `Qty: ${formatNumber(data?.returnReasons?.summary?.bad_return_qty || 0)}`
    ])
    worksheet.mergeCells(`A${currentRow}:B${currentRow}`)
    badSummaryRow.font = { bold: true }
    badSummaryRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFECACA' }
    }
    badSummaryRow.getCell(1).font = { bold: true, color: { argb: 'FFDC2626' } }
    currentRow++

    // Total Returns Summary
    const totalSummaryRow = worksheet.addRow([
      'TOTAL RETURNS',
      '',
      `Count: ${formatNumber(data?.returnReasons?.summary?.total_return_count || 0)}`,
      '(100%)',
      `Value: ${formatValue(data?.returnReasons?.summary?.total_return_value || 0)}`,
      '(100%)',
      `Qty: ${formatNumber(data?.returnReasons?.summary?.total_return_qty || 0)}`
    ])
    worksheet.mergeCells(`A${currentRow}:B${currentRow}`)
    totalSummaryRow.font = { bold: true }
    totalSummaryRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    }
    totalSummaryRow.getCell(1).font = { bold: true, color: { argb: 'FF1F2937' } }
    currentRow++

    // Add empty rows
    worksheet.addRow([])
    currentRow++
    worksheet.addRow([])
    currentRow++

    // Add header row
    const headers = ['Rank', 'Category', 'Product Code', 'Product Name', 'Reason', 'Quantity', `Value (${currency})`]
    const headerRow = worksheet.addRow(headers)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' }
    }
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
    headerRow.height = 25

    // Add data rows
    data.returnReasons.byProduct.forEach((item: any, idx: number) => {
      const row = worksheet.addRow([
        idx + 1,
        item.return_category,
        item.product_code,
        item.product_name,
        item.reason,
        parseFloat(item.return_qty),
        parseFloat(item.return_value)
      ])

      // Style based on category
      if (item.return_category === 'GOOD') {
        row.getCell(2).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD1FAE5' }
        }
        row.getCell(2).font = { color: { argb: 'FF047857' }, bold: true }
      } else {
        row.getCell(2).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFECACA' }
        }
        row.getCell(2).font = { color: { argb: 'FFDC2626' }, bold: true }
      }

      // Format value column as currency
      row.getCell(7).numFmt = '#,##0.00'
      row.getCell(7).alignment = { horizontal: 'right' }

      // Format count and quantity columns as numbers
      row.getCell(6).numFmt = '#,##0'
      row.getCell(6).alignment = { horizontal: 'right' }
      row.getCell(8).numFmt = '#,##0'
      row.getCell(8).alignment = { horizontal: 'right' }

      // Center rank and category
      row.getCell(1).alignment = { horizontal: 'center' }
      row.getCell(2).alignment = { horizontal: 'center' }

      // Medal colors for top 3
      if (idx === 0) {
        row.getCell(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF59E0B' } // Gold
        }
        row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      } else if (idx === 1) {
        row.getCell(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF9CA3AF' } // Silver
        }
        row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      } else if (idx === 2) {
        row.getCell(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEA580C' } // Bronze
        }
        row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      }
    })

    // Add borders to summary and data sections
    worksheet.eachRow((row, rowNumber) => {
      // Add borders to summary section (rows 5-8) and data section (from currentRow onwards)
      if ((rowNumber >= 5 && rowNumber <= 8) || rowNumber >= currentRow) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          }
        })
      }
    })

    // Generate and download file
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url

    // Create descriptive filename
    const areaPart = areaCode || 'AllAreas'
    const fieldUserPart = fieldUser || 'AllFieldUsers'
    const routePart = routeCode || 'AllRoutes'
    link.download = `Returns_Analysis_${dateRangeLabels[dateRange]?.replace(/\s+/g, '')}_${areaPart}_${fieldUserPart}_${routePart}_${new Date().toISOString().split('T')[0]}.xlsx`

    link.click()
    window.URL.revokeObjectURL(url)
  }

  const exportPeriodReturnsToExcel = async () => {
    try {
      console.log('Starting Period Returns Excel export...')

      if (!data?.periodReturns) {
        console.error('No period returns data available')
        alert('No data available to export. Please ensure the report has loaded.')
        return
      }

      console.log('Data available:', {
        byProduct: data.periodReturns.byProduct?.length || 0,
        byChannel: data.periodReturns.byChannel?.length || 0,
        dailyTrend: data.periodReturns.dailyTrend?.length || 0
      })

      const currency = getCurrency()
      const workbook = new ExcelJS.Workbook()

    // ============ SHEET 1: PERIOD SUMMARY ============
    const summarySheet = workbook.addWorksheet('Period Summary')
    summarySheet.columns = [
      { width: 30 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 }
    ]

    let row = 1

    // Title
    const titleRow = summarySheet.addRow(['Period Returns Analysis - Summary'])
    titleRow.font = { size: 16, bold: true, color: { argb: 'FF1F2937' } }
    titleRow.alignment = { horizontal: 'center' }
    summarySheet.mergeCells(`A${row}:E${row}`)
    titleRow.height = 35
    titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
    row++

    // Date and filter info
    const dateRangeLabels: { [key: string]: string } = {
      'today': 'Today', 'yesterday': 'Yesterday', 'thisWeek': 'This Week',
      'thisMonth': 'This Month', 'lastMonth': 'Last Month', 'thisQuarter': 'This Quarter',
      'lastQuarter': 'Last Quarter', 'thisYear': 'This Year'
    }

    const selectedAreaName = getAreaLabel()
    const selectedSubAreaName = getSubAreaLabel()
    const selectedTeamLeaderName = getTeamLeaderLabel()
    const selectedFieldUserRoleName = getFieldUserRoleLabel()
    const selectedFieldUserName = getFieldUserLabel()
    const selectedRouteName = getRouteLabel()

    const infoRow1 = summarySheet.addRow([`Date Range: ${dateRangeLabels[dateRange] || dateRange}`, '', '', '', `Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`])
    infoRow1.font = { size: 10, italic: true }
    summarySheet.mergeCells(`A${row}:C${row}`)
    summarySheet.mergeCells(`D${row}:E${row}`)
    infoRow1.getCell(5).alignment = { horizontal: 'right' }
    row++

    const infoRow2 = summarySheet.addRow([`AREA: ${selectedAreaName}`, '', '', `Sub AREA: ${selectedSubAreaName}`])
    infoRow2.font = { size: 10, italic: true }
    summarySheet.mergeCells(`A${row}:C${row}`)
    summarySheet.mergeCells(`D${row}:E${row}`)
    row++

    const infoRow3 = summarySheet.addRow([`Team Leader: ${selectedTeamLeaderName}`, '', '', `Field User: ${selectedFieldUserName}`])
    const infoRow4 = summarySheet.addRow([`Route: ${selectedRouteName}`])
    infoRow2.font = { size: 10, italic: true }
    summarySheet.mergeCells(`A${row}:C${row}`)
    summarySheet.mergeCells(`D${row}:E${row}`)
    row++

    summarySheet.addRow([])
    row++

    // Sales vs Returns Section
    const salesVsHeader = summarySheet.addRow(['SALES VS RETURNS ANALYSIS'])
    salesVsHeader.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
    salesVsHeader.alignment = { horizontal: 'center' }
    summarySheet.mergeCells(`A${row}:E${row}`)
    salesVsHeader.height = 25
    salesVsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    row++

    const salesData = [
      ['Total Sales', formatValue(data?.periodReturns?.summary?.sale_value || 0), '', '', ''],
      ['Total Returns', formatValue(data?.periodReturns?.summary?.return_value || 0), '', '', ''],
      ['Net Sales', formatValue(data?.periodReturns?.summary?.net_sales_value || 0), '', '', ''],
      ['Return Rate', `${data?.periodReturns?.summary?.return_percentage || 0}%`, '', '', '']
    ]
    salesData.forEach((rowData) => {
      const r = summarySheet.addRow(rowData)
      r.font = { bold: true }
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
      r.getCell(2).alignment = { horizontal: 'right' }
      r.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      }
      row++
    })

    summarySheet.addRow([])
    row++

    // Good vs Bad Returns Section
    const goodBadHeader = summarySheet.addRow(['GOOD VS BAD RETURNS BREAKDOWN'])
    goodBadHeader.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
    goodBadHeader.alignment = { horizontal: 'center' }
    summarySheet.mergeCells(`A${row}:E${row}`)
    goodBadHeader.height = 25
    goodBadHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    row++

    const summary = data?.periodReturns?.summary || {}

    const goodRow = summarySheet.addRow([
      'GOOD RETURNS (Sellable)',
      `Count: ${formatNumber(summary.good_return_count || 0)}`,
      `Value: ${formatValue(summary.good_return_value || 0)}`,
      `Qty: ${formatNumber(summary.return_qty || 0)}`,
      ''
    ])
    goodRow.font = { bold: true }
    goodRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
    goodRow.getCell(1).font = { bold: true, color: { argb: 'FF047857' } }
    row++

    const badRow = summarySheet.addRow([
      'BAD RETURNS (Wastage)',
      `Count: ${formatNumber(summary.bad_return_count || 0)}`,
      `Value: ${formatValue(summary.bad_return_value || 0)}`,
      `Qty: ${formatNumber(summary.return_qty || 0)}`,
      ''
    ])
    badRow.font = { bold: true }
    badRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } }
    badRow.getCell(1).font = { bold: true, color: { argb: 'FFDC2626' } }
    row++

    const totalRow = summarySheet.addRow([
      'TOTAL RETURNS',
      `Count: ${formatNumber(summary.return_count || 0)}`,
      `Value: ${formatValue(summary.return_value || 0)}`,
      `Qty: ${formatNumber(summary.return_qty || 0)}`,
      ''
    ])
    totalRow.font = { bold: true }
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
    totalRow.getCell(1).font = { bold: true, color: { argb: 'FF1F2937' } }

    console.log('✓ Sheet 1 (Period Summary) created')

    // ============ SHEET 2: TOP 20 PRODUCTS ============
    const productsSheet = workbook.addWorksheet('Top 20 Products')
    productsSheet.columns = [
      { width: 8 },   // Rank
      { width: 30 },  // Product
      { width: 18 },  // Brand
      { width: 18 },  // Category
      { width: 12 },  // Qty
      { width: 15 },  // Total Value
      { width: 15 },  // Good Value
      { width: 12 },  // Good Txns
      { width: 15 },  // Bad Value
      { width: 12 },  // Bad Txns
      { width: 10 }   // Transactions
    ]

    row = 1

    const prodTitleRow = productsSheet.addRow(['Top 20 Returned Products - Good vs Bad Breakdown'])
    prodTitleRow.font = { size: 14, bold: true, color: { argb: 'FF1F2937' } }
    prodTitleRow.alignment = { horizontal: 'center' }
    productsSheet.mergeCells(`A${row}:K${row}`)
    prodTitleRow.height = 30
    prodTitleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
    row++

    productsSheet.addRow([])
    row++

    const prodHeaders = ['Rank', 'Product Name', 'Brand', 'Category', 'Qty Returned', 'Total Value', 'Good Value', 'Good Txns', 'Bad Value', 'Bad Txns', 'Total Txns']
    const prodHeaderRow = productsSheet.addRow(prodHeaders)
    prodHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    prodHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    prodHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' }
    prodHeaderRow.height = 25
    row++

    data.periodReturns.byProduct?.forEach((item: any, idx: number) => {
      const dataRow = productsSheet.addRow([
        idx + 1,
        item.product_name,
        item.brand || 'N/A',
        item.category_name || 'N/A',
        parseInt(item.return_qty),
        parseFloat(item.return_value),
        parseFloat(item.good_return_value || 0),
        parseInt(item.good_return_count || 0),
        parseFloat(item.bad_return_value || 0),
        parseInt(item.bad_return_count || 0),
        parseInt(item.return_count)
      ])

      // Format numbers
      dataRow.getCell(5).numFmt = '#,##0'
      dataRow.getCell(5).alignment = { horizontal: 'right' }
      dataRow.getCell(6).numFmt = '#,##0.00'
      dataRow.getCell(6).alignment = { horizontal: 'right' }
      dataRow.getCell(7).numFmt = '#,##0.00'
      dataRow.getCell(7).alignment = { horizontal: 'right' }
      dataRow.getCell(8).numFmt = '#,##0'
      dataRow.getCell(8).alignment = { horizontal: 'right' }
      dataRow.getCell(9).numFmt = '#,##0.00'
      dataRow.getCell(9).alignment = { horizontal: 'right' }
      dataRow.getCell(10).numFmt = '#,##0'
      dataRow.getCell(10).alignment = { horizontal: 'right' }
      dataRow.getCell(11).numFmt = '#,##0'
      dataRow.getCell(11).alignment = { horizontal: 'right' }

      // Color Good/Bad columns
      dataRow.getCell(7).font = { color: { argb: 'FF047857' }, bold: true }
      dataRow.getCell(8).font = { color: { argb: 'FF047857' } }
      dataRow.getCell(9).font = { color: { argb: 'FFDC2626' }, bold: true }
      dataRow.getCell(10).font = { color: { argb: 'FFDC2626' } }

      // Medal colors for top 3
      if (idx === 0) {
        dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } }
        dataRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      } else if (idx === 1) {
        dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9CA3AF' } }
        dataRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      } else if (idx === 2) {
        dataRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } }
        dataRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      }

      dataRow.getCell(1).alignment = { horizontal: 'center' }

      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        }
      })
    })

    console.log('✓ Sheet 2 (Top 20 Products) created with', data.periodReturns.byProduct?.length || 0, 'products')

    // ============ SHEET 3: RETURNS BY CUSTOMER CHANNEL ============
    const channelSheet = workbook.addWorksheet('Returns by Customer Channel')
    channelSheet.columns = [
      { width: 20 },  // Channel
      { width: 12 },  // Qty
      { width: 15 },  // Total Value
      { width: 15 },  // Good Value
      { width: 12 },  // Good Txns
      { width: 15 },  // Bad Value
      { width: 12 },  // Bad Txns
      { width: 12 },  // Transactions
      { width: 12 }   // % of Total
    ]

    row = 1

    const catTitleRow = channelSheet.addRow(['Returns by Customer Channel - Good vs Bad Breakdown'])
    catTitleRow.font = { size: 14, bold: true, color: { argb: 'FF1F2937' } }
    catTitleRow.alignment = { horizontal: 'center' }
    channelSheet.mergeCells(`A${row}:I${row}`)
    catTitleRow.height = 30
    catTitleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
    row++

    channelSheet.addRow([])
    row++

    const catHeaders = ['Customer Channel', 'Qty Returned', 'Total Value', 'Good Value', 'Good Txns', 'Bad Value', 'Bad Txns', 'Total Txns', '% of Total']
    const catHeaderRow = channelSheet.addRow(catHeaders)
    catHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    catHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    catHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' }
    catHeaderRow.height = 25
    row++

    const totalReturnValue = data.periodReturns.byChannel?.reduce((sum: number, item: any) => sum + parseFloat(item.return_value || 0), 0) || 1

    data.periodReturns.byChannel?.forEach((item: any) => {
      const percentage = ((parseFloat(item.return_value || 0) / totalReturnValue) * 100).toFixed(1)
      const dataRow = channelSheet.addRow([
        item.channel_name,
        parseInt(item.return_qty),
        parseFloat(item.return_value),
        parseFloat(item.good_return_value || 0),
        parseInt(item.good_return_count || 0),
        parseFloat(item.bad_return_value || 0),
        parseInt(item.bad_return_count || 0),
        parseInt(item.return_count),
        `${percentage}%`
      ])

      // Format numbers
      dataRow.getCell(2).numFmt = '#,##0'
      dataRow.getCell(2).alignment = { horizontal: 'right' }
      dataRow.getCell(3).numFmt = '#,##0.00'
      dataRow.getCell(3).alignment = { horizontal: 'right' }
      dataRow.getCell(4).numFmt = '#,##0.00'
      dataRow.getCell(4).alignment = { horizontal: 'right' }
      dataRow.getCell(5).numFmt = '#,##0'
      dataRow.getCell(5).alignment = { horizontal: 'right' }
      dataRow.getCell(6).numFmt = '#,##0.00'
      dataRow.getCell(6).alignment = { horizontal: 'right' }
      dataRow.getCell(7).numFmt = '#,##0'
      dataRow.getCell(7).alignment = { horizontal: 'right' }
      dataRow.getCell(8).numFmt = '#,##0'
      dataRow.getCell(8).alignment = { horizontal: 'right' }
      dataRow.getCell(9).alignment = { horizontal: 'right' }

      // Color Good/Bad columns
      dataRow.getCell(4).font = { color: { argb: 'FF047857' }, bold: true }
      dataRow.getCell(5).font = { color: { argb: 'FF047857' } }
      dataRow.getCell(6).font = { color: { argb: 'FFDC2626' }, bold: true }
      dataRow.getCell(7).font = { color: { argb: 'FFDC2626' } }

      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        }
      })
    })

    console.log('✓ Sheet 3 (Returns by Customer Channel) created with', data.periodReturns.byChannel?.length || 0, 'channels')

    // ============ SHEET 4: DAILY TREND ============
    const trendSheet = workbook.addWorksheet('Daily Trend')
    trendSheet.columns = [
      { width: 12 },  // Date
      { width: 15 },  // Good Count
      { width: 15 },  // Bad Count
      { width: 15 },  // Total Value
      { width: 15 }   // Total Qty
    ]

    row = 1

    const trendTitleRow = trendSheet.addRow(['Daily Return Trend - Good vs Bad'])
    trendTitleRow.font = { size: 14, bold: true, color: { argb: 'FF1F2937' } }
    trendTitleRow.alignment = { horizontal: 'center' }
    trendSheet.mergeCells(`A${row}:E${row}`)
    trendTitleRow.height = 30
    trendTitleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
    row++

    trendSheet.addRow([])
    row++

    const trendHeaders = ['Date', 'Good Returns Count', 'Bad Returns Count', `Total Value (${currency})`, 'Total Quantity']
    const trendHeaderRow = trendSheet.addRow(trendHeaders)
    trendHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    trendHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    trendHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' }
    trendHeaderRow.height = 25
    row++

    data.periodReturns.dailyTrend?.forEach((item: any) => {
      const dataRow = trendSheet.addRow([
        item.date,
        parseInt(item.good_return_count || 0),
        parseInt(item.bad_return_count || 0),
        parseFloat(item.return_value || 0),
        parseInt(item.return_qty || 0)
      ])

      dataRow.getCell(2).numFmt = '#,##0'
      dataRow.getCell(2).alignment = { horizontal: 'right' }
      dataRow.getCell(2).font = { color: { argb: 'FF047857' } }
      dataRow.getCell(3).numFmt = '#,##0'
      dataRow.getCell(3).alignment = { horizontal: 'right' }
      dataRow.getCell(3).font = { color: { argb: 'FFDC2626' } }
      dataRow.getCell(4).numFmt = '#,##0.00'
      dataRow.getCell(4).alignment = { horizontal: 'right' }
      dataRow.getCell(5).numFmt = '#,##0'
      dataRow.getCell(5).alignment = { horizontal: 'right' }

      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        }
      })
    })

    console.log('✓ Sheet 4 (Daily Trend) created with', data.periodReturns.dailyTrend?.length || 0, 'days')

      // Generate and download
      console.log('Generating Excel workbook with', workbook.worksheets.length, 'sheets')
      console.log('Sheet names:', workbook.worksheets.map(ws => ws.name))

      const buffer = await workbook.xlsx.writeBuffer()
      console.log('Excel buffer generated, size:', buffer.byteLength, 'bytes')

      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      const areaPart = areaCode || 'AllAreas'
      const fieldUserPart = fieldUser || 'AllFieldUsers'
      const routePart = routeCode || 'AllRoutes'
      const dateLabel = dateRangeLabels[dateRange]?.replace(/\s+/g, '') || 'Custom'
      const filename = `Period_Returns_${dateLabel}_${areaPart}_${fieldUserPart}_${routePart}_${new Date().toISOString().split('T')[0]}.xlsx`
      link.download = filename

      console.log('Downloading file:', filename)
      link.click()
      window.URL.revokeObjectURL(url)
      console.log('Excel export completed successfully!')

    } catch (error) {
      console.error('Error exporting Period Returns to Excel:', error)
      alert(`Failed to export Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const exportTop20ProductsToExcel = async () => {
    if (!data?.periodReturns?.topProducts) return

    try {
      const currency = getCurrency()
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Top 20 Returned Products')

      worksheet.columns = [
        { width: 8 },   // Rank
        { width: 35 },  // Product
        { width: 20 },  // Brand
        { width: 20 },  // Customer Channel
        { width: 15 },  // Qty
        { width: 15 },  // Value
        { width: 12 }   // Transactions
      ]

      const titleRow = worksheet.addRow(['Top 20 Returned Products'])
      titleRow.font = { size: 14, bold: true, color: { argb: 'FF1F2937' } }
      titleRow.alignment = { horizontal: 'center' }
      worksheet.mergeCells('A1:G1')
      titleRow.height = 30
      titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }

      worksheet.addRow([])

      const headers = ['Rank', 'Product', 'Brand', 'Customer Channel', 'Qty Returned', `Value (${currency})`, 'Transactions']
      const headerRow = worksheet.addRow(headers)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
      headerRow.height = 25

      data.periodReturns.topProducts.slice(0, 20).forEach((item: any, index: number) => {
        const dataRow = worksheet.addRow([
          index + 1,
          item.product_name,
          item.brand,
          item.customer_channel || 'Unknown',
          parseInt(item.return_qty || 0),
          parseFloat(item.return_value || 0),
          parseInt(item.return_count || 0)
        ])

        dataRow.getCell(5).numFmt = '#,##0'
        dataRow.getCell(6).numFmt = '#,##0.00'
        dataRow.getCell(7).numFmt = '#,##0'
        dataRow.alignment = { horizontal: 'left' }
        dataRow.getCell(1).alignment = { horizontal: 'center' }
        dataRow.getCell(5).alignment = { horizontal: 'right' }
        dataRow.getCell(6).alignment = { horizontal: 'right' }
        dataRow.getCell(7).alignment = { horizontal: 'right' }

        dataRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' },
            bottom: { style: 'thin' }, right: { style: 'thin' }
          }
        })
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Top_20_Returned_Products_${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting Top 20 Products to Excel:', error)
      alert(`Failed to export Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const exportChannelAnalysisToExcel = async () => {
    if (!data?.periodReturns?.byChannel) return

    try {
      const currency = getCurrency()
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Returns by Customer Channel')

      worksheet.columns = [
        { width: 25 },  // Channel
        { width: 15 },  // Qty
        { width: 15 },  // Total Value
        { width: 15 },  // Good Value
        { width: 12 },  // Good Txns
        { width: 15 },  // Bad Value
        { width: 12 },  // Bad Txns
        { width: 12 },  // Total Txns
        { width: 12 }   // % of Total
      ]

      const titleRow = worksheet.addRow(['Returns by Customer Channel Analysis'])
      titleRow.font = { size: 14, bold: true, color: { argb: 'FF1F2937' } }
      titleRow.alignment = { horizontal: 'center' }
      worksheet.mergeCells('A1:I1')
      titleRow.height = 30
      titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }

      worksheet.addRow([])

      const headers = ['Customer Channel', 'Qty Returned', `Total Value (${currency})`, `Good Value (${currency})`, 'Good Txns', `Bad Value (${currency})`, 'Bad Txns', 'Total Txns', '% of Total']
      const headerRow = worksheet.addRow(headers)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
      headerRow.height = 25

      const totalReturnValue = data.periodReturns.byChannel?.reduce((sum: number, item: any) => sum + parseFloat(item.return_value || 0), 0) || 1

      data.periodReturns.byChannel?.forEach((item: any) => {
        const percentage = ((parseFloat(item.return_value || 0) / totalReturnValue) * 100).toFixed(1)
        const dataRow = worksheet.addRow([
          item.channel_name,
          parseInt(item.return_qty || 0),
          parseFloat(item.return_value || 0),
          parseFloat(item.good_return_value || 0),
          parseInt(item.good_return_count || 0),
          parseFloat(item.bad_return_value || 0),
          parseInt(item.bad_return_count || 0),
          parseInt(item.return_count || 0),
          `${percentage}%`
        ])

        dataRow.getCell(2).numFmt = '#,##0'
        dataRow.getCell(3).numFmt = '#,##0.00'
        dataRow.getCell(4).numFmt = '#,##0.00'
        dataRow.getCell(5).numFmt = '#,##0'
        dataRow.getCell(6).numFmt = '#,##0.00'
        dataRow.getCell(7).numFmt = '#,##0'
        dataRow.getCell(8).numFmt = '#,##0'
        dataRow.alignment = { horizontal: 'left' }
        dataRow.getCell(2).alignment = { horizontal: 'right' }
        dataRow.getCell(3).alignment = { horizontal: 'right' }
        dataRow.getCell(4).alignment = { horizontal: 'right' }
        dataRow.getCell(5).alignment = { horizontal: 'right' }
        dataRow.getCell(6).alignment = { horizontal: 'right' }
        dataRow.getCell(7).alignment = { horizontal: 'right' }
        dataRow.getCell(8).alignment = { horizontal: 'right' }
        dataRow.getCell(9).alignment = { horizontal: 'center' }

        dataRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' },
            bottom: { style: 'thin' }, right: { style: 'thin' }
          }
        })
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Returns_by_Customer_Channel_${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting Channel Analysis to Excel:', error)
      alert(`Failed to export Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const exportWeeklyHistoryToExcel = async () => {
    try {
      console.log('Starting Weekly History Excel export...')

      if (!data?.weeklyHistory?.data || data.weeklyHistory.data.length === 0) {
        console.error('No weekly history data available')
        alert('No data available to export. Please ensure the report has loaded.')
        return
      }

      console.log('Data available:', {
        weeks: data.weeklyHistory.data.length
      })

      const currency = getCurrency()
      const workbook = new ExcelJS.Workbook()

      // ============ SHEET 1: SUMMARY ============
      const summarySheet = workbook.addWorksheet('Summary')
      summarySheet.columns = [
        { width: 30 },
        { width: 18 },
        { width: 18 },
        { width: 18 }
      ]

      let row = 1

      // Title
      const titleRow = summarySheet.addRow(['Weekly Returns History - Summary'])
      titleRow.font = { size: 16, bold: true, color: { argb: 'FF1F2937' } }
      titleRow.alignment = { horizontal: 'center' }
      summarySheet.mergeCells(`A${row}:D${row}`)
      titleRow.height = 35
      titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      row++

      // Date and filter info
      const dateRangeLabels: { [key: string]: string } = {
        'today': 'Today', 'yesterday': 'Yesterday', 'thisWeek': 'This Week',
        'thisMonth': 'This Month', 'lastMonth': 'Last Month', 'thisQuarter': 'This Quarter',
        'lastQuarter': 'Last Quarter', 'thisYear': 'This Year'
      }

      const selectedSalesmanName = selectedSalesman === 'all' ? 'All Salesmen' :
        filters.salesmen.find((s: any) => s.code === selectedSalesman)?.name || selectedSalesman
      const selectedRouteName = selectedRoute === 'all' ? 'All Routes' :
        filters.routes.find((r: any) => r.code === selectedRoute)?.name || selectedRoute
      const selectedRegionName = getRegionName(selectedRegion)

      const infoRow1 = summarySheet.addRow([`Date Range: ${dateRangeLabels[dateRange] || dateRange}`, '', '', `Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`])
      infoRow1.font = { size: 10, italic: true }
      summarySheet.mergeCells(`A${row}:B${row}`)
      summarySheet.mergeCells(`C${row}:D${row}`)
      infoRow1.getCell(3).alignment = { horizontal: 'right' }
      row++

      const infoRow2 = summarySheet.addRow([`AREA: ${selectedAreaName}`, '', `Sub AREA: ${selectedSubAreaName}`])
      infoRow2.font = { size: 10, italic: true }
      summarySheet.mergeCells(`A${row}:B${row}`)
      summarySheet.mergeCells(`C${row}:D${row}`)
      row++

      const infoRow3 = summarySheet.addRow([`Team Leader: ${selectedTeamLeaderName}`, '', '', `Field User: ${selectedFieldUserName}`])
    const infoRow4 = summarySheet.addRow([`Route: ${selectedRouteName}`])
      infoRow3.font = { size: 10, italic: true }
      summarySheet.mergeCells(`A${row}:B${row}`)
      summarySheet.mergeCells(`C${row}:D${row}`)
      row++

      summarySheet.addRow([])
      row++

      // Calculate summary statistics - Convert string values to numbers
      const weeks = data.weeklyHistory.data
      const totalWeeks = weeks.length
      const totalReturnValue = weeks.reduce((sum: number, w: any) => sum + Number(w.return_value || 0), 0)
      const avgWeeklyReturns = totalWeeks > 0 ? totalReturnValue / totalWeeks : 0
      const peakWeek = weeks.reduce((max: any, w: any) => Number(w.return_value || 0) > Number(max.return_value || 0) ? w : max, weeks[0] || {})
      const totalGoodReturns = weeks.reduce((sum: number, w: any) => sum + Number(w.good_return_value || 0), 0)
      const totalBadReturns = weeks.reduce((sum: number, w: any) => sum + Number(w.bad_return_value || 0), 0)

      // Key Metrics Section
      const metricsHeader = summarySheet.addRow(['KEY METRICS'])
      metricsHeader.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
      metricsHeader.alignment = { horizontal: 'center' }
      summarySheet.mergeCells(`A${row}:D${row}`)
      metricsHeader.height = 25
      metricsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      row++

      const metricsData = [
        ['Total Weeks Tracked', totalWeeks.toString(), '', ''],
        ['Average Weekly Returns', formatValue(avgWeeklyReturns), '', ''],
        ['Peak Week Returns', formatValue(peakWeek.return_value || 0), `Week of ${peakWeek.week_start || 'N/A'}`, '']
      ]
      metricsData.forEach((rowData) => {
        const r = summarySheet.addRow(rowData)
        r.font = { bold: true }
        r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
        r.getCell(2).alignment = { horizontal: 'right' }
        r.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        }
        row++
      })

      summarySheet.addRow([])
      row++

      // Good vs Bad Returns Section
      const goodBadHeader = summarySheet.addRow(['GOOD VS BAD RETURNS BREAKDOWN'])
      goodBadHeader.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
      goodBadHeader.alignment = { horizontal: 'center' }
      summarySheet.mergeCells(`A${row}:D${row}`)
      goodBadHeader.height = 25
      goodBadHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      row++

      const goodRow = summarySheet.addRow([
        'GOOD RETURNS (Sellable)',
        formatValue(totalGoodReturns),
        `${(totalReturnValue > 0 ? (totalGoodReturns / totalReturnValue) * 100 : 0).toFixed(1)}% of Total`,
        ''
      ])
      goodRow.font = { bold: true }
      goodRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
      goodRow.getCell(1).font = { bold: true, color: { argb: 'FF047857' } }
      row++

      const badRow = summarySheet.addRow([
        'BAD RETURNS (Wastage)',
        formatValue(totalBadReturns),
        `${(totalReturnValue > 0 ? (totalBadReturns / totalReturnValue) * 100 : 0).toFixed(1)}% of Total`,
        ''
      ])
      badRow.font = { bold: true }
      badRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } }
      badRow.getCell(1).font = { bold: true, color: { argb: 'FFDC2626' } }
      row++

      const totalRow = summarySheet.addRow([
        'TOTAL RETURNS',
        formatValue(totalReturnValue),
        '100% of Total',
        ''
      ])
      totalRow.font = { bold: true }
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
      totalRow.getCell(1).font = { bold: true, color: { argb: 'FF1F2937' } }

      console.log('✓ Sheet 1 (Summary) created')

      // ============ SHEET 2: WEEKLY DATA ============
      const weeklySheet = workbook.addWorksheet('Weekly Data')
      weeklySheet.columns = [
        { width: 12 },  // Week Start
        { width: 12 },  // Week End
        { width: 14 },  // Total Returns
        { width: 12 },  // Return Qty
        { width: 14 },  // Good Returns
        { width: 12 },  // Good Count
        { width: 14 },  // Bad Returns
        { width: 12 },  // Bad Count
        { width: 12 },  // Transactions
        { width: 12 },  // Products
        { width: 12 }   // Salesmen
      ]

      row = 1

      // Title
      const weeklyTitleRow = weeklySheet.addRow(['Weekly Returns Data'])
      weeklyTitleRow.font = { size: 16, bold: true, color: { argb: 'FF1F2937' } }
      weeklyTitleRow.alignment = { horizontal: 'center' }
      weeklySheet.mergeCells(`A${row}:K${row}`)
      weeklyTitleRow.height = 35
      weeklyTitleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      row++

      // Date and filter info
      const weeklyInfoRow1 = weeklySheet.addRow([`Date Range: ${dateRangeLabels[dateRange] || dateRange}`, '', '', '', '', '', '', '', '', '', `Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`])
      weeklyInfoRow1.font = { size: 10, italic: true }
      weeklySheet.mergeCells(`A${row}:E${row}`)
      weeklySheet.mergeCells(`F${row}:K${row}`)
      weeklyInfoRow1.getCell(6).alignment = { horizontal: 'right' }
      row++

      const weeklyInfoRow2 = weeklySheet.addRow([`Field User: ${selectedFieldUserName}`, '', '', '', '', `Route: ${selectedRouteName}`])
      weeklyInfoRow2.font = { size: 10, italic: true }
      weeklySheet.mergeCells(`A${row}:E${row}`)
      weeklySheet.mergeCells(`F${row}:K${row}`)
      row++

      weeklySheet.addRow([])
      row++

      // Header row
      const headerRow = weeklySheet.addRow([
        'Week Start',
        'Week End',
        'Total Returns',
        'Return Qty',
        'Good Returns',
        'Good Txns',
        'Bad Returns',
        'Bad Txns',
        'Total Txns',
        'Products',
        'Salesmen'
      ])
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
      headerRow.height = 25
      row++

      // Data rows - Convert string values to numbers
      weeks.forEach((week: any) => {
        const dataRow = weeklySheet.addRow([
          week.week_start || '',
          week.week_end || '',
          Number(week.return_value || 0),
          Number(week.return_qty || 0),
          Number(week.good_return_value || 0),
          Number(week.good_return_count || 0),
          Number(week.bad_return_value || 0),
          Number(week.bad_return_count || 0),
          Number(week.return_count || 0),
          Number(week.unique_products || 0),
          Number(week.unique_salesmen || 0)
        ])

        // Format currency columns
        dataRow.getCell(3).numFmt = '#,##0.00'
        dataRow.getCell(5).numFmt = '#,##0.00'
        dataRow.getCell(7).numFmt = '#,##0.00'

        // Color code Good/Bad columns
        dataRow.getCell(5).font = { color: { argb: 'FF047857' } }
        dataRow.getCell(6).font = { color: { argb: 'FF047857' } }
        dataRow.getCell(7).font = { color: { argb: 'FFDC2626' } }
        dataRow.getCell(8).font = { color: { argb: 'FFDC2626' } }

        // Align numbers to right
        for (let i = 3; i <= 11; i++) {
          dataRow.getCell(i).alignment = { horizontal: 'right' }
        }

        // Zebra striping
        if (row % 2 === 0) {
          dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
        }

        row++
      })

      console.log('✓ Sheet 2 (Weekly Data) created with', weeks.length, 'weeks')

      // Generate and download
      console.log('Generating Excel workbook with', workbook.worksheets.length, 'sheets')
      console.log('Sheet names:', workbook.worksheets.map(ws => ws.name))

      const buffer = await workbook.xlsx.writeBuffer()
      console.log('Excel buffer generated, size:', buffer.byteLength, 'bytes')

      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      const areaPart = areaCode || 'AllAreas'
      const fieldUserPart = fieldUser || 'AllFieldUsers'
      const routePart = routeCode || 'AllRoutes'
      const dateLabel = dateRangeLabels[dateRange]?.replace(/\s+/g, '') || 'Custom'
      const filename = `Weekly_History_${dateLabel}_${areaPart}_${fieldUserPart}_${routePart}_${new Date().toISOString().split('T')[0]}.xlsx`
      link.download = filename

      console.log('Downloading file:', filename)
      link.click()
      window.URL.revokeObjectURL(url)
      console.log('Excel export completed successfully!')

    } catch (error) {
      console.error('Error exporting Weekly History to Excel:', error)
      alert(`Failed to export Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const exportSKUReturnToExcel = async () => {
    try {
      console.log('Starting SKU Return % Excel export...')

      if (!data?.skuReturnPercentage?.data || data.skuReturnPercentage.data.length === 0) {
        console.error('No SKU return data available')
        alert('No data available to export. Please ensure the report has loaded.')
        return
      }

      console.log('Data available:', {
        products: data.skuReturnPercentage.data.length
      })

      const workbook = new ExcelJS.Workbook()

      // ============ SHEET 1: SUMMARY ============
      const summarySheet = workbook.addWorksheet('Summary')
      summarySheet.columns = [
        { width: 30 },
        { width: 18 },
        { width: 18 },
        { width: 18 }
      ]

      let row = 1

      // Title
      const titleRow = summarySheet.addRow(['SKU Return % Analysis - Summary'])
      titleRow.font = { size: 16, bold: true, color: { argb: 'FF1F2937' } }
      titleRow.alignment = { horizontal: 'center' }
      summarySheet.mergeCells(`A${row}:D${row}`)
      titleRow.height = 35
      titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      row++

      // Date and filter info
      const dateRangeLabels: { [key: string]: string } = {
        'today': 'Today', 'yesterday': 'Yesterday', 'thisWeek': 'This Week',
        'thisMonth': 'This Month', 'lastMonth': 'Last Month', 'thisQuarter': 'This Quarter',
        'lastQuarter': 'Last Quarter', 'thisYear': 'This Year'
      }

      const selectedSalesmanName = selectedSalesman === 'all' ? 'All Salesmen' :
        filters.salesmen.find((s: any) => s.code === selectedSalesman)?.name || selectedSalesman
      const selectedRouteName = selectedRoute === 'all' ? 'All Routes' :
        filters.routes.find((r: any) => r.code === selectedRoute)?.name || selectedRoute
      const selectedRegionName = getRegionName(selectedRegion)

      const infoRow1 = summarySheet.addRow([`Date Range: ${dateRangeLabels[dateRange] || dateRange}`, '', '', `Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`])
      infoRow1.font = { size: 10, italic: true }
      summarySheet.mergeCells(`A${row}:B${row}`)
      summarySheet.mergeCells(`C${row}:D${row}`)
      infoRow1.getCell(3).alignment = { horizontal: 'right' }
      row++

      const infoRow2 = summarySheet.addRow([`AREA: ${selectedAreaName}`, '', `Sub AREA: ${selectedSubAreaName}`])
      infoRow2.font = { size: 10, italic: true }
      summarySheet.mergeCells(`A${row}:B${row}`)
      summarySheet.mergeCells(`C${row}:D${row}`)
      row++

      const infoRow3 = summarySheet.addRow([`Team Leader: ${selectedTeamLeaderName}`, '', '', `Field User: ${selectedFieldUserName}`])
    const infoRow4 = summarySheet.addRow([`Route: ${selectedRouteName}`])
      infoRow3.font = { size: 10, italic: true }
      summarySheet.mergeCells(`A${row}:B${row}`)
      summarySheet.mergeCells(`C${row}:D${row}`)
      row++

      summarySheet.addRow([])
      row++

      const summary = data.skuReturnPercentage.summary || {}

      // Key Metrics Section
      const metricsHeader = summarySheet.addRow(['KEY METRICS'])
      metricsHeader.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
      metricsHeader.alignment = { horizontal: 'center' }
      summarySheet.mergeCells(`A${row}:D${row}`)
      metricsHeader.height = 25
      metricsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      row++

      const metricsData = [
        ['Return Rate (Units)', `${summary.overall_return_percentage || 0}%`, '', ''],
        ['Net Sales Value', formatValue(summary.net_sales_value || 0), '', ''],
        ['Total Units Returned', formatNumber(summary.total_returned || 0), '', ''],
        ['Total Return Value', formatValue(summary.total_return_value || 0), '', '']
      ]
      metricsData.forEach((rowData) => {
        const r = summarySheet.addRow(rowData)
        r.font = { bold: true }
        r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
        r.getCell(2).alignment = { horizontal: 'right' }
        r.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        }
        row++
      })

      summarySheet.addRow([])
      row++

      // Good vs Bad Returns Section
      const goodBadHeader = summarySheet.addRow(['GOOD VS BAD RETURNS BREAKDOWN'])
      goodBadHeader.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
      goodBadHeader.alignment = { horizontal: 'center' }
      summarySheet.mergeCells(`A${row}:D${row}`)
      goodBadHeader.height = 25
      goodBadHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      row++

      const goodRow = summarySheet.addRow([
        'GOOD RETURNS (Sellable)',
        `${formatNumber(summary.good_returned || 0)} units`,
        formatValue(summary.good_return_value || 0),
        ''
      ])
      goodRow.font = { bold: true }
      goodRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
      goodRow.getCell(1).font = { bold: true, color: { argb: 'FF047857' } }
      row++

      const badRow = summarySheet.addRow([
        'BAD RETURNS (Wastage)',
        `${formatNumber(summary.bad_returned || 0)} units`,
        formatValue(summary.bad_return_value || 0),
        ''
      ])
      badRow.font = { bold: true }
      badRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } }
      badRow.getCell(1).font = { bold: true, color: { argb: 'FFDC2626' } }
      row++

      const totalRow = summarySheet.addRow([
        'TOTAL RETURNS',
        `${formatNumber(summary.total_returned || 0)} units`,
        formatValue(summary.total_return_value || 0),
        ''
      ])
      totalRow.font = { bold: true }
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
      totalRow.getCell(1).font = { bold: true, color: { argb: 'FF1F2937' } }

      console.log('✓ Sheet 1 (Summary) created')

      // ============ SHEET 2: PRODUCTS DATA ============
      const productsSheet = workbook.addWorksheet('Products Data')
      productsSheet.columns = [
        { width: 15 },  // Product Code
        { width: 35 },  // Product Name
        { width: 20 },  // Category
        { width: 12 },  // Sold
        { width: 12 },  // Returned
        { width: 10 },  // Return %
        { width: 14 },  // Good Returns
        { width: 14 },  // Good Value
        { width: 14 },  // Bad Returns
        { width: 14 },  // Bad Value
        { width: 14 }   // Total Value
      ]

      row = 1

      // Title
      const productsTitleRow = productsSheet.addRow(['SKU Return % - Products Data'])
      productsTitleRow.font = { size: 16, bold: true, color: { argb: 'FF1F2937' } }
      productsTitleRow.alignment = { horizontal: 'center' }
      productsSheet.mergeCells(`A${row}:K${row}`)
      productsTitleRow.height = 35
      productsTitleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      row++

      // Date and filter info
      const productsInfoRow1 = productsSheet.addRow([`Date Range: ${dateRangeLabels[dateRange] || dateRange}`, '', '', '', '', '', '', '', '', '', `Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`])
      productsInfoRow1.font = { size: 10, italic: true }
      productsSheet.mergeCells(`A${row}:E${row}`)
      productsSheet.mergeCells(`F${row}:K${row}`)
      productsInfoRow1.getCell(6).alignment = { horizontal: 'right' }
      row++

      const productsInfoRow2 = productsSheet.addRow([`Salesman: ${selectedSalesmanName}`, '', '', '', '', `Route: ${selectedRouteName}`])
      productsInfoRow2.font = { size: 10, italic: true }
      productsSheet.mergeCells(`A${row}:E${row}`)
      productsSheet.mergeCells(`F${row}:K${row}`)
      row++

      productsSheet.addRow([])
      row++

      // Header row
      const headerRow = productsSheet.addRow([
        'Product Code',
        'Product Name',
        'Category',
        'Sold (Units)',
        'Returned',
        'Return %',
        'Good Returns',
        'Good Value',
        'Bad Returns',
        'Bad Value',
        'Total Value'
      ])
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
      headerRow.height = 25
      row++

      // Data rows - Convert string values to numbers
      const products = data.skuReturnPercentage.data
      products.forEach((product: any) => {
        const dataRow = productsSheet.addRow([
          product.product_code || '',
          product.product_name || '',
          product.category_name || '',
          Number(product.total_sold || 0),
          Number(product.total_returned || 0),
          Number(product.return_percentage || 0),
          Number(product.good_returned || 0),
          Number(product.good_return_value || 0),
          Number(product.bad_returned || 0),
          Number(product.bad_return_value || 0),
          Number(product.return_value || 0)
        ])

        // Format currency columns
        dataRow.getCell(8).numFmt = '#,##0.00'
        dataRow.getCell(10).numFmt = '#,##0.00'
        dataRow.getCell(11).numFmt = '#,##0.00'

        // Color code Good/Bad columns
        dataRow.getCell(7).font = { color: { argb: 'FF047857' } }
        dataRow.getCell(8).font = { color: { argb: 'FF047857' } }
        dataRow.getCell(9).font = { color: { argb: 'FFDC2626' } }
        dataRow.getCell(10).font = { color: { argb: 'FFDC2626' } }

        // Align numbers to right
        for (let i = 4; i <= 11; i++) {
          dataRow.getCell(i).alignment = { horizontal: 'right' }
        }

        // Zebra striping
        if (row % 2 === 0) {
          dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
        }

        row++
      })

      console.log('✓ Sheet 2 (Products Data) created with', products.length, 'products')

      // Generate and download
      console.log('Generating Excel workbook with', workbook.worksheets.length, 'sheets')
      console.log('Sheet names:', workbook.worksheets.map(ws => ws.name))

      const buffer = await workbook.xlsx.writeBuffer()
      console.log('Excel buffer generated, size:', buffer.byteLength, 'bytes')

      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      const areaPart = areaCode || 'AllAreas'
      const fieldUserPart = fieldUser || 'AllFieldUsers'
      const routePart = routeCode || 'AllRoutes'
      const dateLabel = dateRangeLabels[dateRange]?.replace(/\s+/g, '') || 'Custom'
      const filename = `SKU_Return_Percentage_${dateLabel}_${areaPart}_${fieldUserPart}_${routePart}_${new Date().toISOString().split('T')[0]}.xlsx`
      link.download = filename

      console.log('Downloading file:', filename)
      link.click()
      window.URL.revokeObjectURL(url)
      console.log('Excel export completed successfully!')

    } catch (error) {
      console.error('Error exporting SKU Return % to Excel:', error)
      alert(`Failed to export Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const exportReturnOnSalesToExcel = async () => {
    try {
      if (!data?.returnOnSales?.data || data.returnOnSales.data.length === 0) {
        alert('No data available to export.')
        return
      }

      const currency = getCurrency()
      const workbook = new ExcelJS.Workbook()
      const salesmen = data.returnOnSales.data // Use full dataset, bypass pagination
      const summary = data.returnOnSales.summary

      // ===== SHEET 1: SUMMARY =====
      const summarySheet = workbook.addWorksheet('Summary')
      summarySheet.columns = [
        { key: 'metric', width: 35 },
        { key: 'value', width: 20 },
        { key: 'percentage', width: 20 },
        { key: 'count', width: 15 }
      ]

      // Date and filter info
      const dateRangeLabels: { [key: string]: string } = {
        'today': 'Today', 'yesterday': 'Yesterday', 'thisWeek': 'This Week',
        'thisMonth': 'This Month', 'lastMonth': 'Last Month', 'thisQuarter': 'This Quarter',
        'lastQuarter': 'Last Quarter', 'thisYear': 'This Year'
      }

      const selectedSalesmanName = selectedSalesman === 'all' ? 'All Salesmen' :
        filters.salesmen.find((s: any) => s.code === selectedSalesman)?.name || selectedSalesman
      const selectedRouteName = selectedRoute === 'all' ? 'All Routes' :
        filters.routes.find((r: any) => r.code === selectedRoute)?.name || selectedRoute
      const selectedRegionName = getRegionName(selectedRegion)

      summarySheet.addRow(['Generated:', new Date().toLocaleString()])
      summarySheet.addRow(['Date Range:', dateRangeLabels[dateRange] || dateRange])
      summarySheet.addRow(['Region:', selectedRegionName])
      summarySheet.addRow(['Salesman Filter:', selectedSalesmanName])
      summarySheet.addRow(['Route Filter:', selectedRouteName])
      summarySheet.addRow([])

      // Key Metrics - Convert string values to numbers
      summarySheet.addRow(['KEY METRICS', '', '', ''])
      summarySheet.addRow(['Total Sales', formatValue(summary?.total_sales || 0), '', ''])
      summarySheet.addRow(['Total Returns', formatValue(summary?.total_returns || 0), '', ''])
      summarySheet.addRow(['Overall Return Rate', '', `${Number(summary?.return_percentage || 0)}%`, ''])
      summarySheet.addRow(['Salesmen with Returns', '', '', salesmen.length])
      summarySheet.addRow([])

      // Good vs Bad Returns Breakdown - Convert string values to numbers
      summarySheet.addRow(['GOOD VS BAD RETURNS BREAKDOWN', '', '', ''])
      const totalReturns = Number(summary?.total_returns || 0)
      const goodReturns = Number(summary?.good_return_value || 0)
      const badReturns = Number(summary?.bad_return_value || 0)
      const goodCount = Number(summary?.good_return_count || 0)
      const badCount = Number(summary?.bad_return_count || 0)

      summarySheet.addRow([
        'GOOD RETURNS (Sellable)',
        formatValue(goodReturns),
        `${(totalReturns > 0 ? (goodReturns / totalReturns) * 100 : 0).toFixed(1)}% of Total`,
        `${goodCount} transactions`
      ])
      summarySheet.addRow([
        'BAD RETURNS (Wastage)',
        formatValue(badReturns),
        `${(totalReturns > 0 ? (badReturns / totalReturns) * 100 : 0).toFixed(1)}% of Total`,
        `${badCount} transactions`
      ])
      summarySheet.addRow([
        'TOTAL RETURNS',
        formatValue(totalReturns),
        '100% of Total',
        ''
      ])

      summarySheet.addRow([])

      // Important Note about Returns
      summarySheet.addRow(['UNDERSTANDING RETURNS BY SALESMAN', '', '', ''])
      summarySheet.addRow([
        'What does this report show?',
        'This report shows returns processed in the selected period by each salesman, broken down by Good Returns (sellable) and Bad Returns (wastage).',
        '',
        ''
      ])
      summarySheet.addRow([
        'Key Focus Areas:',
        'Identify salesmen with high return percentages or high wastage to address potential issues with product handling, customer education, or operational concerns.',
        '',
        ''
      ])
      summarySheet.addRow([
        'Route Column:',
        'The Route Code column shows the route sub-area code assigned to each salesman.',
        '',
        ''
      ])

      // Style the summary sheet
      summarySheet.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFFFFF' } }
      summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EA580C' } }
      summarySheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' }

      summarySheet.getRow(8).font = { bold: true, size: 12, color: { argb: 'FFFFFF' } }
      summarySheet.getRow(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '64748B' } }

      // Highlight good/bad returns
      summarySheet.getRow(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } }
      summarySheet.getRow(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } }
      summarySheet.getRow(11).font = { bold: true }

      // Style the Important Note section
      const noteHeaderRow = summarySheet.getRow(13)
      noteHeaderRow.font = { bold: true, size: 12, color: { argb: 'FFFFFF' } }
      noteHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3B82F6' } }
      summarySheet.mergeCells('A13:D13')

      // Style note content rows with blue background
      for (let i = 14; i <= 16; i++) {
        const row = summarySheet.getRow(i)
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DBEAFE' } }
        row.getCell(1).font = { bold: true }
        summarySheet.mergeCells(`B${i}:D${i}`)
        row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
      }

      // ===== SHEET 2: SALESMAN DATA =====
      const dataSheet = workbook.addWorksheet('Salesman Data')
      dataSheet.columns = [
        { header: 'Salesman Code', key: 'salesman_code', width: 15 },
        { header: 'Salesman Name', key: 'salesman_name', width: 25 },
        { header: 'Route Code', key: 'route_code', width: 15 },
        { header: `Good Returns (${currency})`, key: 'good_return_value', width: 18 },
        { header: 'Good Return Count', key: 'good_return_count', width: 18 },
        { header: `Bad Returns (${currency})`, key: 'bad_return_value', width: 18 },
        { header: 'Bad Return Count', key: 'bad_return_count', width: 18 },
        { header: `Total Returns (${currency})`, key: 'total_returns', width: 18 },
        { header: 'Return %', key: 'return_percentage', width: 12 }
      ]

      // Add all salesmen data (bypassing pagination) - Convert string values to numbers
      salesmen.forEach((salesman: any) => {
        dataSheet.addRow({
          salesman_code: salesman.salesman_code || '',
          salesman_name: salesman.salesman_name || '',
          route_code: salesman.route_code || 'N/A',
          good_return_value: Number(salesman.good_return_value || 0),
          good_return_count: Number(salesman.good_return_count || 0),
          bad_return_value: Number(salesman.bad_return_value || 0),
          bad_return_count: Number(salesman.bad_return_count || 0),
          total_returns: Number(salesman.total_returns || 0),
          return_percentage: Number(salesman.return_percentage || 0)
        })
      })

      // Format currency columns
      dataSheet.getColumn('good_return_value').numFmt = '#,##0.00'
      dataSheet.getColumn('bad_return_value').numFmt = '#,##0.00'
      dataSheet.getColumn('total_returns').numFmt = '#,##0.00'
      dataSheet.getColumn('return_percentage').numFmt = '0.0"%"'

      // Style header row
      const headerRow = dataSheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EA580C' } }
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
      headerRow.height = 25

      // Add borders to all cells
      dataSheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'CCCCCC' } },
            left: { style: 'thin', color: { argb: 'CCCCCC' } },
            bottom: { style: 'thin', color: { argb: 'CCCCCC' } },
            right: { style: 'thin', color: { argb: 'CCCCCC' } }
          }
          if (rowNumber > 1) {
            cell.alignment = { vertical: 'middle', horizontal: rowNumber === 1 ? 'center' : 'left' }
          }
        })
      })

      // Generate and download the file
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Return_on_Sales_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      console.log('Excel export completed successfully!')

    } catch (error) {
      console.error('Error exporting Return on Sales to Excel:', error)
      alert(`Failed to export Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Excel export for Good Returns (Sellable products)
  const exportGoodReturnsToExcel = async () => {
    try {
      if (!data?.goodReturnsDetail?.data || data.goodReturnsDetail.data.length === 0) {
        alert('No good returns data available to export.')
        return
      }

      const currency = getCurrency()
      const workbook = new ExcelJS.Workbook()
      const transactions = data.goodReturnsDetail.data

      // Calculate summary metrics
      const totalQty = transactions.reduce((sum: number, row: any) => sum + (Number(row.quantity) || 0), 0)
      const totalValue = transactions.reduce((sum: number, row: any) => sum + (Number(row.return_value) || 0), 0)
      const uniqueSalesmen = new Set(transactions.map((r: any) => r.salesman_code)).size
      const uniqueCustomers = new Set(transactions.map((r: any) => r.customer_code)).size
      const uniqueProducts = new Set(transactions.map((r: any) => r.product_code)).size

      // ===== SHEET 1: SUMMARY =====
      const summarySheet = workbook.addWorksheet('Summary')
      summarySheet.columns = [
        { key: 'metric', width: 40 },
        { key: 'value', width: 25 }
      ]

      // Title
      const titleRow = summarySheet.addRow(['GOOD RETURNS (SELLABLE) - SUMMARY REPORT'])
      titleRow.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
      titleRow.alignment = { horizontal: 'center' }
      titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }
      titleRow.height = 35
      summarySheet.mergeCells('A1:B1')

      // Filter info
      const dateRangeLabels: { [key: string]: string } = {
        'today': 'Today', 'yesterday': 'Yesterday', 'thisWeek': 'This Week',
        'thisMonth': 'This Month', 'lastMonth': 'Last Month', 'thisQuarter': 'This Quarter',
        'lastQuarter': 'Last Quarter', 'thisYear': 'This Year'
      }
      const selectedSalesmanName = selectedSalesman === 'all' ? 'All Salesmen' :
        filters.salesmen.find((s: any) => s.code === selectedSalesman)?.name || selectedSalesman
      const selectedRouteName = selectedRoute === 'all' ? 'All Routes' :
        filters.routes.find((r: any) => r.code === selectedRoute)?.name || selectedRoute
      const selectedRegionName = getRegionName(selectedRegion)

      summarySheet.addRow(['Generated:', new Date().toLocaleString()])
      summarySheet.addRow(['Date Range:', dateRangeLabels[dateRange] || dateRange])
      summarySheet.addRow(['Region:', selectedRegionName])
      summarySheet.addRow(['Salesman Filter:', selectedSalesmanName])
      summarySheet.addRow(['Route Filter:', selectedRouteName])
      summarySheet.addRow([])

      // Key Metrics
      const metricsHeader = summarySheet.addRow(['KEY METRICS', ''])
      metricsHeader.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
      metricsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }
      metricsHeader.height = 25

      summarySheet.addRow(['Total Transactions', formatNumber(transactions.length)])
      summarySheet.addRow(['Total Quantity Returned', formatNumber(totalQty) + ' units'])
      summarySheet.addRow(['Total Return Value', formatCurrency(totalValue, currency)])
      summarySheet.addRow(['Average Return per Transaction', formatCurrency(totalValue / transactions.length, currency)])
      summarySheet.addRow(['Unique Salesmen', formatNumber(uniqueSalesmen)])
      summarySheet.addRow(['Unique Customers', formatNumber(uniqueCustomers)])
      summarySheet.addRow(['Unique Products', formatNumber(uniqueProducts)])

      // Add note
      summarySheet.addRow([])
      const noteRow = summarySheet.addRow(['NOTE: Good returns are sellable products that can be restocked and resold.'])
      noteRow.font = { italic: true, color: { argb: 'FF059669' } }
      noteRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
      summarySheet.mergeCells(`A${noteRow.number}:B${noteRow.number}`)

      // ===== SHEET 2: DETAILED TRANSACTIONS =====
      const detailSheet = workbook.addWorksheet('Good Returns Transactions')
      detailSheet.columns = [
        { header: 'Transaction Code', key: 'trx_code', width: 18 },
        { header: 'Date', key: 'trx_date', width: 14 },
        { header: 'Salesman Code', key: 'salesman_code', width: 14 },
        { header: 'Salesman Name', key: 'salesman_name', width: 25 },
        { header: 'Route Code', key: 'route_code', width: 12 },
        { header: 'Customer Code', key: 'customer_code', width: 14 },
        { header: 'Customer Name', key: 'customer_name', width: 30 },
        { header: 'Product Code', key: 'product_code', width: 14 },
        { header: 'Product Name', key: 'product_name', width: 35 },
        { header: 'Category', key: 'category_name', width: 20 },
        { header: 'Brand', key: 'brand', width: 20 },
        { header: 'Return Reason', key: 'return_reason', width: 30 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: `Value (${currency})`, key: 'return_value', width: 15 }
      ]

      // Style header row
      const headerRow = detailSheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
      headerRow.height = 25

      // Add data
      transactions.forEach((row: any) => {
        detailSheet.addRow({
          trx_code: row.trx_code || '',
          trx_date: row.trx_date || '',
          salesman_code: row.salesman_code || '',
          salesman_name: row.salesman_name || '',
          route_code: row.route_code || '',
          customer_code: row.customer_code || '',
          customer_name: row.customer_name || '',
          product_code: row.product_code || '',
          product_name: row.product_name || '',
          category_name: row.category_name || '',
          brand: row.brand || '',
          return_reason: row.return_reason || 'No Reason Specified',
          quantity: Number(row.quantity) || 0,
          return_value: Number(row.return_value) || 0
        })
      })

      // Format number columns
      detailSheet.getColumn('quantity').numFmt = '#,##0'
      detailSheet.getColumn('return_value').numFmt = '#,##0.00'

      // Add borders to all cells
      detailSheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
          }
        })
      })

      // Generate file
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Good_Returns_Sellable_${dateRange}_${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)

      console.log('Good Returns Excel export completed successfully!')

    } catch (error) {
      console.error('Error exporting Good Returns to Excel:', error)
      alert(`Failed to export Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Excel export for Bad Returns (Wastage)
  const exportBadReturnsToExcel = async () => {
    try {
      if (!data?.badReturnsDetail?.data || data.badReturnsDetail.data.length === 0) {
        alert('No bad returns data available to export.')
        return
      }

      const currency = getCurrency()
      const workbook = new ExcelJS.Workbook()
      const transactions = data.badReturnsDetail.data

      // Calculate summary metrics
      const totalQty = transactions.reduce((sum: number, row: any) => sum + (Number(row.quantity) || 0), 0)
      const totalValue = transactions.reduce((sum: number, row: any) => sum + (Number(row.return_value) || 0), 0)
      const uniqueSalesmen = new Set(transactions.map((r: any) => r.salesman_code)).size
      const uniqueCustomers = new Set(transactions.map((r: any) => r.customer_code)).size
      const uniqueProducts = new Set(transactions.map((r: any) => r.product_code)).size

      // ===== SHEET 1: SUMMARY =====
      const summarySheet = workbook.addWorksheet('Summary')
      summarySheet.columns = [
        { key: 'metric', width: 40 },
        { key: 'value', width: 25 }
      ]

      // Title
      const titleRow = summarySheet.addRow(['BAD RETURNS (WASTAGE) - SUMMARY REPORT'])
      titleRow.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
      titleRow.alignment = { horizontal: 'center' }
      titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } }
      titleRow.height = 35
      summarySheet.mergeCells('A1:B1')

      // Filter info
      const dateRangeLabels: { [key: string]: string } = {
        'today': 'Today', 'yesterday': 'Yesterday', 'thisWeek': 'This Week',
        'thisMonth': 'This Month', 'lastMonth': 'Last Month', 'thisQuarter': 'This Quarter',
        'lastQuarter': 'Last Quarter', 'thisYear': 'This Year'
      }
      const selectedSalesmanName = selectedSalesman === 'all' ? 'All Salesmen' :
        filters.salesmen.find((s: any) => s.code === selectedSalesman)?.name || selectedSalesman
      const selectedRouteName = selectedRoute === 'all' ? 'All Routes' :
        filters.routes.find((r: any) => r.code === selectedRoute)?.name || selectedRoute
      const selectedRegionName = getRegionName(selectedRegion)

      summarySheet.addRow(['Generated:', new Date().toLocaleString()])
      summarySheet.addRow(['Date Range:', dateRangeLabels[dateRange] || dateRange])
      summarySheet.addRow(['Region:', selectedRegionName])
      summarySheet.addRow(['Salesman Filter:', selectedSalesmanName])
      summarySheet.addRow(['Route Filter:', selectedRouteName])
      summarySheet.addRow([])

      // Key Metrics
      const metricsHeader = summarySheet.addRow(['KEY METRICS', ''])
      metricsHeader.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
      metricsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } }
      metricsHeader.height = 25

      summarySheet.addRow(['Total Transactions', formatNumber(transactions.length)])
      summarySheet.addRow(['Total Quantity Wasted', formatNumber(totalQty) + ' units'])
      summarySheet.addRow(['Total Wastage Value', formatCurrency(totalValue, currency)])
      summarySheet.addRow(['Average Wastage per Transaction', formatCurrency(totalValue / transactions.length, currency)])
      summarySheet.addRow(['Unique Salesmen', formatNumber(uniqueSalesmen)])
      summarySheet.addRow(['Unique Customers', formatNumber(uniqueCustomers)])
      summarySheet.addRow(['Unique Products', formatNumber(uniqueProducts)])

      // Add note
      summarySheet.addRow([])
      const noteRow = summarySheet.addRow(['WARNING: Bad returns are damaged/expired products that cannot be resold. This represents direct loss.'])
      noteRow.font = { italic: true, bold: true, color: { argb: 'FFDC2626' } }
      noteRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } }
      summarySheet.mergeCells(`A${noteRow.number}:B${noteRow.number}`)

      // ===== SHEET 2: DETAILED TRANSACTIONS =====
      const detailSheet = workbook.addWorksheet('Bad Returns Transactions')
      detailSheet.columns = [
        { header: 'Transaction Code', key: 'trx_code', width: 18 },
        { header: 'Date', key: 'trx_date', width: 14 },
        { header: 'Salesman Code', key: 'salesman_code', width: 14 },
        { header: 'Salesman Name', key: 'salesman_name', width: 25 },
        { header: 'Route Code', key: 'route_code', width: 12 },
        { header: 'Customer Code', key: 'customer_code', width: 14 },
        { header: 'Customer Name', key: 'customer_name', width: 30 },
        { header: 'Product Code', key: 'product_code', width: 14 },
        { header: 'Product Name', key: 'product_name', width: 35 },
        { header: 'Category', key: 'category_name', width: 20 },
        { header: 'Brand', key: 'brand', width: 20 },
        { header: 'Return Reason', key: 'return_reason', width: 30 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: `Value (${currency})`, key: 'return_value', width: 15 }
      ]

      // Style header row
      const headerRow = detailSheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } }
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
      headerRow.height = 25

      // Add data
      transactions.forEach((row: any) => {
        detailSheet.addRow({
          trx_code: row.trx_code || '',
          trx_date: row.trx_date || '',
          salesman_code: row.salesman_code || '',
          salesman_name: row.salesman_name || '',
          route_code: row.route_code || '',
          customer_code: row.customer_code || '',
          customer_name: row.customer_name || '',
          product_code: row.product_code || '',
          product_name: row.product_name || '',
          category_name: row.category_name || '',
          brand: row.brand || '',
          return_reason: row.return_reason || 'No Reason Specified',
          quantity: Number(row.quantity) || 0,
          return_value: Number(row.return_value) || 0
        })
      })

      // Format number columns
      detailSheet.getColumn('quantity').numFmt = '#,##0'
      detailSheet.getColumn('return_value').numFmt = '#,##0.00'

      // Add borders to all cells
      detailSheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
          }
        })
      })

      // Generate file
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Bad_Returns_Wastage_${dateRange}_${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)

      console.log('Bad Returns Excel export completed successfully!')

    } catch (error) {
      console.error('Error exporting Bad Returns to Excel:', error)
      alert(`Failed to export Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const tabs = [
    { id: 'return-reasons', label: 'Return Reasons', icon: FileText },
    { id: 'mtd-returns', label: 'Period Returns', icon: PackageX },
    { id: 'good-bad-details', label: 'Good/Bad Returns Details', icon: ListFilter }
  ]

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 max-md:p-4 max-sm:p-3">
      {/* Header */}
      <div className="mb-6 max-md:mb-4">
        <div className="flex items-center justify-between gap-4 mb-6 max-md:flex-col max-md:items-start max-md:gap-3 max-md:mb-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2 max-md:text-2xl max-sm:text-xl">
              <AlertTriangle className="w-7 h-7 text-orange-600 max-sm:w-6 max-sm:h-6" />
              Returns & Wastage
            </h1>
            <p className="text-base text-slate-600 mt-1 max-sm:text-sm">Track product returns and potential wastage</p>
          </div>

          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-orange-600 hover:bg-orange-700 text-white max-md:w-full"
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-white p-3 md:p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Filters</h3>
            {loading && (
              <div className="flex items-center gap-2 text-xs text-blue-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Loading data...</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {/* Date Range */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Date Range</label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today" disabled>Today</SelectItem>
                  <SelectItem value="yesterday" disabled>Yesterday</SelectItem>
                  <SelectItem value="last7Days">Last 7 Days</SelectItem>
                  <SelectItem value="last30Days">Last 30 Days</SelectItem>
                  <SelectItem value="thisMonth" disabled>This Month</SelectItem>
                  <SelectItem value="lastMonth">Last Month</SelectItem>
                  <SelectItem value="thisQuarter">This Quarter</SelectItem>
                  <SelectItem value="thisYear" disabled>This Year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* AREA */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                AREA <span className="text-xs text-slate-500 font-normal">(Available: {filters.areas.length})</span>
              </label>
              <Select value={areaCode || 'all'} onValueChange={(value) => setAreaCode(value === 'all' ? null : value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Areas" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="all">All Areas</SelectItem>
                  {filters.areas.map((a: any, idx: number) => (
                    <SelectItem key={`area-${a.value}-${idx}`} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sub AREA */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Sub AREA <span className="text-xs text-slate-500 font-normal">(Available: {filters.subAreas.length})</span>
              </label>
              <Select value={subAreaCode || 'all'} onValueChange={(value) => setSubAreaCode(value === 'all' ? null : value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Sub Areas" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="all">All Sub Areas</SelectItem>
                  {filters.subAreas.map((s: any, idx: number) => (
                    <SelectItem key={`subarea-${s.value}-${idx}`} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Team Leader */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Team Leader <span className="text-xs text-slate-500 font-normal">(Available: {filters.teamLeaders.length})</span>
              </label>
              <Select value={teamLeaderCode || 'all'} onValueChange={(value) => setTeamLeaderCode(value === 'all' ? null : value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Team Leaders" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="all">All Team Leaders</SelectItem>
                  {filters.teamLeaders.map((t: any, idx: number) => (
                    <SelectItem key={`tl-${t.value}-${idx}`} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Field User Role */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Field User Role <span className="text-xs text-slate-500 font-normal">(Available: {filters.fieldUserRoles.length})</span>
              </label>
              <Select value={fieldUserRole || 'all'} onValueChange={(value) => setFieldUserRole(value === 'all' ? null : value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="all">All Roles</SelectItem>
                  {filters.fieldUserRoles.map((r: any, idx: number) => (
                    <SelectItem key={`role-${r.value}-${idx}`} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Field User */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Field User <span className="text-xs text-slate-500 font-normal">(Available: {filters.fieldUsers.length})</span>
              </label>
              <Select value={fieldUser || 'all'} onValueChange={(value) => setFieldUser(value === 'all' ? null : value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Field Users" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="all">All Field Users</SelectItem>
                  {filters.fieldUsers.map((u: any, idx: number) => (
                    <SelectItem key={`user-${u.value}-${idx}`} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Route */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Route <span className="text-xs text-slate-500 font-normal">(Available: {filters.routes.length})</span>
              </label>
              <Select value={routeCode || 'all'} onValueChange={(value) => setRouteCode(value === 'all' ? null : value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Routes" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  <SelectItem value="all">All Routes</SelectItem>
                  {filters.routes.map((r: any, idx: number) => (
                    <SelectItem key={`route-${r.value}-${idx}`} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex gap-3 flex-wrap w-full h-auto bg-white p-4 rounded-lg shadow-sm mb-6 max-md:grid max-md:grid-cols-2 max-md:gap-3 max-md:mb-4 max-sm:gap-2 max-sm:p-3">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-3 py-4 px-8 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 font-semibold transition-all text-lg whitespace-nowrap max-md:flex-col max-md:py-5 max-md:px-4 max-md:min-h-[90px] max-md:text-sm max-sm:py-4 max-sm:px-2 max-sm:min-h-[80px] max-sm:text-xs"
              >
                <Icon className="w-7 h-7 max-md:mb-1 max-sm:w-6 max-sm:h-6" />
                <span className="max-md:text-center max-md:leading-tight">{tab.label}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {/* Return Reasons Analysis - NEW FIRST TAB */}
        <TabsContent value="return-reasons">
          <div className="space-y-6 max-md:space-y-4">
            {/* Consolidated Summary Cards */}
            <TooltipProvider>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Good Returns Card */}
              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-500 text-white">GOOD</Badge>
                      Sellable Returns
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="space-y-2 text-xs">
                          <p className="font-semibold">GOOD Returns (Sellable)</p>
                          <p><strong>What it means:</strong> Products returned in sellable condition (collection_type = 1). These can be restocked and resold.</p>
                          <p><strong>Calculation:</strong></p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>Count: {formatNumber(data?.returnReasons?.summary?.good_return_count || 0)} return transactions where collection_type = 1</li>
                            <li>Value: Sum of all GOOD return amounts = {formatValue(data?.returnReasons?.summary?.good_return_value || 0)}</li>
                            <li>Percentage: {formatNumber(data?.returnReasons?.summary?.good_return_count || 0)} ÷ {formatNumber(data?.returnReasons?.summary?.total_return_count || 1)} × 100 = {((parseFloat(data?.returnReasons?.summary?.good_return_count || 0) / parseFloat(data?.returnReasons?.summary?.total_return_count || 1)) * 100).toFixed(1)}%</li>
                          </ul>
                          <p><strong>Measured by:</strong> Transaction COUNT (not money value)</p>
                          <p className="text-green-600">✓ No financial loss - can be resold</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-3xl font-bold text-green-600 max-sm:text-2xl">
                      {formatNumber(data?.returnReasons?.summary?.good_return_count || 0)}
                    </div>
                    <p className="text-xs text-slate-500">return transactions</p>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-lg font-semibold text-slate-700">
                      {formatValue(data?.returnReasons?.summary?.good_return_value || 0)}
                    </div>
                    <p className="text-xs text-slate-500">total value</p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      {((parseFloat(data?.returnReasons?.summary?.good_return_count || 0) /
                         parseFloat(data?.returnReasons?.summary?.total_return_count || 1)) * 100).toFixed(1)}% of all returns
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Bad Returns Card */}
              <Card className="border-l-4 border-l-orange-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-orange-500 text-white">BAD</Badge>
                      Damaged/Expired
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="space-y-2 text-xs">
                          <p className="font-semibold">BAD Returns (Wastage)</p>
                          <p><strong>What it means:</strong> Products returned damaged, expired, or unsellable (collection_type = 0). These result in financial loss.</p>
                          <p><strong>Calculation:</strong></p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>Count: {formatNumber(data?.returnReasons?.summary?.bad_return_count || 0)} return transactions where collection_type = 0</li>
                            <li>Wastage Value: Sum of all BAD return amounts = {formatValue(data?.returnReasons?.summary?.bad_return_value || 0)}</li>
                            <li>Percentage by COUNT: {formatNumber(data?.returnReasons?.summary?.bad_return_count || 0)} ÷ {formatNumber(data?.returnReasons?.summary?.total_return_count || 1)} × 100 = {((parseFloat(data?.returnReasons?.summary?.bad_return_count || 0) / parseFloat(data?.returnReasons?.summary?.total_return_count || 1)) * 100).toFixed(1)}%</li>
                            <li>Percentage by VALUE: {formatValue(data?.returnReasons?.summary?.bad_return_value || 0)} ÷ {formatValue(data?.returnReasons?.summary?.total_return_value || 0)} × 100 = {((parseFloat(data?.returnReasons?.summary?.bad_return_value || 0) / parseFloat(data?.returnReasons?.summary?.total_return_value || 1)) * 100).toFixed(1)}%</li>
                          </ul>
                          <p><strong>Measured by:</strong> Transaction COUNT ({((parseFloat(data?.returnReasons?.summary?.bad_return_count || 0) / parseFloat(data?.returnReasons?.summary?.total_return_count || 1)) * 100).toFixed(1)}%), but wastage VALUE is {((parseFloat(data?.returnReasons?.summary?.bad_return_value || 0) / parseFloat(data?.returnReasons?.summary?.total_return_value || 1)) * 100).toFixed(1)}%</p>
                          <p className="text-orange-600">⚠ Direct financial loss - cannot be resold</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-3xl font-bold text-orange-600 max-sm:text-2xl">
                      {formatNumber(data?.returnReasons?.summary?.bad_return_count || 0)}
                    </div>
                    <p className="text-xs text-slate-500">return transactions</p>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-lg font-semibold text-slate-700">
                      {formatValue(data?.returnReasons?.summary?.bad_return_value || 0)}
                    </div>
                    <p className="text-xs text-slate-500">wastage value</p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      {((parseFloat(data?.returnReasons?.summary?.bad_return_count || 0) /
                         parseFloat(data?.returnReasons?.summary?.total_return_count || 1)) * 100).toFixed(1)}% of all returns
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Total Returns Card */}
              <Card className="border-l-4 border-l-indigo-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-indigo-500 text-white">TOTAL</Badge>
                      All Returns
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="space-y-2 text-xs">
                          <p className="font-semibold">Total Returns Summary</p>
                          <p><strong>What it means:</strong> All products returned regardless of condition (trx_type = 4). Includes both GOOD and BAD returns.</p>
                          <p><strong>Calculation:</strong></p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>Total Count: {formatNumber(data?.returnReasons?.summary?.good_return_count || 0)} (GOOD) + {formatNumber(data?.returnReasons?.summary?.bad_return_count || 0)} (BAD) = {formatNumber(data?.returnReasons?.summary?.total_return_count || 0)}</li>
                            <li>Total Value: {formatValue(data?.returnReasons?.summary?.good_return_value || 0)} + {formatValue(data?.returnReasons?.summary?.bad_return_value || 0)} = {formatValue(data?.returnReasons?.summary?.total_return_value || 0)}</li>
                            <li>Wastage Impact: {formatValue(data?.returnReasons?.summary?.bad_return_value || 0)} ÷ {formatValue(data?.returnReasons?.summary?.total_return_value || 0)} × 100 = {((parseFloat(data?.returnReasons?.summary?.bad_return_value || 0) / parseFloat(data?.returnReasons?.summary?.total_return_value || 1)) * 100).toFixed(1)}%</li>
                          </ul>
                          <p><strong>Wastage Impact explained:</strong> Of all return value, {((parseFloat(data?.returnReasons?.summary?.bad_return_value || 0) / parseFloat(data?.returnReasons?.summary?.total_return_value || 1)) * 100).toFixed(1)}% is direct financial loss (BAD returns that cannot be resold).</p>
                          <p className="text-indigo-600">ℹ This is the complete picture of all returns</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-3xl font-bold text-indigo-600 max-sm:text-2xl">
                      {formatNumber(data?.returnReasons?.summary?.total_return_count || 0)}
                    </div>
                    <p className="text-xs text-slate-500">return transactions</p>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-lg font-semibold text-slate-700">
                      {formatValue(data?.returnReasons?.summary?.total_return_value || 0)}
                    </div>
                    <p className="text-xs text-slate-500">total return value</p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-orange-600 font-medium">
                      Wastage: {((parseFloat(data?.returnReasons?.summary?.bad_return_value || 0) /
                         parseFloat(data?.returnReasons?.summary?.total_return_value || 1)) * 100).toFixed(1)}%
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
            </TooltipProvider>

            {/* Charts Row */}
            <TooltipProvider>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Pie Chart - Good vs Bad */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold max-sm:text-base">Good vs Bad Returns</CardTitle>
                      <p className="text-xs text-slate-500 mt-1">By transaction count (not by value)</p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-5 w-5 text-slate-400 cursor-help flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="space-y-2 text-xs">
                          <p className="font-semibold">Pie Chart: Good vs Bad Returns</p>
                          <p><strong>What it shows:</strong> Distribution of return TRANSACTIONS by count (not money value).</p>
                          <p><strong>Data displayed:</strong></p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>Good Returns: {formatNumber(data?.returnReasons?.summary?.good_return_count || 0)} transactions ({((parseFloat(data?.returnReasons?.summary?.good_return_count || 0) / parseFloat(data?.returnReasons?.summary?.total_return_count || 1)) * 100).toFixed(1)}%)</li>
                            <li>Bad Returns: {formatNumber(data?.returnReasons?.summary?.bad_return_count || 0)} transactions ({((parseFloat(data?.returnReasons?.summary?.bad_return_count || 0) / parseFloat(data?.returnReasons?.summary?.total_return_count || 1)) * 100).toFixed(1)}%)</li>
                          </ul>
                          <p><strong>Note:</strong> If you measured by VALUE instead of COUNT, it would be {((parseFloat(data?.returnReasons?.summary?.good_return_value || 0) / parseFloat(data?.returnReasons?.summary?.total_return_value || 1)) * 100).toFixed(1)}% Good and {((parseFloat(data?.returnReasons?.summary?.bad_return_value || 0) / parseFloat(data?.returnReasons?.summary?.total_return_value || 1)) * 100).toFixed(1)}% Bad.</p>
                          <p className="text-blue-600">ℹ This chart matches the percentage in the cards above</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
                    <PieChart>
                      <Pie
                        data={[
                          {
                            name: 'Good Returns',
                            value: parseFloat(data?.returnReasons?.summary?.good_return_count || 0),
                            amount: parseFloat(data?.returnReasons?.summary?.good_return_value || 0),
                            fill: '#10b981'
                          },
                          {
                            name: 'Bad Returns',
                            value: parseFloat(data?.returnReasons?.summary?.bad_return_count || 0),
                            amount: parseFloat(data?.returnReasons?.summary?.bad_return_value || 0),
                            fill: '#f97316'
                          }
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name.split(' ')[0]}: ${(percent * 100).toFixed(1)}%`}
                        outerRadius={isMobile ? 80 : 100}
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#f97316" />
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: any, name: any, props: any) => {
                          const count = props.payload.value
                          const amount = props.payload.amount
                          const total = parseFloat(data?.returnReasons?.summary?.total_return_count || 1)
                          const percentage = ((count / total) * 100).toFixed(1)
                          return [
                            <div key="tooltip" className="space-y-1">
                              <div><strong>Count:</strong> {formatNumber(count)} transactions ({percentage}%)</div>
                              <div><strong>Value:</strong> {formatValue(amount)}</div>
                              <div className="text-xs text-slate-500 mt-1">
                                Avg: {formatValue(amount / count)} per transaction
                              </div>
                            </div>,
                            name
                          ]
                        }}
                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', padding: '8px 12px' }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: isMobile ? '11px' : '13px' }}
                        formatter={(value: any, entry: any) => {
                          const count = entry.payload.value
                          const amount = entry.payload.amount
                          const total = parseFloat(data?.returnReasons?.summary?.total_return_count || 1)
                          const percentage = ((count / total) * 100).toFixed(1)
                          return `${value}: ${percentage}% (${formatNumber(count)} txns, ${formatValue(amount)})`
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Bar Chart - Return Reasons Comparison */}
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-bold text-slate-800 max-sm:text-lg">Top 5 Brands by Returns</CardTitle>
                      <p className="text-sm text-slate-600 mt-1.5">Breakdown of good vs bad returns by brand</p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-5 w-5 text-slate-400 cursor-help flex-shrink-0 hover:text-slate-600 transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-slate-900 text-white border-slate-700">
                        <div className="space-y-2 text-xs">
                          <p className="font-semibold text-sm">Top Brands by Returns</p>
                          <p><strong>What it shows:</strong> The 5 brands with highest total return values.</p>
                          <p><strong>Chart breakdown:</strong></p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li><span className="text-emerald-400 font-semibold">Green section</span>: Good returns (sellable items)</li>
                            <li><span className="text-rose-400 font-semibold">Red section</span>: Bad returns (wastage/damaged)</li>
                          </ul>
                          <p className="text-emerald-300">💡 Helps identify brands with quality issues vs. overstocking problems</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <ResponsiveContainer width="100%" height={isMobile ? 280 : 340}>
                    <BarChart
                      data={(data?.returnReasons?.byBrand || [])
                        .slice(0, 5)
                        .map((b: any, idx: number) => ({
                          brandName: b.brand_name && b.brand_name.length > 12
                            ? b.brand_name.substring(0, 12) + '...'
                            : b.brand_name || 'Unknown',
                          fullBrandName: b.brand_name || 'Unknown',
                          goodReturnValue: Number(b.good_return_value) || 0,
                          goodReturnQty: Number(b.good_return_qty) || 0,
                          goodReturnCount: Number(b.good_return_count) || 0,
                          badReturnValue: Number(b.bad_return_value) || 0,
                          badReturnQty: Number(b.bad_return_qty) || 0,
                          badReturnCount: Number(b.bad_return_count) || 0,
                          totalReturnValue: Number(b.total_return_value) || 0,
                          rank: idx + 1
                        }))}
                      margin={{ top: 10, right: 20, left: 20, bottom: 60 }}
                      barSize={isMobile ? 40 : 60}
                    >
                      <defs>
                        <linearGradient id="goodReturnGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={1} />
                        </linearGradient>
                        <linearGradient id="badReturnGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#ea580c" stopOpacity={1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="brandName"
                        tick={{
                          fill: '#475569',
                          fontSize: isMobile ? 11 : 13,
                          fontWeight: 600
                        }}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }}
                        height={60}
                        label={{
                          value: 'Brand',
                          position: 'insideBottom',
                          offset: -5,
                          style: {
                            fill: '#1f2937',
                            fontWeight: 700,
                            fontSize: isMobile ? 12 : 13
                          }
                        }}
                      />
                      <YAxis
                        tick={{
                          fill: '#64748b',
                          fontSize: isMobile ? 10 : 12,
                          fontWeight: 500
                        }}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
                        label={{
                          value: 'Return Value (AED)',
                          angle: -90,
                          position: 'insideLeft',
                          offset: -5,
                          style: {
                            fill: '#1f2937',
                            fontWeight: 700,
                            fontSize: isMobile ? 11 : 12,
                            textAnchor: 'middle'
                          }
                        }}
                      />
                      <RechartsTooltip
                        cursor={{ fill: '#f1f5f9', opacity: 0.3 }}
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload[0]) return null
                          const data = payload[0].payload
                          return (
                            <div className="bg-white border-2 border-slate-200 rounded-lg shadow-lg p-4 min-w-[260px]">
                              <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-slate-100">
                                <div className="font-bold text-slate-800 text-base">{data.fullBrandName}</div>
                                <div className="bg-slate-800 text-white text-xs font-bold px-2 py-0.5 rounded">#{data.rank}</div>
                              </div>

                              <div className="space-y-2.5">
                                <div className="bg-emerald-50 rounded-md p-2.5 border border-emerald-200">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                                    <div className="font-semibold text-emerald-700 text-sm">Good Returns</div>
                                  </div>
                                  <div className="ml-5 space-y-0.5 text-xs text-slate-700">
                                    <div className="flex justify-between">
                                      <span>Value:</span>
                                      <span className="font-semibold">{formatValue(data.goodReturnValue)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Quantity:</span>
                                      <span className="font-medium">{formatNumber(data.goodReturnQty)} units</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Orders:</span>
                                      <span className="font-medium">{formatNumber(data.goodReturnCount)}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-rose-50 rounded-md p-2.5 border border-rose-200">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                                    <div className="font-semibold text-rose-700 text-sm">Bad Returns</div>
                                  </div>
                                  <div className="ml-5 space-y-0.5 text-xs text-slate-700">
                                    <div className="flex justify-between">
                                      <span>Value:</span>
                                      <span className="font-semibold">{formatValue(data.badReturnValue)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Quantity:</span>
                                      <span className="font-medium">{formatNumber(data.badReturnQty)} units</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Orders:</span>
                                      <span className="font-medium">{formatNumber(data.badReturnCount)}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-slate-100 rounded-md p-2 border border-slate-300">
                                  <div className="flex justify-between items-center">
                                    <span className="font-bold text-slate-700 text-sm">Total Returns:</span>
                                    <span className="font-bold text-slate-900 text-base">{formatValue(data.totalReturnValue)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={40}
                        content={() => (
                          <div className="flex items-center justify-center gap-6 mt-4 pb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded bg-gradient-to-b from-emerald-500 to-emerald-600"></div>
                              <span className="text-sm font-semibold text-slate-700">Good Returns</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded bg-gradient-to-b from-orange-500 to-orange-600"></div>
                              <span className="text-sm font-semibold text-slate-700">Bad Returns</span>
                            </div>
                          </div>
                        )}
                      />
                      <Bar
                        dataKey="goodReturnValue"
                        stackId="a"
                        fill="url(#goodReturnGradient)"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="badReturnValue"
                        stackId="a"
                        fill="url(#badReturnGradient)"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
            </TooltipProvider>

            {/* Top Products by Return Reason */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold max-sm:text-base">Top 20 Returned Products by Reason</CardTitle>
                    <p className="text-xs text-slate-500 mt-1">Highest value returns with categorization</p>
                  </div>
                  <Button
                    onClick={exportToExcel}
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-2 hover:bg-green-50 hover:border-green-500"
                  >
                    <Download className="h-4 w-4" />
                    <span className="max-sm:hidden">Export Excel</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-20 shadow-md border-b-2 border-gray-300">
                      <TableRow>
                        <TableHead className="min-w-[50px] text-center bg-white">Rank</TableHead>
                        <TableHead className="min-w-[100px] bg-white">Category</TableHead>
                        <TableHead className="min-w-[200px] bg-white">Product</TableHead>
                        <TableHead className="min-w-[150px] bg-white">Reason</TableHead>
                        <TableHead className="text-right min-w-[100px] bg-white">Quantity</TableHead>
                        <TableHead className="text-right min-w-[120px] bg-white">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                      <TableBody>
                        {data?.returnReasons?.byProduct?.map((item: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="text-center">
                              <Badge
                                variant={idx < 3 ? "default" : "outline"}
                                className={`text-xs font-bold ${idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-600' : ''}`}
                              >
                                {idx + 1}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={item.return_category === 'GOOD'
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : 'bg-orange-50 text-orange-700 border-orange-200'
                                }
                              >
                                {item.return_category}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-sm max-sm:text-xs">{item.product_name}</div>
                              <div className="text-xs text-slate-500">{item.product_code}</div>
                            </TableCell>
                            <TableCell className="text-sm max-sm:text-xs">{item.reason}</TableCell>
                            <TableCell className="text-right text-sm max-sm:text-xs">{formatNumber(item.return_qty)}</TableCell>
                            <TableCell className={`text-right font-medium text-sm max-sm:text-xs ${item.return_category === 'GOOD' ? 'text-green-600' : 'text-orange-600'}`}>
                              {formatValue(item.return_value)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Period Returns Summary */}
        <TabsContent value="mtd-returns">
          <div className="space-y-6 max-md:space-y-4">
            {/* Export Button Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 max-sm:text-base">Period Returns Analysis</h3>
                <p className="text-xs text-slate-500 mt-1">Comprehensive breakdown with Good vs Bad returns</p>
              </div>
              <Button
                onClick={exportPeriodReturnsToExcel}
                size="sm"
                variant="outline"
                className="flex items-center gap-2 hover:bg-blue-50 hover:border-blue-500"
              >
                <Download className="h-4 w-4" />
                <span className="max-sm:hidden">Export Excel</span>
              </Button>
            </div>

            {/* Consolidated Period Summary Cards */}
            <TooltipProvider>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Total Sales Card */}
              <Card className="border-l-4 border-l-emerald-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-500 text-white">SALES</Badge>
                      Total Sales
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="space-y-2 text-xs">
                          <p className="font-semibold">Total Sales (Gross)</p>
                          <p><strong>What it means:</strong> All sales transactions before deducting returns (trx_type = 1).</p>
                          <p><strong>Calculation:</strong></p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>Sales Value: Sum of all sale amounts = {formatValue(data?.periodReturns?.summary?.sale_value || 0)}</li>
                            <li>Order Count: Total number of sale orders = {formatNumber(data?.periodReturns?.summary?.sale_count || 0)}</li>
                          </ul>
                          <p><strong>Important:</strong> This is GROSS sales. To get actual revenue, use NET Sales (Gross Sales - Returns).</p>
                          <p className="text-emerald-600">ℹ Starting point before returns impact</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-3xl font-bold text-emerald-600 max-sm:text-2xl">
                      {formatValue(data?.periodReturns?.summary?.sale_value || 0)}
                    </div>
                    <p className="text-xs text-slate-500">gross sales value</p>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-lg font-semibold text-slate-700">
                      {formatNumber(data?.periodReturns?.summary?.sale_count || 0)}
                    </div>
                    <p className="text-xs text-slate-500">total orders</p>
                  </div>
                  <div className="text-xs text-slate-500">
                    Before returns deduction
                  </div>
                </CardContent>
              </Card>

              {/* Total Returns Card with Good/Bad Breakdown */}
              <Card className="border-l-4 border-l-orange-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-orange-500 text-white">RETURNS</Badge>
                      Total Returns
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="space-y-2 text-xs">
                          <p className="font-semibold">Total Returns with Breakdown</p>
                          <p><strong>What it means:</strong> All products returned (trx_type = 4), split into GOOD (sellable) and BAD (wastage).</p>
                          <p><strong>Calculation:</strong></p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>Total Returns: {formatValue(data?.periodReturns?.summary?.good_return_value || 0)} (GOOD) + {formatValue(data?.periodReturns?.summary?.bad_return_value || 0)} (BAD) = {formatValue(data?.periodReturns?.summary?.return_value || 0)}</li>
                            <li>Return Orders: {formatNumber(data?.periodReturns?.summary?.return_count || 0)} transactions</li>
                            <li>Return %: {formatValue(data?.periodReturns?.summary?.return_value || 0)} ÷ {formatValue(data?.periodReturns?.summary?.sale_value || 0)} × 100 = {data?.periodReturns?.summary?.return_percentage || 0}%</li>
                          </ul>
                          <p><strong>GOOD Returns:</strong> Can be restocked (collection_type = 1)</p>
                          <p><strong>BAD Returns:</strong> Direct loss - damaged/expired (collection_type = 0)</p>
                          <p className="text-orange-600">⚠ Reduces gross sales to get net revenue</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-3xl font-bold text-orange-600 max-sm:text-2xl">
                      {formatValue(data?.periodReturns?.summary?.return_value || 0)}
                    </div>
                    <p className="text-xs text-slate-500">return value</p>
                  </div>
                  <div className="pt-2 border-t space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-600">Good:</span>
                      <span className="font-semibold">{formatValue(data?.periodReturns?.summary?.good_return_value || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-orange-600">Bad:</span>
                      <span className="font-semibold">{formatValue(data?.periodReturns?.summary?.bad_return_value || 0)}</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatNumber(data?.periodReturns?.summary?.return_count || 0)} return orders • {(data?.periodReturns?.summary?.return_percentage || 0).toFixed(2)}% of sales
                  </div>
                </CardContent>
              </Card>

              {/* Net Sales Card */}
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-500 text-white">NET</Badge>
                      Net Sales
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="space-y-2 text-xs">
                          <p className="font-semibold">Net Sales (Actual Revenue)</p>
                          <p><strong>What it means:</strong> Final revenue after deducting all returns. This is your ACTUAL sales performance.</p>
                          <p><strong>Calculation:</strong></p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>Net Sales Value: {formatValue(data?.periodReturns?.summary?.sale_value || 0)} (Gross Sales) - {formatValue(data?.periodReturns?.summary?.return_value || 0)} (Returns) = {formatValue(data?.periodReturns?.summary?.net_sales_value || 0)}</li>
                            <li>Net Orders: {formatNumber(data?.periodReturns?.summary?.sale_count || 0)} (Total Orders) - {formatNumber(data?.periodReturns?.summary?.return_count || 0)} (Return Orders) = {formatNumber(data?.periodReturns?.summary?.net_order_count || 0)}</li>
                          </ul>
                          <p><strong>Products Affected:</strong> {formatNumber(data?.periodReturns?.summary?.products_affected || 0)} unique products had at least one return</p>
                          <p><strong>Use this for:</strong> Financial reporting, revenue targets, performance evaluation</p>
                          <p className="text-blue-600">✓ This is your real business performance</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-3xl font-bold text-blue-600 max-sm:text-2xl">
                      {formatValue(data?.periodReturns?.summary?.net_sales_value || 0)}
                    </div>
                    <p className="text-xs text-slate-500">after returns</p>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-lg font-semibold text-slate-700">
                      {formatNumber(data?.periodReturns?.summary?.net_order_count || 0)}
                    </div>
                    <p className="text-xs text-slate-500">net orders</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            </TooltipProvider>

            {/* Daily Return Trend with Good/Bad Breakdown */}
            <TooltipProvider>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold max-sm:text-base">Daily Return Trend - Good vs Bad</CardTitle>
                    <p className="text-xs text-slate-500 mt-1">Stacked view showing sellable vs wastage returns</p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="ml-2 p-1 hover:bg-slate-100 rounded-full transition-colors">
                        <HelpCircle className="h-4 w-4 text-slate-400" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <div className="space-y-2 text-xs">
                        <p><strong>Daily Return Trend Explained:</strong></p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li><strong className="text-green-600">Good Returns (Green):</strong> Sellable products that can be resold - minimal financial loss</li>
                          <li><strong className="text-orange-600">Bad Returns (Red):</strong> Expired/damaged items - direct wastage and financial loss</li>
                          <li><strong className="text-purple-600">Total Value Line (Purple):</strong> Combined return value in {getCurrency()} for the day</li>
                        </ul>
                        <p><strong>Why Stacked?</strong> Shows proportion of Good vs Bad returns each day, helping identify wastage patterns</p>
                        <p><strong>Goal:</strong> Maximize green (sellable), minimize red (wastage)</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={isMobile ? 280 : 350}>
                  <ComposedChart data={data?.periodReturns?.dailyTrend || []} margin={{ top: 10, right: 50, left: 20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      label={{ value: 'Date', position: 'insideBottom', offset: -5, style: { fontSize: isMobile ? 12 : 13, fill: '#1f2937', fontWeight: 700 } }}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
                      label={{ value: 'Return Count', angle: -90, position: 'insideLeft', offset: -5, style: { fontSize: isMobile ? 11 : 12, fill: '#1f2937', fontWeight: 700, textAnchor: 'middle' } }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
                      label={{ value: `Value (${getCurrency()})`, angle: 90, position: 'insideRight', offset: -5, style: { fontSize: isMobile ? 11 : 12, fill: '#1f2937', fontWeight: 700, textAnchor: 'middle' } }}
                    />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }} />
                    <Legend
                      wrapperStyle={{ fontSize: isMobile ? '12px' : '14px' }}
                      content={() => (
                        <div style={{ textAlign: 'center', fontSize: isMobile ? '12px' : '14px', paddingTop: '10px' }}>
                          <span className="text-green-600 font-semibold">●</span> Good Returns |
                          <span className="text-orange-600 font-semibold ml-2">●</span> Bad Returns |
                          <span className="text-purple-600 font-semibold ml-2">—</span> Total Value
                        </div>
                      )}
                    />
                    <Bar yAxisId="left" dataKey="good_return_count" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                    <Bar yAxisId="left" dataKey="bad_return_count" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="return_value" stroke="#8b5cf6" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            </TooltipProvider>

            {/* Top Returned Products */}
            <TooltipProvider>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold max-sm:text-base">Top 20 Returned Products</CardTitle>
                    <p className="text-xs text-slate-500 mt-1">Scroll to view all 20 products</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={exportTop20ProductsToExcel}
                      variant="outline"
                      size="sm"
                      className="gap-2 max-sm:px-2"
                    >
                      <Download className="h-4 w-4" />
                      <span className="max-sm:hidden">Export Excel</span>
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="ml-2 p-1 hover:bg-slate-100 rounded-full transition-colors">
                          <HelpCircle className="h-4 w-4 text-slate-400" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <div className="space-y-2 text-xs">
                          <p><strong>Top 20 Returned Products Explained:</strong></p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><strong>Ranked by Return Value:</strong> Products sorted by total {getCurrency()} value returned (not just quantity)</li>
                            <li><strong>Brand & Category:</strong> Helps identify patterns - is one brand or category being returned more?</li>
                            <li><strong>Qty Returned:</strong> Total units returned in the selected period</li>
                            <li><strong>Transactions:</strong> How many separate return transactions for this product</li>
                          </ul>
                          <p><strong>Why this matters:</strong> High-value returns indicate products needing quality review or better customer education</p>
                          <p><strong>Action:</strong> Focus on top 5 products to reduce wastage</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[500px] overflow-auto -mx-6 md:mx-0">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-20 shadow-md border-b-2 border-gray-300">
                      <TableRow>
                        <TableHead className="min-w-[50px] text-center bg-white">Rank</TableHead>
                        <TableHead className="min-w-[200px] bg-white">Product</TableHead>
                        <TableHead className="min-w-[120px] bg-white">Brand</TableHead>
                        <TableHead className="min-w-[120px] bg-white">Customer Channel</TableHead>
                        <TableHead className="text-right min-w-[100px] bg-white">Qty Returned</TableHead>
                        <TableHead className="text-right min-w-[110px] bg-white">Total Return Value</TableHead>
                        <TableHead className="text-right min-w-[110px] text-green-700 bg-white">Good Returns</TableHead>
                        <TableHead className="text-right min-w-[110px] text-orange-700 bg-white">Bad Returns</TableHead>
                        <TableHead className="text-right min-w-[100px] bg-white">Transactions</TableHead>
                      </TableRow>
                    </TableHeader>
                      <TableBody>
                        {data?.periodReturns?.byProduct?.map((item: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="text-center">
                              <Badge
                                variant={idx < 3 ? "default" : "outline"}
                                className={`text-xs font-bold ${idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-600' : ''}`}
                              >
                                {idx + 1}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-sm max-sm:text-xs">{item.product_name}</div>
                              <div className="text-xs text-slate-500">{item.product_code}</div>
                            </TableCell>
                            <TableCell className="text-sm max-sm:text-xs">
                              <Badge variant="outline" className="text-xs font-normal">{item.brand}</Badge>
                            </TableCell>
                            <TableCell className="text-sm max-sm:text-xs">{item.customer_channel}</TableCell>
                            <TableCell className="text-right text-sm max-sm:text-xs">{formatNumber(item.return_qty)}</TableCell>
                            <TableCell className="text-right font-medium text-blue-600 text-sm max-sm:text-xs">
                              {formatValue(item.return_value)}
                            </TableCell>
                            <TableCell className="text-right text-sm max-sm:text-xs">
                              <div className="text-green-600 font-medium">{formatValue(item.good_return_value || 0)}</div>
                              <div className="text-xs text-green-500">{formatNumber(item.good_return_count || 0)} txns</div>
                            </TableCell>
                            <TableCell className="text-right text-sm max-sm:text-xs">
                              <div className="text-orange-600 font-medium">{formatValue(item.bad_return_value || 0)}</div>
                              <div className="text-xs text-orange-500">{formatNumber(item.bad_return_count || 0)} txns</div>
                            </TableCell>
                            <TableCell className="text-right text-sm max-sm:text-xs">
                              <Badge variant="secondary" className="text-xs">{item.return_count}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                </div>
              </CardContent>
            </Card>
            </TooltipProvider>

            {/* Returns by Customer Channel */}
            <TooltipProvider>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg font-semibold max-sm:text-base">Returns by Customer Channel Analysis</CardTitle>
                  <Button
                    onClick={exportChannelAnalysisToExcel}
                    variant="outline"
                    size="sm"
                    className="gap-2 max-sm:px-2"
                  >
                    <Download className="h-4 w-4" />
                    <span className="max-sm:hidden">Export Excel</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Category Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-blue-700 font-medium">Categories Affected</div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button className="p-0.5 hover:bg-blue-200 rounded-full transition-colors">
                              <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs"><strong>Categories Affected:</strong> Number of different product categories that have returns in this period. More categories = broader return issue.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="text-2xl font-bold text-blue-900 mt-1">
                        {data?.periodReturns?.byChannel?.length || 0}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-indigo-700 font-medium">Total Units Returned</div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button className="p-0.5 hover:bg-indigo-200 rounded-full transition-colors">
                              <HelpCircle className="h-3.5 w-3.5 text-indigo-500" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs"><strong>Total Units Returned:</strong> Sum of all product quantities returned across all categories. Includes both Good (sellable) and Bad (wastage) returns.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="text-2xl font-bold text-indigo-900 mt-1">
                        {formatNumber(data?.periodReturns?.byChannel?.reduce((sum: number, cat: any) => sum + (Number(cat.return_qty) || 0), 0) || 0)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-blue-700 font-medium">Total Return Value</div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button className="p-0.5 hover:bg-blue-200 rounded-full transition-colors">
                              <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs"><strong>Total Return Value:</strong> Combined {getCurrency()} value of all returns across all categories. This represents potential revenue loss or inventory recovery value.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="text-2xl font-bold text-blue-900 mt-1">
                        {formatValue(data?.periodReturns?.byChannel?.reduce((sum: number, cat: any) => sum + (Number(cat.return_value) || 0), 0) || 0)}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Combined Chart */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-sm font-semibold text-slate-700">Category-wise Returns Distribution</h4>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="p-0.5 hover:bg-slate-200 rounded-full transition-colors">
                          <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <div className="space-y-2 text-xs">
                          <p><strong>Category-wise Distribution Explained:</strong></p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><strong className="text-green-600">Green Bars:</strong> Good returns (sellable) - can be resold, minimal loss</li>
                            <li><strong className="text-orange-600">Red Bars:</strong> Bad returns (wastage) - expired/damaged, direct financial loss</li>
                            <li><strong>Stacked View:</strong> Total height shows combined return value per category</li>
                            <li><strong className="text-blue-600">Blue Line:</strong> Total quantity of units returned</li>
                          </ul>
                          <p><strong>Why this matters:</strong> Identifies which categories have high wastage (red) vs recoverable returns (green)</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <ResponsiveContainer width="100%" height={isMobile ? 300 : 400}>
                    <ComposedChart data={data?.periodReturns?.byChannel || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="channel_name"
                        tick={{ fontSize: isMobile ? 9 : 11, fill: '#6b7280' }}
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis
                        yAxisId="left"
                        label={{ value: `${getCurrency()} Value`, angle: -90, position: 'insideLeft', fill: '#6b7280' }}
                        tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
                        tickFormatter={formatCompactValue}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        label={{ value: 'Units', angle: 90, position: 'insideRight', fill: '#6b7280' }}
                        tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
                        tickFormatter={formatCompactValue}
                      />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}
                        formatter={(value: any, name: any, props: any) => {
                          if (name === `Good Returns (${getCurrency()})`) return [formatValue(value), 'Good Returns (Sellable)']
                          if (name === `Bad Returns (${getCurrency()})`) return [formatValue(value), 'Bad Returns (Wastage)']
                          if (name === 'Quantity Returned') return [formatNumber(value) + ' units', 'Total Quantity']
                          return [value, name]
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: isMobile ? '11px' : '13px' }} />
                      <Bar
                        yAxisId="left"
                        dataKey="good_return_value"
                        stackId="a"
                        fill="#10b981"
                        name={`Good Returns (${getCurrency()})`}
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="bad_return_value"
                        stackId="a"
                        fill="#f97316"
                        name={`Bad Returns (${getCurrency()})`}
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="return_qty"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        dot={{ fill: '#3b82f6', r: 5 }}
                        name="Quantity Returned"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Detailed Category Table */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-sm font-semibold text-slate-700">Detailed Breakdown</h4>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="p-0.5 hover:bg-slate-200 rounded-full transition-colors">
                          <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <div className="space-y-2 text-xs">
                          <p><strong>Detailed Breakdown Explained:</strong></p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><strong>% of Total:</strong> Percentage of total return value attributed to this category</li>
                            <li>Formula: (Category Return Value ÷ Total Return Value) × 100</li>
                            <li>Higher percentages indicate categories contributing most to returns</li>
                          </ul>
                          <p><strong>Use this to:</strong> Prioritize which categories need attention for return reduction</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="overflow-x-auto -mx-6 md:mx-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[150px]">Customer Channel</TableHead>
                          <TableHead className="text-right min-w-[120px]">Qty Returned (Units)</TableHead>
                          <TableHead className="text-right min-w-[130px]">Total Return Value</TableHead>
                          <TableHead className="text-right min-w-[110px] text-green-700">Good Returns</TableHead>
                          <TableHead className="text-right min-w-[110px] text-orange-700">Bad Returns</TableHead>
                          <TableHead className="text-right min-w-[100px]">Transactions</TableHead>
                          <TableHead className="text-right min-w-[100px]">% of Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data?.periodReturns?.byChannel?.map((item: any, idx: number) => {
                          const totalValue = data.periodReturns.byChannel.reduce((sum: number, cat: any) => sum + (Number(cat.return_value) || 0), 0);
                          const percentage = totalValue > 0 ? ((Number(item.return_value) / totalValue) * 100).toFixed(1) : '0.0';

                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-medium text-sm max-sm:text-xs">{item.channel_name}</TableCell>
                              <TableCell className="text-right text-sm max-sm:text-xs">
                                <Badge variant="secondary" className="text-xs">{formatNumber(item.return_qty)}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium text-blue-600 text-sm max-sm:text-xs">
                                {formatValue(item.return_value)}
                              </TableCell>
                              <TableCell className="text-right text-sm max-sm:text-xs">
                                <div className="text-green-600 font-medium">{formatValue(item.good_return_value || 0)}</div>
                                <div className="text-xs text-green-500">{formatNumber(item.good_return_count || 0)} txns</div>
                              </TableCell>
                              <TableCell className="text-right text-sm max-sm:text-xs">
                                <div className="text-orange-600 font-medium">{formatValue(item.bad_return_value || 0)}</div>
                                <div className="text-xs text-orange-500">{formatNumber(item.bad_return_count || 0)} txns</div>
                              </TableCell>
                              <TableCell className="text-right text-sm max-sm:text-xs">{item.return_count}</TableCell>
                              <TableCell className="text-right text-sm max-sm:text-xs">
                                <Badge variant="outline" className="text-xs">{percentage}%</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
            </TooltipProvider>
          </div>
        </TabsContent>

        {/* Weekly Return History */}
        <TabsContent value="weekly-history">
          <div className="space-y-6 max-md:space-y-4">
            {/* Export Button Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 max-sm:text-base">Weekly Returns Trend</h3>
                <p className="text-xs text-slate-500 mt-1">Track return patterns week-over-week with Good vs Bad breakdown</p>
              </div>
              <Button
                onClick={exportWeeklyHistoryToExcel}
                size="sm"
                variant="outline"
                className="flex items-center gap-2 hover:bg-blue-50 hover:border-blue-500"
              >
                <Download className="h-4 w-4" />
                <span className="max-sm:hidden">Export Excel</span>
              </Button>
            </div>

            {/* Weekly History Summary Cards */}
            <TooltipProvider>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-blue-700 font-medium">Total Weeks Tracked</div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="p-0.5 hover:bg-blue-200 rounded-full transition-colors">
                          <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs"><strong>Total Weeks Tracked:</strong> Number of weeks in the selected date range with return activity. Each week runs from Sunday to Saturday.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="text-2xl font-bold text-blue-900 mt-1">
                    {data?.weeklyHistory?.data?.length || 0}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-indigo-700 font-medium">Avg Weekly Returns</div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="p-0.5 hover:bg-indigo-200 rounded-full transition-colors">
                          <HelpCircle className="h-3.5 w-3.5 text-indigo-500" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs"><strong>Average Weekly Returns:</strong> Average return value per week. Helps identify if return levels are consistent or volatile.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="text-2xl font-bold text-indigo-900 mt-1">
                    {formatValue(data?.weeklyHistory?.data?.reduce((sum: number, w: any) => sum + parseFloat(w.return_value || 0), 0) / (data?.weeklyHistory?.data?.length || 1))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-purple-700 font-medium">Peak Week Returns</div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="p-0.5 hover:bg-purple-200 rounded-full transition-colors">
                          <HelpCircle className="h-3.5 w-3.5 text-purple-500" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs"><strong>Peak Week Returns:</strong> Highest weekly return value in the period. Identifies problematic weeks requiring investigation.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="text-2xl font-bold text-purple-900 mt-1">
                    {formatValue(Math.max(...(data?.weeklyHistory?.data?.map((w: any) => parseFloat(w.return_value || 0)) || [0])))}
                  </div>
                </CardContent>
              </Card>
            </div>
            </TooltipProvider>

            <TooltipProvider>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold max-sm:text-base">Weekly Sales Return History</CardTitle>
                    <p className="text-xs text-slate-500 mt-1">Stacked view showing sellable vs wastage returns</p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="ml-2 p-1 hover:bg-slate-100 rounded-full transition-colors">
                        <HelpCircle className="h-4 w-4 text-slate-400" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <div className="space-y-2 text-xs">
                        <p><strong>Weekly Return Trend Explained:</strong></p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li><strong className="text-green-600">Good Returns (Green bars):</strong> Sellable products that can be resold</li>
                          <li><strong className="text-orange-600">Bad Returns (Red bars):</strong> Wastage - expired/damaged items</li>
                          <li><strong className="text-purple-600">Transaction Line (Purple):</strong> Number of return transactions</li>
                        </ul>
                        <p><strong>Why Track Weekly?</strong> Helps identify seasonal patterns, problematic weeks, and trends over time</p>
                        <p><strong>Goal:</strong> Reduce total returns and minimize wastage (red)</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={isMobile ? 300 : 400}>
                  <ComposedChart data={data?.weeklyHistory?.data || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="week_label" label={{ value: 'Week Period', position: 'insideBottom', offset: -5, fill: '#6b7280' }} tick={{ fontSize: isMobile ? 9 : 11, fill: '#6b7280', angle: -45, textAnchor: 'end' }} height={80} />
                    <YAxis yAxisId="left" label={{ value: 'Units / Transactions', angle: -90, position: 'insideLeft', fill: '#6b7280' }} tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }} />
                    <YAxis yAxisId="right" orientation="right" label={{ value: `${getCurrency()} Value`, angle: 90, position: 'insideRight', fill: '#6b7280' }} tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}
                      formatter={(value: any, name: any) => {
                        if (name === `Good Returns (${getCurrency()})`) return [formatValue(value), 'Good Returns (Sellable)']
                        if (name === `Bad Returns (${getCurrency()})`) return [formatValue(value), 'Bad Returns (Wastage)']
                        if (name === 'Return Transactions (Count)') return [formatNumber(value), 'Return Count']
                        return [value, name]
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: isMobile ? '12px' : '14px' }} />
                    <Bar
                      yAxisId="right"
                      dataKey="good_return_value"
                      stackId="value"
                      fill="#10b981"
                      name={`Good Returns (${getCurrency()})`}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="bad_return_value"
                      stackId="value"
                      fill="#f97316"
                      name={`Bad Returns (${getCurrency()})`}
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="return_count"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ fill: '#8b5cf6', r: 4 }}
                      name="Return Transactions (Count)"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            </TooltipProvider>

            <TooltipProvider>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold max-sm:text-base">Weekly Return Details</CardTitle>
                    <p className="text-xs text-slate-500 mt-1">Detailed breakdown with Good vs Bad returns</p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="ml-2 p-1 hover:bg-slate-100 rounded-full transition-colors">
                        <HelpCircle className="h-4 w-4 text-slate-400" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <div className="space-y-2 text-xs">
                        <p><strong>Weekly Details Explained:</strong></p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li><strong>Week Period:</strong> Date range for each week (Sunday to Saturday)</li>
                          <li><strong>Good Returns:</strong> Value + transaction count of sellable returns</li>
                          <li><strong>Bad Returns:</strong> Value + transaction count of wastage</li>
                          <li><strong>Products:</strong> Number of unique products returned that week</li>
                          <li><strong>Salesmen:</strong> Number of salesmen with returns that week</li>
                        </ul>
                        <p><strong>Use this to:</strong> Compare week-over-week performance and identify trends</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto -mx-6 md:mx-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[80px]">Week</TableHead>
                        <TableHead className="min-w-[180px]">Period</TableHead>
                        <TableHead className="text-right min-w-[100px]">Returns</TableHead>
                        <TableHead className="text-right min-w-[110px]">Qty Returned</TableHead>
                        <TableHead className="text-right min-w-[120px]">Total Return Value</TableHead>
                        <TableHead className="text-right min-w-[110px] text-green-700">Good Returns</TableHead>
                        <TableHead className="text-right min-w-[110px] text-orange-700">Bad Returns</TableHead>
                        <TableHead className="text-right min-w-[100px]">Products</TableHead>
                        <TableHead className="text-right min-w-[100px]">Salesmen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.weeklyHistory?.data?.map((item: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{item.week_label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {new Date(item.week_start).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} - {new Date(item.week_end).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </TableCell>
                          <TableCell className="text-right text-sm max-sm:text-xs">{formatNumber(item.return_count)}</TableCell>
                          <TableCell className="text-right text-sm max-sm:text-xs">{formatNumber(item.return_qty)}</TableCell>
                          <TableCell className="text-right font-medium text-blue-600 text-sm max-sm:text-xs">
                            {formatValue(item.return_value)}
                          </TableCell>
                          <TableCell className="text-right text-sm max-sm:text-xs">
                            <div className="text-green-600 font-medium">{formatValue(item.good_return_value || 0)}</div>
                            <div className="text-xs text-green-500">{formatNumber(item.good_return_count || 0)} txns</div>
                          </TableCell>
                          <TableCell className="text-right text-sm max-sm:text-xs">
                            <div className="text-orange-600 font-medium">{formatValue(item.bad_return_value || 0)}</div>
                            <div className="text-xs text-orange-500">{formatNumber(item.bad_return_count || 0)} txns</div>
                          </TableCell>
                          <TableCell className="text-right text-sm max-sm:text-xs">{formatNumber(item.unique_products)}</TableCell>
                          <TableCell className="text-right text-sm max-sm:text-xs">{formatNumber(item.unique_salesmen)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            </TooltipProvider>
          </div>
        </TabsContent>


        {/* Good/Bad Returns Details - NEW TAB */}
        <TabsContent value="good-bad-details">
          <div className="space-y-6 max-md:space-y-4">
            {/* Section Header */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-900 mb-2">Detailed Returns Transactions</h2>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-green-600">Good Returns (Sellable):</span> Products that can be resold or restocked.
                <span className="mx-2">|</span>
                <span className="font-semibold text-orange-600">Bad Returns (Wastage):</span> Damaged or expired products that cannot be resold.
              </p>
            </div>

            {/* Two Side-by-Side Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-md:gap-4">
              {/* Good Returns Table */}
              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg font-bold text-green-700">Good Returns (Sellable)</CardTitle>
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        {data?.goodReturnsDetail?.data?.length || 0} transactions
                      </Badge>
                    </div>
                    <Button
                      onClick={exportGoodReturnsToExcel}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-green-500" />
                    </div>
                  ) : !data?.goodReturnsDetail?.data || data.goodReturnsDetail.data.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <PackageX className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      <p>No good returns data available</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs whitespace-nowrap">Date</TableHead>
                              <TableHead className="text-xs whitespace-nowrap">Salesman</TableHead>
                              <TableHead className="text-xs whitespace-nowrap">Customer</TableHead>
                              <TableHead className="text-xs whitespace-nowrap">Product</TableHead>
                              <TableHead className="text-xs text-right whitespace-nowrap">Qty</TableHead>
                              <TableHead className="text-xs text-right whitespace-nowrap">Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.goodReturnsDetail.data
                              .slice(
                                (goodReturnsCurrentPage - 1) * goodReturnsItemsPerPage,
                                goodReturnsCurrentPage * goodReturnsItemsPerPage
                              )
                              .map((row: any, index: number) => (
                                <TableRow key={index}>
                                  <TableCell className="text-xs whitespace-nowrap">
                                    {row.trx_date ? new Date(row.trx_date).toLocaleDateString() : '-'}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    <div className="max-w-[120px] truncate" title={row.salesman_name || '-'}>
                                      {row.salesman_name || '-'}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    <div className="max-w-[120px] truncate" title={row.customer_name || '-'}>
                                      {row.customer_name || '-'}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    <div className="max-w-[150px] truncate" title={row.product_name || '-'}>
                                      {row.product_name || '-'}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-right">
                                    {formatNumber(row.quantity || 0)}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-semibold text-green-600">
                                    {formatValue(row.return_value || 0)}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Pagination for Good Returns */}
                      {data.goodReturnsDetail.data.length > goodReturnsItemsPerPage && (
                        <div className="flex items-center justify-between pt-4 border-t">
                          <p className="text-sm text-slate-600">
                            Showing {((goodReturnsCurrentPage - 1) * goodReturnsItemsPerPage) + 1} to{' '}
                            {Math.min(goodReturnsCurrentPage * goodReturnsItemsPerPage, data.goodReturnsDetail.data.length)} of{' '}
                            {data.goodReturnsDetail.data.length} transactions
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setGoodReturnsCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={goodReturnsCurrentPage === 1}
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setGoodReturnsCurrentPage(prev => prev + 1)}
                              disabled={goodReturnsCurrentPage * goodReturnsItemsPerPage >= data.goodReturnsDetail.data.length}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Bad Returns Table */}
              <Card className="border-l-4 border-l-orange-500">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg font-bold text-orange-700">Bad Returns (Wastage)</CardTitle>
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                        {data?.badReturnsDetail?.data?.length || 0} transactions
                      </Badge>
                    </div>
                    <Button
                      onClick={exportBadReturnsToExcel}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                    </div>
                  ) : !data?.badReturnsDetail?.data || data.badReturnsDetail.data.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <PackageX className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      <p>No bad returns data available</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs whitespace-nowrap">Date</TableHead>
                              <TableHead className="text-xs whitespace-nowrap">Salesman</TableHead>
                              <TableHead className="text-xs whitespace-nowrap">Customer</TableHead>
                              <TableHead className="text-xs whitespace-nowrap">Product</TableHead>
                              <TableHead className="text-xs text-right whitespace-nowrap">Qty</TableHead>
                              <TableHead className="text-xs text-right whitespace-nowrap">Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.badReturnsDetail.data
                              .slice(
                                (badReturnsCurrentPage - 1) * badReturnsItemsPerPage,
                                badReturnsCurrentPage * badReturnsItemsPerPage
                              )
                              .map((row: any, index: number) => (
                                <TableRow key={index}>
                                  <TableCell className="text-xs whitespace-nowrap">
                                    {row.trx_date ? new Date(row.trx_date).toLocaleDateString() : '-'}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    <div className="max-w-[120px] truncate" title={row.salesman_name || '-'}>
                                      {row.salesman_name || '-'}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    <div className="max-w-[120px] truncate" title={row.customer_name || '-'}>
                                      {row.customer_name || '-'}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    <div className="max-w-[150px] truncate" title={row.product_name || '-'}>
                                      {row.product_name || '-'}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-right">
                                    {formatNumber(row.quantity || 0)}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-semibold text-orange-600">
                                    {formatValue(row.return_value || 0)}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Pagination for Bad Returns */}
                      {data.badReturnsDetail.data.length > badReturnsItemsPerPage && (
                        <div className="flex items-center justify-between pt-4 border-t">
                          <p className="text-sm text-slate-600">
                            Showing {((badReturnsCurrentPage - 1) * badReturnsItemsPerPage) + 1} to{' '}
                            {Math.min(badReturnsCurrentPage * badReturnsItemsPerPage, data.badReturnsDetail.data.length)} of{' '}
                            {data.badReturnsDetail.data.length} transactions
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setBadReturnsCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={badReturnsCurrentPage === 1}
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setBadReturnsCurrentPage(prev => prev + 1)}
                              disabled={badReturnsCurrentPage * badReturnsItemsPerPage >= data.badReturnsDetail.data.length}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
