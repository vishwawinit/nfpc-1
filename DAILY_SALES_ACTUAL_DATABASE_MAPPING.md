# Daily Sales Report - ACTUAL Database Field Mapping

## ⚠️ IMPORTANT DISCOVERY

The database uses a **SINGLE FLAT TABLE** instead of normalized tables!

**Table Name:** `flat_daily_sales_report`
**Total Columns:** 84
**Total Rows:** 1,933,302
**Database:** `flat_nfpc_test` on PostgreSQL

---

## Database Structure

### Actual Table: `flat_daily_sales_report`

This is a denormalized flat table that combines transaction headers, line items, customer data, user data, product data, route data, and geographic data into a single table.

**Column Organization:**
- **Transaction Fields** (trx_*): 20 columns - Order/transaction header information
- **Line Item Fields** (line_*): 16 columns - Product line item details
- **Customer Fields** (customer_*): 27 columns - Store/customer information
- **User Fields** (user_*): 5 columns - Field user/salesman information
- **Item/Product Fields** (item_*): 7 columns - Product details
- **Route Fields** (route_*): 5 columns - Route and team leader information
- **Geographic Fields** (city_*, region_*, warehouse_*): 5 columns - Location data
- **System Fields** (sync_*): 2 columns - Sync timestamps

---

## Daily Sales Report Field Mapping

### Summary KPI Cards

| UI Field | Database Column | Data Type | Calculation | Notes |
|----------|----------------|-----------|-------------|-------|
| **Total Sales (Net)** | `trx_totalamount` | DOUBLE | `SUM(trx_totalamount) WHERE trx_trxtype = 1` | Net sales amount |
| **Gross Sales** | `trx_totalamount` | DOUBLE | `SUM(trx_totalamount) WHERE trx_trxtype = 1 AND trx_totalamount > 0` | Positive sales only |
| **Total Discount** | `trx_totaldiscountamount` | DOUBLE | `SUM(trx_totaldiscountamount)` | Header-level discounts |
| **Total Orders** | `trx_trxcode` | VARCHAR(50) | `COUNT(DISTINCT trx_trxcode)` | Unique transactions |
| **Average Order Value** | Calculated | - | `SUM(trx_totalamount) / COUNT(DISTINCT trx_trxcode)` | - |
| **Total Quantity** | `line_quantitybu` | DOUBLE | `SUM(line_quantitybu)` | Base unit quantity |
| **Total Stores** | `customer_code` | VARCHAR(50) | `COUNT(DISTINCT customer_code)` | Unique customers |
| **Total Products** | `line_itemcode` | VARCHAR(50) | `COUNT(DISTINCT line_itemcode)` | Unique products |
| **Total Field Users** | `trx_usercode` | VARCHAR(50) | `COUNT(DISTINCT trx_usercode)` | Unique salesmen |
| **Currency Code** | `trx_currencycode` | VARCHAR(50) | `MAX(trx_currencycode)` | Default: 'AED' |

### Sample Query for Summary KPIs:
```sql
SELECT
  COUNT(DISTINCT trx_trxcode) as total_orders,
  COUNT(DISTINCT customer_code) as total_stores,
  COUNT(DISTINCT trx_usercode) as total_users,
  COUNT(DISTINCT line_itemcode) as total_products,
  COALESCE(SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END), 0) as gross_sales,
  COALESCE(SUM(trx_totaldiscountamount), 0) as total_discount,
  COALESCE(SUM(trx_totalamount), 0) as total_net_sales,
  COALESCE(SUM(line_quantitybu), 0) as total_quantity,
  COALESCE(MAX(trx_currencycode), 'AED') as currency_code
FROM flat_daily_sales_report
WHERE DATE(trx_trxdate) >= $1
  AND DATE(trx_trxdate) <= $2
  AND trx_trxtype = 1
```

---

### Daily Sales Trend Chart

