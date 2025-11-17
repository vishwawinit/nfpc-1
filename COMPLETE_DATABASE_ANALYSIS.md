# 🗄️ NFPC PostgreSQL Database Complete Analysis

## Database Overview

**Database Name:** `sfa_database` (PostgreSQL)  
**Secondary Database:** `FarmleyQA` (MSSQL - User Hierarchy)  
**Purpose:** Sales Force Automation & Reporting System

---

## 🏗️ Core Table Structure

### 1. **Primary Transaction Tables**

#### `flat_transactions` / `flat_sales_transactions`
> **Primary table for all sales data and KPI calculations**

**Key Columns:**
- `transaction_date` (TIMESTAMP) - Transaction date/time
- `trx_date_only` (DATE) - Date only for filtering
- `transaction_code` / `trx_code` (STRING) - Unique transaction ID
- `net_amount` (DECIMAL) - Net sales amount (main KPI field)
- `line_amount` (DECIMAL) - Line total amount
- `quantity_bu` / `quantity` (DECIMAL) - Quantity in base units
- `customer_code` / `store_code` (STRING) - Customer/Store identifier
- `product_code` (STRING) - Product identifier
- `field_user_code` (STRING) - Sales person code
- `currency_code` (STRING) - Currency (defaults to 'AED')
- `trx_type` (STRING) - Transaction type ('Sales', 'Return', etc.)
- `price_used_level1` (DECIMAL) - Price used
- `discount_amount` (DECIMAL) - Discount applied
- `user_code` (STRING) - User who created transaction

**Usage:**
- **Dashboard KPIs**: Sales, Orders, Customers, Units
- **Sales Reports**: Daily sales, trends, performance
- **Product Analysis**: Product-wise sales data
- **Store Performance**: Store-wise analysis

---

#### `flat_customers_master`
> **Customer/Store master data for filtering and joins**

**Key Columns:**
- `customer_code` (STRING) - Primary key
- `customer_name` (STRING) - Store/Customer name
- `state` (STRING) - State/Region for geographic filtering
- `city` (STRING) - City for geographic filtering
- `sales_person_code` (STRING) - Assigned salesperson
- `customer_type` (STRING) - Chain/Type classification
- `city_code` (STRING) - City code
- `region_code` (STRING) - Region code
- `chain_name` (STRING) - Chain classification

**Usage:**
- **Geographic Filtering**: Region, City filters
- **Hierarchy Filtering**: Team Leader, Field User filters
- **Business Filtering**: Chain, Store type filters
- **KPI Calculations**: Customer count, geographic analysis

---

### 2. **Operational Data Tables**

#### `flat_store_visits`
> **Store visit tracking and field operations**

**Key Columns:**
- `visit_date` (DATE) - Visit date
- `store_code` (STRING) - Store visited
- `field_user_code` (STRING) - Visiting salesperson
- `arrival_time` (TIME) - Check-in time
- `out_time` (TIME) - Check-out time
- `total_time_mins` (INTEGER) - Duration
- `visit_status` (STRING) - Visit outcome
- `visit_purpose` (STRING) - Purpose of visit
- `latitude`, `longitude` (DECIMAL) - GPS coordinates

**Usage:**
- **Field Operations Report**: Visit tracking
- **User Performance**: Visit efficiency
- **Store Analytics**: Visit frequency analysis

---

#### `flat_attendance_daily`
> **Daily attendance tracking**

**Key Columns:**
- `attendance_date` (DATE) - Attendance date
- `user_code` (STRING) - Employee code
- `user_name` (STRING) - Employee name
- `attendance_status` (STRING) - Present/Absent/Leave
- `check_in_time` (TIME) - Check-in time
- `check_out_time` (TIME) - Check-out time
- `working_hours` (DECIMAL) - Hours worked
- `leave_type` (STRING) - Type of leave

**Usage:**
- **Attendance Reports**: Daily attendance tracking
- **User Performance**: Working hours analysis
- **HR Analytics**: Leave patterns, efficiency

---

#### `flat_stock_checks`
> **Stock level monitoring**

**Key Columns:**
- `check_date` (DATE) - Stock check date
- `store_code` (STRING) - Store checked
- `product_code` (STRING) - Product checked
- `on_hand_qty` (DECIMAL) - Current stock
- `on_order_qty` (DECIMAL) - Ordered quantity
- `stock_status` (STRING) - Stock status
- `shelf_presence` (STRING) - Shelf availability

