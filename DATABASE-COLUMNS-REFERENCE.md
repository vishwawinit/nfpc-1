# Database Columns Reference - flat_daily_sales_report

## Overview
This document lists the actual columns available in the `flat_daily_sales_report` table and how they map to frontend requirements.

## Available Columns (Verified from Working Code)

### Transaction Columns
- `trx_trxcode` - Transaction ID/code
- `trx_trxdate` - Transaction date (timestamp)
- `trx_trxtype` - Transaction type (1 = invoice/sales, other = returns/credits)
- `trx_totalamount` - Total transaction amount
- `trx_usercode` - User/salesperson code who created the transaction
- `trx_currencycode` - Currency code (e.g., 'AED')

### Customer Columns
- `customer_code` - Customer/store code
- `customer_description` - Customer/store name
- `customer_channel_description` - Sales channel/chain name
- `customer_channelcode` - Channel code

### Route/Hierarchy Columns
- `route_salesmancode` - Team leader/salesman code
- `route_areacode` - Area code
- `route_subareacode` - Sub-area code

### Line Item (Product) Columns
- `line_itemcode` - Product code
- `line_itemdescription` - Product description/name
- `line_quantitybu` - Quantity in base units
- `line_baseprice` - Base price per unit
- `line_unitprice` - Unit price
- `line_netamount` - Net amount for the line
- `line_totaldiscountamount` - Total discount on the line
- `line_uom` - Unit of measure (e.g., 'PCS', 'DZ')

### Item (Product Master) Columns
- `item_grouplevel1` - Product category (level 1)
- `item_grouplevel2` - Product subcategory (level 2)
- `item_brand_description` - Brand description
- `item_description` - Item description (alternative to line_itemdescription)

### User Columns
- `user_description` - User description/name
- `user_usertype` - User type (e.g., 'Field User')
- `user_isactive` - User active status (NOTE: NOT item_isactive!)

## Columns That DO NOT Exist
❌ `item_isactive` - This column does NOT exist (use `user_isactive` if needed, or assume true for products in sales data)
❌ `item_imagepath` - This column does NOT exist (already documented in code)

## Frontend Requirements Mapping

### Products Report Interface: DetailedProduct

```typescript
interface DetailedProduct {
  productCode: string          → line_itemcode
  productName: string          → line_itemdescription
  category: string             → item_grouplevel1
  subcategory: string          → item_grouplevel2
  productGroup: string         → item_grouplevel1 (same as category)
  brand: string                → item_brand_description
  baseUom: string             → line_uom
  imageUrl: string            → '' (no column available, return empty)
  maxPrice: number            → MAX(line_baseprice)
  minPrice: number            → MIN(line_baseprice WHERE > 0)
  totalSales: number          → SUM(trx_totalamount WHERE > 0)
  totalQuantity: number       → SUM(ABS(line_quantitybu))
  totalOrders: number         → COUNT(DISTINCT trx_trxcode)
  avgPrice: number            → totalSales / totalQuantity
  movementStatus: string      → Based on totalQuantity thresholds
  isActive: boolean           → true (assume all products in sales are active)
  isDelist: boolean           → false (no data available)
  currencyCode: string        → trx_currencycode
}
```

### Products Report Interface: TopProduct

```typescript
interface TopProduct {
  productCode: string          → line_itemcode
  productName: string          → line_itemdescription
  category: string             → item_grouplevel1
  brand: string                → item_brand_description
  sales: number                → SUM(trx_totalamount WHERE > 0)
  quantity: number             → SUM(ABS(line_quantitybu))
  avgPrice: number             → sales / quantity
  movementStatus: string       → Based on quantity thresholds:
                                  > 1000 = 'Fast'
                                  > 100 = 'Medium'
                                  > 0 = 'Slow'
                                  = 0 = 'No Sales'
  currencyCode: string         → trx_currencycode
}
```

### Products Report Interface: ProductMetric (KPIs)