| Chart Element | Database Column | Aggregation |
|---------------|----------------|-------------|
| **Date** | `trx_trxdate` | `DATE(trx_trxdate)` |
| **Sales** | `trx_totalamount` | `SUM(trx_totalamount) GROUP BY DATE(trx_trxdate)` |
| **Orders** | `trx_trxcode` | `COUNT(DISTINCT trx_trxcode) GROUP BY DATE(trx_trxdate)` |
| **Customers** | `customer_code` | `COUNT(DISTINCT customer_code) GROUP BY DATE(trx_trxdate)` |

### Sample Query for Trend:
```sql
SELECT
  DATE(trx_trxdate) as date,
  COUNT(DISTINCT trx_trxcode) as orders,
  COUNT(DISTINCT customer_code) as customers,
  COALESCE(SUM(trx_totalamount), 0) as sales
FROM flat_daily_sales_report
WHERE DATE(trx_trxdate) >= $1
  AND DATE(trx_trxdate) <= $2
  AND trx_trxtype = 1
GROUP BY DATE(trx_trxdate)
ORDER BY DATE(trx_trxdate) ASC
```

---

### Top Products Chart

| UI Field | Database Column | Data Type | Notes |
|----------|----------------|-----------|-------|
| **Product Code** | `line_itemcode` | VARCHAR(50) | Primary product identifier |
| **Product Name** | `line_itemdescription` or `item_description` | VARCHAR(100) | Product name |
| **Product Category** | `item_grouplevel1` | VARCHAR(50) | Top-level category |
| **Unit Price** | `line_baseprice` | DOUBLE | Price per unit |
| **Quantity** | `line_quantitybu` | DOUBLE | Quantity sold |
| **Net Sales** | Calculated | - | `line_baseprice * line_quantitybu - line_totaldiscountamount` |
| **Orders** | `trx_trxcode` | VARCHAR(50) | Count distinct per product |
| **Stores** | `customer_code` | VARCHAR(50) | Count distinct per product |

### Sample Query for Top Products:
```sql
SELECT
  line_itemcode as product_code,
  MAX(COALESCE(line_itemdescription, item_description)) as product_name,
  MAX(item_grouplevel1) as product_category,
  COUNT(DISTINCT trx_trxcode) as orders,
  COUNT(DISTINCT customer_code) as stores,
  COALESCE(SUM(line_quantitybu), 0) as quantity,
  COALESCE(SUM(line_baseprice * line_quantitybu), 0) as gross_sales,
  COALESCE(SUM(line_totaldiscountamount), 0) as discount,
  COALESCE(SUM(line_baseprice * line_quantitybu - COALESCE(line_totaldiscountamount, 0)), 0) as net_sales
FROM flat_daily_sales_report
WHERE DATE(trx_trxdate) >= $1
  AND DATE(trx_trxdate) <= $2
  AND trx_trxtype = 1
GROUP BY line_itemcode
ORDER BY net_sales DESC
LIMIT 10
```

---

### Top Stores Chart

| UI Field | Database Column | Data Type | Notes |
|----------|----------------|-----------|-------|
| **Store Code** | `customer_code` | VARCHAR(50) | Primary customer identifier |
| **Store Name** | `customer_description` | VARCHAR(200) | Customer name |
| **Region Code** | `customer_regioncode` | VARCHAR(50) | Region |
| **Region Name** | `region_description` | VARCHAR(200) | Region name |
| **City** | `city_description` | VARCHAR(200) | City name |
| **Net Sales** | `trx_totalamount` | DOUBLE | Sum per store |
| **Orders** | `trx_trxcode` | VARCHAR(50) | Count distinct per store |
| **Users** | `trx_usercode` | VARCHAR(50) | Count distinct per store |

### Sample Query for Top Stores:
```sql
SELECT
  customer_code as store_code,
  MAX(customer_description) as store_name,
  MAX(customer_regioncode) as region_code,
  MAX(region_description) as region_name,
  MAX(city_description) as city_name,
  COUNT(DISTINCT trx_trxcode) as orders,
  COUNT(DISTINCT trx_usercode) as users,
  COALESCE(SUM(trx_totalamount), 0) as net_sales
FROM flat_daily_sales_report
WHERE DATE(trx_trxdate) >= $1
  AND DATE(trx_trxdate) <= $2
  AND trx_trxtype = 1
GROUP BY customer_code
ORDER BY net_sales DESC
LIMIT 10
```