**Usage:**
- **Stock Reports**: Inventory analysis
- **Out-of-Stock Reports**: Stock availability
- **Product Performance**: Stock vs sales correlation

---

#### `flat_targets`
> **Sales targets and achievements**

**Key Columns:**
- `target_year`, `target_month` (INTEGER) - Target period
- `field_user_code` (STRING) - Salesperson
- `customer_code` (STRING) - Target customer
- `target_amount` (DECIMAL) - Sales target
- `target_quantity` (DECIMAL) - Quantity target
- `achieved_value` (DECIMAL) - Achievement (calculated)
- `achievement_percentage` (DECIMAL) - Achievement % (calculated)

**Usage:**
- **Target Reports**: Target vs achievement
- **Performance Analysis**: User performance tracking
- **Dashboard KPIs**: Achievement metrics

---

### 3. **Analytics & Optimization Tables**

#### `flat_dashboard_kpi` (Potential)
> **Pre-calculated KPI values for performance**

#### `flat_sales_trend_optimized` (Potential)
> **Pre-calculated trend data**

#### `flat_customer_analytics` (Analytics)
> **Customer analytics with rankings**

#### `flat_product_analytics` (Analytics)
> **Product performance analytics**

---

## 🔄 Data Flow Analysis

### Dashboard KPI Flow
```
flat_transactions (main data) 
    ↓ JOIN
flat_customers_master (filters)
    ↓ AGGREGATE
KPI Calculations (Sales, Orders, Customers, Units)
    ↓ API
Dashboard Components
```

### Sales Reports Flow
```
flat_sales_transactions (transaction data)
    ↓ FILTER (date, user, store, product)
Aggregated Results (by period/dimension)
    ↓ API
Report Components (Charts, Tables)
```

### Field Operations Flow
```
flat_store_visits + flat_attendance_daily
    ↓ JOIN WITH USER DATA
Field Performance Metrics
    ↓ API
Operations Dashboard
```

---

## 🎯 Frontend Mapping

### Dashboard Components Requiring Updates

#### 1. **KPI Cards** (`DynamicKPICards.tsx`)
**Data Source:** `flat_transactions` + `flat_customers_master`
**Required Updates:**
- ✅ Already optimized with proper queries
- ✅ Handles transaction types correctly
- ✅ Proper currency handling (AED)

#### 2. **Sales Charts** (`SalesChart.tsx`)
**Data Source:** `flat_sales_transactions`
**Required Updates:**
- Ensure date formatting matches `trx_date_only` field
- Handle different transaction types
- Currency consistency

#### 3. **Filter Components** (`DashboardFilters.tsx`)
**Data Source:** Multiple tables for filter options
**Required Updates:**
```typescript
// Update filter options API calls
const filterOptions = {
  regions: await query(`SELECT DISTINCT state as value, state as label FROM flat_customers_master WHERE state IS NOT NULL`),
  cities: await query(`SELECT DISTINCT city as value, city as label FROM flat_customers_master WHERE city IS NOT NULL`),
  users: await query(`SELECT DISTINCT field_user_code as value, field_user_name as label FROM flat_sales_transactions`),
  stores: await query(`SELECT DISTINCT store_code as value, store_name as label FROM flat_sales_transactions`),
  products: await query(`SELECT DISTINCT product_code as value, product_name as label FROM flat_sales_transactions`)
}
```

### Report Components Requiring Updates

#### 1. **Daily Sales Report** (`DailyStockSaleReport.tsx`)
**Data Source:** `flat_sales_transactions`
**Required Updates:**
- ✅ Fixed totalQuantity error with optional chaining
- Update field mappings to match actual table columns
- Ensure date range filtering uses `trx_date_only`

#### 2. **Product Analysis** (`ProductAnalysis.tsx`)
**Data Source:** `flat_sales_transactions` + `flat_product_analytics`
**Required Updates:**
```typescript
// Update product queries to use correct fields
const productQuery = `
  SELECT 
    product_code,
    product_name,
    product_group_level1 as category,
    SUM(net_amount) as total_sales,
    SUM(quantity) as total_quantity,
    COUNT(DISTINCT trx_code) as total_orders
  FROM flat_sales_transactions
  WHERE trx_date_only >= $1 AND trx_date_only <= $2
  GROUP BY product_code, product_name, product_group_level1
