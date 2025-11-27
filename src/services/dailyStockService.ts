// Daily Stock Service - Using real database tables
// Queries data from tblStock, tblItem, tblWarehouse

import { query } from '../lib/database'

/**
 * Get stock summary from tblStock
 */
export const getStockCheckSummary = async (filters: any = {}) => {
  const conditions: string[] = []
  const params: any[] = []
  let paramCount = 1

  if (filters.warehouseCode) {
    conditions.push(`s."WHCode" = $${paramCount}`)
    params.push(filters.warehouseCode)
    paramCount++
  }

  if (filters.productCode) {
    conditions.push(`s."ItemCode" = $${paramCount}`)
    params.push(filters.productCode)
    paramCount++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const sql = `
    SELECT
      COUNT(DISTINCT s."ItemCode") as total_products,
      COUNT(DISTINCT s."WHCode") as total_warehouses,
      COALESCE(SUM(s."QtyBU"), 0) as total_stock_on_hand,
      COALESCE(SUM(s."StockReservedQty"), 0) as total_reserved_stock,
      COALESCE(SUM(s."StockReturnsQty"), 0) as total_returns_stock,
      COALESCE(AVG(s."QtyBU"), 0) as avg_stock_per_item,
      COUNT(*) FILTER (WHERE s."QtyBU" = 0) as out_of_stock_count,
      COUNT(*) FILTER (WHERE s."QtyBU" > 0 AND s."QtyBU" < 10) as low_stock_count,
      COUNT(*) FILTER (WHERE s."QtyBU" >= 10) as healthy_stock_count
    FROM "tblStock" s
    ${whereClause}
  `

  const result = await query(sql, params)
  const stats = result.rows[0]

  return {
    totalProducts: parseInt(stats.total_products) || 0,
    totalWarehouses: parseInt(stats.total_warehouses) || 0,
    totalStockOnHand: parseFloat(stats.total_stock_on_hand) || 0,
    totalReservedStock: parseFloat(stats.total_reserved_stock) || 0,
    totalReturnsStock: parseFloat(stats.total_returns_stock) || 0,
    avgStockPerItem: parseFloat(stats.avg_stock_per_item) || 0,
    outOfStockCount: parseInt(stats.out_of_stock_count) || 0,
    lowStockCount: parseInt(stats.low_stock_count) || 0,
    healthyStockCount: parseInt(stats.healthy_stock_count) || 0
  }
}

/**
 * Get product stock levels from tblStock
 */
export const getProductStockLevels = async (filters: any = {}) => {
  const conditions: string[] = []
  const params: any[] = []
  let paramCount = 1

  if (filters.warehouseCode) {
    conditions.push(`s."WHCode" = $${paramCount}`)
    params.push(filters.warehouseCode)
    paramCount++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const sql = `
    SELECT
      s."ItemCode" as "productCode",
      COALESCE(MAX(i."Description"), s."ItemCode") as "productName",
      COALESCE(MAX(i."GroupLevel1"), 'Unknown') as "productCategory",
      COUNT(DISTINCT s."WHCode") as warehouses_with_stock,
      COALESCE(SUM(s."QtyBU"), 0) as total_stock,
      COALESCE(AVG(s."QtyBU"), 0) as avg_stock,
      COUNT(*) FILTER (WHERE s."QtyBU" = 0) as out_of_stock_locations,
      COUNT(*) FILTER (WHERE s."QtyBU" > 0 AND s."QtyBU" < 10) as low_stock_locations,
      COUNT(*) FILTER (WHERE s."QtyBU" >= 10) as healthy_stock_locations
    FROM "tblStock" s
    LEFT JOIN "tblItem" i ON s."ItemCode" = i."Code"
    ${whereClause}
    GROUP BY s."ItemCode"
    ORDER BY total_stock DESC
    LIMIT 100
  `

  const result = await query(sql, params)

  return result.rows.map((row: any) => ({
    productCode: row.productCode,
    productName: row.productName,
    productCategory: row.productCategory,
    warehousesWithStock: parseInt(row.warehouses_with_stock) || 0,
    totalStock: parseFloat(row.total_stock) || 0,
    avgStock: parseFloat(row.avg_stock) || 0,
    outOfStockLocations: parseInt(row.out_of_stock_locations) || 0,
    lowStockLocations: parseInt(row.low_stock_locations) || 0,
    healthyStockLocations: parseInt(row.healthy_stock_locations) || 0
  }))
}

/**
 * Get stock by warehouse from tblStock
 */
export const getStoreStockLevels = async (filters: any = {}) => {
  const conditions: string[] = []
  const params: any[] = []
  let paramCount = 1

  if (filters.productCode) {
    conditions.push(`s."ItemCode" = $${paramCount}`)
    params.push(filters.productCode)
    paramCount++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const sql = `
    SELECT
      s."WHCode" as "warehouseCode",
      COALESCE(MAX(w."Description"), s."WHCode") as "warehouseName",
      COUNT(DISTINCT s."ItemCode") as products_in_stock,
      COALESCE(SUM(s."QtyBU"), 0) as total_stock,
      COALESCE(AVG(s."QtyBU"), 0) as avg_stock,
      COUNT(*) FILTER (WHERE s."QtyBU" = 0) as out_of_stock_items,
      COUNT(*) FILTER (WHERE s."QtyBU" > 0 AND s."QtyBU" < 10) as low_stock_items,
      COUNT(*) FILTER (WHERE s."QtyBU" >= 10) as healthy_stock_items
    FROM "tblStock" s
    LEFT JOIN "tblWarehouse" w ON s."WHCode" = w."Code"
    ${whereClause}
    GROUP BY s."WHCode"
    ORDER BY total_stock DESC
    LIMIT 100
  `

  const result = await query(sql, params)

  return result.rows.map((row: any) => ({
    warehouseCode: row.warehouseCode,
    warehouseName: row.warehouseName,
    storeCode: row.warehouseCode,
    storeName: row.warehouseName,
    productsInStock: parseInt(row.products_in_stock) || 0,
    totalStock: parseFloat(row.total_stock) || 0,
    avgStock: parseFloat(row.avg_stock) || 0,
    outOfStockItems: parseInt(row.out_of_stock_items) || 0,
    lowStockItems: parseInt(row.low_stock_items) || 0,
    healthyStockItems: parseInt(row.healthy_stock_items) || 0
  }))
}

/**
 * Get stock trend (placeholder - stock doesn't have date tracking in tblStock)
 * Returns current stock levels as a single data point
 */
export const getStockCheckTrend = async (filters: any = {}) => {
  const summary = await getStockCheckSummary(filters)
  const today = new Date().toISOString().split('T')[0]

  return [{
    date: today,
    totalStock: summary.totalStockOnHand,
    avgStock: summary.avgStockPerItem,
    outOfStock: summary.outOfStockCount,
    lowStock: summary.lowStockCount,
    healthyStock: summary.healthyStockCount
  }]
}

export const dailyStockService = {
  getStockCheckSummary,
  getStockCheckTrend,
  getProductStockLevels,
  getStoreStockLevels
}

export default dailyStockService