---

### Detailed Transaction Table

| Column Header | Database Column | Data Type | Notes |
|---------------|----------------|-----------|-------|
| **Transaction Code** | `trx_trxcode` | VARCHAR(50) | Format: orgcode_number |
| **Date** | `trx_trxdate` | TIMESTAMP | Transaction date/time |
| **Field User Code** | `trx_usercode` | VARCHAR(50) | Salesman code |
| **Field User Name** | `user_description` | VARCHAR(100) | Salesman name |
| **Field User Role** | `user_usertype` | VARCHAR(50) | Role (e.g., VanSales) |
| **TL Code** | `route_salesmancode` | VARCHAR(50) | Team leader code |
| **TL Name** | Via join/lookup | - | Team leader name (requires lookup) |
| **Region** | `customer_regioncode` or `region_description` | VARCHAR | Region code or name |
| **City** | `city_description` or `customer_citycode` | VARCHAR | City name or code |
| **Store Code** | `customer_code` | VARCHAR(50) | Customer code |
| **Store Name** | `customer_description` | VARCHAR(200) | Customer name |
| **Product Code** | `line_itemcode` | VARCHAR(50) | Product SKU |
| **Product Name** | `line_itemdescription` | VARCHAR(100) | Product description |
| **Quantity** | `line_quantitybu` | DOUBLE | Base unit quantity |
| **Unit Price** | `line_baseprice` | DOUBLE | Price per unit |
| **Total Amount** | Calculated | - | `line_baseprice * line_quantitybu` |
| **Route** | `trx_routecode` or `route_name` | VARCHAR | Route code/name |
| **Chain Type** | `customer_jdecustomertype` | VARCHAR(50) | Chain classification |

### Sample Query for Transaction Details:
```sql
SELECT
  trx_trxcode,
  DATE(trx_trxdate) as trx_date_only,
  trx_usercode as field_user_code,
  user_description as field_user_name,
  user_usertype as field_user_role,
  route_salesmancode as tl_code,
  customer_regioncode as region_code,
  region_description as region_name,
  city_description as city_name,
  customer_code as store_code,
  customer_description as store_name,
  line_itemcode as product_code,
  line_itemdescription as product_name,
  line_quantitybu as quantity,
  line_baseprice as unit_price,
  (line_baseprice * line_quantitybu) as line_amount,
  trx_routecode,
  route_name
FROM flat_daily_sales_report
WHERE DATE(trx_trxdate) >= $1
  AND DATE(trx_trxdate) <= $2
  AND trx_trxtype = 1
ORDER BY trx_trxdate DESC, trx_trxcode
LIMIT $3 OFFSET $4
```

---

## Filter Mappings

### Available Filters

| Filter Name | Column(s) Used | Filter Logic |
|-------------|---------------|--------------|
| **Date Range** | `trx_trxdate` | `DATE(trx_trxdate) BETWEEN startDate AND endDate` |
| **Region Code** | `customer_regioncode` | `customer_regioncode = ?` |
| **City** | `city_description` or `customer_citycode` | `city_description = ? OR customer_citycode = ?` |
| **Field User Role** | `user_usertype` | `user_usertype = ?` |
| **Team Leader** | `route_salesmancode` | `route_salesmancode = ?` |
| **User Code** | `trx_usercode` | `trx_usercode = ?` |
| **Chain Name** | `customer_jdecustomertype` | `customer_jdecustomertype = ?` |
| **Store Code** | `customer_code` | `customer_code = ?` |
| **Route Code** | `trx_routecode` | `trx_routecode = ?` |

---

## Column Details by Category

### Transaction Fields (trx_*)