`
```

#### 3. **Customer Reports** (`CustomersReport.tsx`)
**Data Source:** `flat_customers_master` + `flat_sales_transactions`
**Required Updates:**
```typescript
// Update customer analysis queries
const customerQuery = `
  SELECT 
    c.customer_code,
    c.customer_name,
    c.city,
    c.state,
    c.customer_type,
    SUM(t.net_amount) as total_sales,
    COUNT(DISTINCT t.trx_code) as total_orders,
    AVG(t.net_amount) as avg_order_value
  FROM flat_customers_master c
  LEFT JOIN flat_sales_transactions t ON c.customer_code = t.store_code
  WHERE t.trx_date_only >= $1 AND t.trx_date_only <= $2
  GROUP BY c.customer_code, c.customer_name, c.city, c.state, c.customer_type
`
```

---

## 🔧 Critical Database Fixes Needed

### 1. **Column Name Consistency**
Some services use different column names for the same data:
- `customer_code` vs `store_code`
- `trx_code` vs `transaction_code`
- `field_user_code` vs `user_code`

**Fix:** Standardize column references in services

### 2. **Date Field Usage**
- Use `trx_date_only` for date filtering (not `transaction_date`)
- Ensure timezone handling is consistent

### 3. **Transaction Type Handling**
- Properly separate Sales vs Returns in calculations
- Handle different `trx_type` values correctly

### 4. **Currency Standardization**
- Ensure all tables use consistent currency codes
- Default to 'AED' where currency is null

---

## 🚀 Performance Optimizations

### Required Indexes
```sql
-- Core transaction queries
CREATE INDEX idx_sales_transactions_date_store ON flat_sales_transactions(trx_date_only, store_code);
CREATE INDEX idx_sales_transactions_user_date ON flat_sales_transactions(field_user_code, trx_date_only);
CREATE INDEX idx_sales_transactions_product_date ON flat_sales_transactions(product_code, trx_date_only);

-- Customer filtering
CREATE INDEX idx_customers_state_city ON flat_customers_master(state, city);
CREATE INDEX idx_customers_salesperson ON flat_customers_master(sales_person_code);

-- Visit tracking
CREATE INDEX idx_visits_date_user ON flat_store_visits(visit_date, field_user_code);

-- Attendance tracking
CREATE INDEX idx_attendance_date_user ON flat_attendance_daily(attendance_date, user_code);
```

### Query Optimizations
1. **Use COALESCE()** for null handling
2. **Proper JOIN types** (LEFT JOIN for optional data)
3. **Date range filtering** on indexed date columns
4. **Limit result sets** with pagination
5. **Use CTEs** for complex aggregations

---

## 📋 Action Items for Frontend Development

### Immediate Actions (High Priority)

1. **✅ COMPLETED**: Fix KPI calculations in dashboard
2. **✅ COMPLETED**: Fix totalQuantity error in DailyStockSaleReport
3. **🔄 IN PROGRESS**: Standardize column name usage across all services

### Short Term (Medium Priority)

4. **Update all filter APIs** to use correct table/column names
5. **Standardize date handling** across all components
6. **Add proper error handling** for missing data
7. **Implement caching** for filter options

### Long Term (Low Priority)

8. **Create materialized views** for complex aggregations
9. **Add data validation** in API layers
10. **Implement real-time updates** for live data

---

## 🧪 Testing Database Schema

Use the provided `DATABASE_SCHEMA_EXPLORER.js` script to:

1. **Explore all tables** and their structures
2. **Verify data availability** for date ranges
3. **Test filter combinations** 
4. **Validate column names** and data types
5. **Check data quality** and consistency

```bash
# Run database exploration
node DATABASE_SCHEMA_EXPLORER.js
```

This will generate a complete `DATABASE_SCHEMA_REPORT.md` with actual table structures and sample data.

---

## 📊 Summary

The NFPC database is well-structured with flat tables optimized for reporting. The main areas requiring attention are:

1. **✅ KPI calculations** - Already fixed and optimized
2. **🔄 Column name consistency** - Needs standardization
3. **📊 Report queries** - Need updates to match actual schema
4. **🚀 Performance** - Needs proper indexing
5. **🔒 Data quality** - Needs validation and error handling

The database contains rich sales, operational, and analytical data that can support comprehensive dashboards and reports once properly mapped to the frontend components.
