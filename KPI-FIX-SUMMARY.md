# KPI Discrepancy Fix - Summary

## Issue Identified

The KPI values displayed in the **Dashboard** and **Daily Sales Report** were showing different numbers for the same date range and filters. This was causing confusion and inconsistency in the reporting.

## Root Cause

The discrepancy was caused by different calculation methods in the SQL queries:

### Dashboard KPI (Correct Implementation)
- **Location**: `src/app/api/dashboard/kpi/route.ts`
- **Method**: Uses `trx_totalamount` at the transaction level
- **Logic**:
  - Filters transactions with `trx_totalamount >= 0` to exclude returns
  - Counts orders only for positive amounts
  - Uses transaction-level amounts for accurate totals

### Daily Sales Report (Previous Implementation - INCORRECT)
- **Location**: `src/services/dailySalesService.ts`
- **Method**: Used line-level calculations
- **Logic**:
  - Calculated from `line_baseprice * line_quantitybu`
  - Did not properly filter returns
  - Could include negative line items

## Changes Made

Fixed all SQL queries in `src/services/dailySalesService.ts` to align with the Dashboard implementation:

### 1. Summary Query (`getDailySalesSummary`)
**Before:**
```sql
COUNT(DISTINCT trx_trxcode) as total_orders,
COALESCE(SUM(line_baseprice * line_quantitybu), 0) as gross_sales,
COALESCE(SUM(line_baseprice * line_quantitybu - COALESCE(line_totaldiscountamount, 0)), 0) as total_net_sales,
COALESCE(SUM(line_quantitybu), 0) as total_quantity
```

**After:**
```sql
COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as total_orders,
COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as gross_sales,
COALESCE(SUM(trx_totalamount), 0) as total_net_sales,
COALESCE(SUM(ABS(line_quantitybu)), 0) as total_quantity
```

### 2. Trend Query (`getDailyTrend`)
**Before:**
```sql
COUNT(DISTINCT trx_trxcode) as orders,
COALESCE(SUM(trx_totalamount), 0) as sales
```

**After:**
```sql
COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as orders,
COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as sales
```

### 3. Product Performance Query (`getProductPerformance`)
**Before:**
```sql
COUNT(DISTINCT trx_trxcode) as orders,
COALESCE(SUM(line_quantitybu), 0) as quantity
```

**After:**
```sql
COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as orders,
COALESCE(SUM(ABS(line_quantitybu)), 0) as quantity
```

### 4. Store Performance Query (`getStorePerformance`)
**Before:**
```sql
COUNT(DISTINCT trx_trxcode) as orders,
COALESCE(SUM(line_baseprice * line_quantitybu), 0) as sales,
COALESCE(SUM(line_baseprice * line_quantitybu - COALESCE(line_totaldiscountamount, 0)), 0) as net_sales
```

**After:**
```sql
COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as orders,
COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as sales,
COALESCE(SUM(trx_totalamount), 0) as net_sales
```

### 5. User Performance Query (`getUserPerformance`)
**Before:**
```sql
COUNT(DISTINCT trx_trxcode) as orders,
COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) as sales,
COALESCE(AVG(NULLIF(trx_totalamount, 0)), 0) as avg_order_value
```

**After:**
```sql
COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END) as orders,
COALESCE(SUM(CASE WHEN trx_totalamount >= 0 THEN trx_totalamount ELSE 0 END), 0) as sales,
COALESCE(SUM(trx_totalamount) / NULLIF(COUNT(DISTINCT CASE WHEN trx_totalamount >= 0 THEN trx_trxcode END), 0), 0) as avg_order_value
```

## Key Improvements

1. **Consistent Order Counting**: Now only counts transactions with positive amounts (`trx_totalamount >= 0`)
2. **Accurate Sales Totals**: Uses transaction-level amounts instead of recalculating from line items
3. **Proper Return Handling**: Excludes returns from order counts and gross sales
4. **Quantity Calculation**: Uses `ABS(line_quantitybu)` to ensure positive quantities
5. **Average Order Value**: Calculates correctly by dividing total sales by positive orders only

## Expected Results

After these changes:
- **Dashboard KPIs** and **Daily Sales Report KPIs** will show **identical values**
- Order counts will exclude return transactions
- Sales amounts will be consistent across all reports
- All data will be sourced from `trx_totalamount` at the transaction level

## Testing Recommendations

1. Compare Dashboard KPIs with Daily Sales Report for the same date range
2. Verify that order counts match
3. Check that sales totals are identical
4. Ensure avg order value calculations are consistent
5. Test with different filters (area, user, store, etc.)

## Files Modified

- `src/services/dailySalesService.ts` - All query functions updated

## Files Created for Testing

- `test-kpi-comparison.js` - Script to compare Dashboard vs Daily Sales Report KPIs