| Column | Type | Description | Sample Value |
|--------|------|-------------|--------------|
| `trx_trxcode` | VARCHAR(50) | Unique transaction ID | "00030_44100450" |
| `trx_orgcode` | VARCHAR(50) | Organization/warehouse code | "00030" |
| `trx_usercode` | VARCHAR(50) | Field user/salesman code | "142575" |
| `trx_clientcode` | VARCHAR(50) | Customer/store code | "101159" |
| `trx_trxdate` | TIMESTAMP | Transaction datetime | "2025-10-27 03:23:20" |
| `trx_trxtype` | INTEGER | Transaction type (1=Sale) | 1 |
| `trx_currencycode` | VARCHAR(50) | Currency | "AED" |
| `trx_paymenttype` | INTEGER | Payment method | 0 |
| `trx_totalamount` | DOUBLE | Net sales amount | 705.13 |
| `trx_totaldiscountamount` | DOUBLE | Total discount | 19.59 |
| `trx_totaltaxamount` | DOUBLE | Total tax (VAT) | 34.29 |
| `trx_status` | INTEGER | Transaction status | 2 |
| `trx_createdon` | TIMESTAMP | Creation timestamp | "2025-10-27 03:23:21" |
| `trx_trxstatus` | INTEGER | HTTP status-like code | 200 |
| `trx_lpocode` | VARCHAR(50) | Purchase order code | NULL |
| `trx_deliverynumber` | VARCHAR(50) | Delivery number | NULL |
| `trx_invoicenumber` | VARCHAR(50) | Invoice number | NULL |
| `trx_routecode` | VARCHAR(50) | Route code | "M83" |
| `trx_tripdate` | TIMESTAMP | Trip date | "2025-10-26 18:30:00" |

**Key Transaction Types:**
- `trx_trxtype = 1`: Sales
- `trx_trxtype != 1`: Returns/other

---

### Line Item Fields (line_*)

| Column | Type | Description | Sample Value |
|--------|------|-------------|--------------|
| `line_lineno` | INTEGER | Line number in transaction | 8 |
| `line_itemcode` | VARCHAR(50) | Product SKU | "MF10121" |
| `line_baseprice` | DOUBLE | Unit price | 4.35 |
| `line_uom` | VARCHAR(20) | Unit of measure | "PC" |
| `line_quantitybu` | DOUBLE | Quantity in base units | 1 |
| `line_quantitysu` | DOUBLE | Quantity in sales units | 0 |
| `line_taxpercentage` | DOUBLE | Tax % (VAT) | 5 |
| `line_totaldiscountpercentage` | DOUBLE | Discount % | 0 |
| `line_totaldiscountamount` | DOUBLE | Discount amount | 0 |
| `line_itemdescription` | VARCHAR(100) | Product name | "Slcd Brd SL White 600gm1x1" |
| `line_itemaltdescription` | VARCHAR(100) | Alt product name | "Slcd Brd SL White 600gm1x1" |
| `line_promoid` | NUMERIC | Promotion ID | 0.0 |
| `line_promotype` | VARCHAR(50) | Promotion type | NULL |
| `line_expirydate` | TIMESTAMP | Product expiry date | "2026-02-03" |
| `line_batchnumber` | VARCHAR(50) | Batch number | "B1" |
| `line_taxamount` | DOUBLE | Line tax amount | NULL |

**Calculations:**
- **Line Amount** = `line_baseprice * line_quantitybu`
- **Net Line Amount** = `line_baseprice * line_quantitybu - line_totaldiscountamount`

---

### Customer Fields (customer_*)