```typescript
interface ProductMetric {
  // Comprehensive KPIs (from analytics endpoint)
  totalRevenue: number         → SUM(trx_totalamount WHERE > 0 AND trx_trxtype = 1)
  totalOrders: number          → COUNT(DISTINCT trx_trxcode WHERE trx_trxtype = 1)
  totalQuantity: number        → SUM(ABS(line_quantitybu) WHERE trx_trxtype = 1)
  uniqueCustomers: number      → COUNT(DISTINCT customer_code WHERE trx_trxtype = 1)
  uniqueProducts: number       → COUNT(DISTINCT line_itemcode WHERE trx_trxtype = 1)
  avgOrderValue: number        → totalRevenue / totalOrders

  // Product-specific metrics
  totalProducts: number        → COUNT(DISTINCT line_itemcode) from product summary
  activeProducts: number       → Same as totalProducts (all in sales are active)
  totalSales: number           → SUM of all product sales
  fastMoving: number           → COUNT(products WHERE quantity > 1000)
  slowMoving: number           → COUNT(products WHERE quantity > 0 AND quantity <= 100)
  noSales: number              → COUNT(products WHERE quantity = 0)
  currencyCode: string         → 'AED' (default, or from trx_currencycode)
}
```

## Query Best Practices

### 1. Always Filter by Transaction Type
```sql
WHERE trx_trxtype = 1  -- Only include sales/invoices
```

### 2. Handle Positive Amounts for Sales
```sql
SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END)
```

### 3. Use Absolute Values for Quantities
```sql
SUM(ABS(COALESCE(line_quantitybu, 0)))
```

### 4. Handle NULL and Invalid Values
```sql
COALESCE(MAX(item_grouplevel1), 'Uncategorized')
COALESCE(MAX(item_brand_description), 'No Brand')
COALESCE(MAX(line_uom), 'PCS')
```

### 5. Use Date Comparisons Efficiently
```sql
-- Use date type for better index usage
WHERE trx_trxdate >= $1::date
  AND trx_trxdate <= $2::date
```

## API Endpoints Reference

### 1. Products Analytics: `/api/products/analytics`
Returns: Comprehensive KPIs, top products, sales by category, sales by brand

### 2. Products Details: `/api/products/details`
Returns: Paginated detailed product list with all metrics

### 3. Products Filters: `/api/products/filters`
Returns: Available categories, brands, subcategories for filtering

## Fixed Issues

### ✅ Issue: Column "item_isactive" does not exist
**Solution:** Changed query from:
```sql
BOOL_OR(COALESCE(item_isactive, false)) as is_active
```
To:
```sql
true as is_active
```
**Reasoning:** Products appearing in sales transactions are implicitly active. The `item_isactive` column doesn't exist in this flat table.

### ✅ Issue: Missing KPIs in Products Report
**Solution:** Added comprehensive KPI query to `/api/products/analytics/route.ts` that fetches:
- Total Revenue, Orders, Quantity
- Unique Customers, Products
- Average Order Value
- Fast/Slow/No Sales product counts

## Performance Optimization

### Current Query Times (Without Indexes)
- Products Analytics: ~1-2 seconds
- Products Details: ~1-2 seconds
- LMTD Queries: 600+ seconds ❌

### Recommended Indexes (See `scripts/create-advanced-indexes.sql`)
1. Covering index on (trx_trxdate, trx_trxtype) with INCLUDE columns
2. Indexes on filter columns: customer_code, line_itemcode, item_grouplevel1
3. BRIN index on trx_trxdate for very large tables

### Expected Query Times (With Indexes)
- Products Analytics: <500ms
- Products Details: <500ms
- LMTD Queries: <10 seconds

## Summary

**Key Takeaways:**
1. Use actual column names from the table, don't assume columns exist
2. Always filter by `trx_trxtype = 1` for sales data
3. Handle NULLs with COALESCE and provide sensible defaults
4. All products in sales data can be assumed active (no `item_isactive` column)
5. Use date type comparisons for better performance
6. Aggregate quantities with ABS() to handle returns properly
7. Create database indexes for production performance