| Column | Type | Description | Sample Value |
|--------|------|-------------|--------------|
| `customer_code` | VARCHAR(50) | Customer/store code | "101159" |
| `customer_description` | VARCHAR(200) | Store name | "ADCOOP - S/M - M Zayed" |
| `customer_parentcode` | VARCHAR(50) | Parent customer | "195447" |
| `customer_citycode` | VARCHAR(200) | City code | NULL |
| `customer_regioncode` | VARCHAR(50) | Region code | "EAD" |
| `customer_isactive` | BOOLEAN | Active status | true |
| `customer_customerarabicname` | VARCHAR(400) | Arabic name | NULL |
| `customer_divisionname` | VARCHAR(200) | Division | NULL |
| `customer_groupname` | VARCHAR(200) | Group | NULL |
| `customer_subclassification` | VARCHAR(200) | Sub-classification | NULL |
| `customer_zone` | VARCHAR(200) | Zone | NULL |
| `customer_type` | VARCHAR(10) | Customer type | NULL |
| `customer_jdecustomertype` | VARCHAR(50) | Chain type (MT/GT) | "C" |
| `customer_contactpersonname` | VARCHAR(200) | Contact person | NULL |
| `customer_contactno1` | VARCHAR(50) | Phone 1 | NULL |
| `customer_contactno2` | VARCHAR(50) | Phone 2 | NULL |
| `customer_email` | VARCHAR(150) | Email | NULL |
| `customer_address1` | VARCHAR(200) | Address line 1 | "PO Box:833,Mina Center..." |
| `customer_address2` | VARCHAR(200) | Address line 2 | "Madinat Zayed Abu Dhabi" |
| `customer_address3` | VARCHAR(200) | Address line 3 | NULL |
| `customer_longitude` | DOUBLE | GPS longitude | 53.6940893 |
| `customer_latitude` | DOUBLE | GPS latitude | 23.654561 |
| `customer_routecode` | VARCHAR(50) | Assigned route | NULL |
| `customer_salesmancode` | VARCHAR(50) | Assigned salesman | NULL |
| `customer_alternatecode` | VARCHAR(50) | Alternate code | NULL |

---

### User Fields (user_*)

| Column | Type | Description | Sample Value |
|--------|------|-------------|--------------|
| `user_description` | VARCHAR(100) | User full name | "Kowser Molla" |
| `user_email` | VARCHAR(150) | Email | NULL |
| `user_mobileno` | VARCHAR(50) | Mobile number | "0554360814" |
| `user_isactive` | BOOLEAN | Active status | true |
| `user_usertype` | VARCHAR(50) | User role | "VanSales" |

**Common User Types:**
- VanSales
- Salesman
- TeamLeader
- Merchandiser

---

### Item/Product Fields (item_*)

| Column | Type | Description | Sample Value |
|--------|------|-------------|--------------|
| `item_description` | VARCHAR(100) | Product name | "Slcd Brd SL White 600gm1x1" |
| `item_grouplevel1` | VARCHAR(50) | Category level 1 | "NFPC" |
| `item_grouplevel2` | VARCHAR(50) | Category level 2 | "07" |
| `item_grouplevel3` | VARCHAR(50) | Category level 3 | "S11" |
| `item_grouplevel4` | VARCHAR(50) | Category level 4 | "C01" |
| `item_grouplevel5` | VARCHAR(50) | Category level 5 | "F01" |

---

### Route Fields (route_*)

| Column | Type | Description | Sample Value |
|--------|------|-------------|--------------|
| `route_name` | VARCHAR(200) | Route name | "M83 - TRF MILCO" |
| `route_salesmancode` | VARCHAR(50) | Team leader code | "142575" |
| `route_areacode` | VARCHAR(100) | Area code (Region) | "EAD" |
| `route_subareacode` | VARCHAR(100) | Sub-area code (City) | "TRF" |
| `route_isactive` | BOOLEAN | Active status | true |

---

### Geographic Fields

| Column | Type | Description | Sample Value |
|--------|------|-------------|--------------|
| `city_description` | VARCHAR(200) | City name | NULL |
| `region_description` | VARCHAR(200) | Region name | "EAD" |
| `region_isactive` | BOOLEAN | Region active status | true |
| `warehouse_description` | VARCHAR(400) | Warehouse name | NULL |
| `warehouse_isactive` | BOOLEAN | Warehouse active status | NULL |

---

### System Fields (sync_*)

| Column | Type | Description |
|--------|------|-------------|
| `sync_created_at` | TIMESTAMP | Record creation timestamp |
| `sync_updated_at` | TIMESTAMP | Record update timestamp |

---

## Performance Considerations

### Recommended Indexes for flat_daily_sales_report

Given this is a flat table with 1.9M rows, these indexes are CRITICAL:

```sql
-- Most critical - date filtering (used in 100% of queries)
CREATE INDEX idx_flat_daily_sales_date_type
ON flat_daily_sales_report(trx_trxdate, trx_trxtype);

-- Customer filtering
CREATE INDEX idx_flat_daily_sales_customer
ON flat_daily_sales_report(customer_code, trx_trxdate);

-- User filtering
CREATE INDEX idx_flat_daily_sales_user
ON flat_daily_sales_report(trx_usercode, trx_trxdate);

-- Product filtering
CREATE INDEX idx_flat_daily_sales_product
ON flat_daily_sales_report(line_itemcode, trx_trxdate);

-- Region filtering
CREATE INDEX idx_flat_daily_sales_region
ON flat_daily_sales_report(customer_regioncode, trx_trxdate);

-- Transaction code lookup
CREATE INDEX idx_flat_daily_sales_trxcode
ON flat_daily_sales_report(trx_trxcode);

-- Team leader filtering
CREATE INDEX idx_flat_daily_sales_teamleader
ON flat_daily_sales_report(route_salesmancode, trx_trxdate);
```

### Query Performance Tips

1. **Always filter by trx_trxtype = 1** to get sales only
2. **Use DATE(trx_trxdate)** for date filtering
3. **Use COUNT(DISTINCT)** for unique counts
4. **Aggregate at the query level** - no joins needed!
5. **LIMIT results** for large data sets

---

## Key Differences from Normalized Schema

| Normalized Approach | Flat Table Approach |
|---------------------|---------------------|
| Multiple tables with JOINs | Single table, no JOINs |
| tblTrxHeader + tblTrxDetail | All in flat_daily_sales_report |
| LEFT JOIN tblCustomer | customer_* columns already present |
| LEFT JOIN tblUser | user_* columns already present |
| LEFT JOIN tblItem | item_* columns already present |
| Complex JOIN queries | Simple SELECT with WHERE |
| Smaller storage, normalized | Larger storage, denormalized |

---

## Sample Data from Database

```json
{
  "trx_trxcode": "00030_44100450",
  "trx_trxdate": "2025-10-27T03:23:20.000Z",
  "trx_trxtype": 1,
  "trx_totalamount": 705.13,
  "trx_currencycode": "AED",
  "line_itemcode": "MF10121",
  "line_itemdescription": "Slcd Brd SL White 600gm1x1",
  "line_baseprice": 4.35,
  "line_quantitybu": 1,
  "customer_code": "101159",
  "customer_description": "ADCOOP - S/M - M Zayed",
  "customer_regioncode": "EAD",
  "user_description": "Kowser Molla",
  "user_usertype": "VanSales",
  "route_name": "M83 - TRF MILCO",
  "route_salesmancode": "142575",
  "region_description": "EAD"
}
```

---

## Migration Required

⚠️ **The current code is written for normalized tables (tblTrxHeader, tblTrxDetail, etc.) but the actual database uses a flat table!**

**Current Code Location:** `src/services/dailySalesService.ts`

**Required Changes:**
1. Update all queries to use `flat_daily_sales_report` instead of JOIN queries
2. Remove all JOIN logic - data is already denormalized
3. Update column names to use flat table naming (trx_*, line_*, customer_*, etc.)
4. Simplify queries - no need for complex JOINs
5. Update filter logic to work with flat table structure

---

## Document Information

- **Generated:** 2025-11-26
- **Database:** flat_nfpc_test (PostgreSQL)
- **Table:** flat_daily_sales_report
- **Row Count:** 1,933,302
- **Column Count:** 84
- **Report Component:** `src/components/pages/DailyStockSaleReport.tsx`
- **Service:** `src/services/dailySalesService.ts` (NEEDS UPDATE)
