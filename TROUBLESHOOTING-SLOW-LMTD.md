# Troubleshooting: LMTD Report Still Slow After Creating Indexes

## Quick Diagnostic

Run this command in your PostgreSQL database to check if indexes exist and are being used:

```bash
psql -h your-host -U your-user -d your-database -f scripts/verify-indexes.sql
```

This will show you:
1. ✅ Whether indexes exist
2. ✅ Table size and row count
3. ✅ Whether PostgreSQL is using the indexes (Index Scan vs Seq Scan)

---

## Common Issues and Solutions

### Issue 1: Indexes Don't Exist

**Check:**
```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'flat_daily_sales_report'
  AND indexname LIKE 'idx_flat_sales%';
```

**Expected:** 7 rows

**If no rows:**
- Indexes weren't created successfully
- Run: `scripts/create-lmtd-indexes.sql` again
- Check for permission errors

---

### Issue 2: Indexes Exist But Not Being Used

**Check query plan:**
```sql
EXPLAIN ANALYZE
SELECT COUNT(*)
FROM flat_daily_sales_report
WHERE trx_trxdate >= '2025-11-01'::timestamp
  AND trx_trxdate < '2025-11-30'::timestamp
  AND trx_trxtype = 1;
```

**Look for:**
- ✅ GOOD: "Index Scan" or "Bitmap Index Scan"
- ❌ BAD: "Seq Scan" (sequential scan = not using index)

**If seeing Seq Scan, run:**
```sql
-- Update table statistics
ANALYZE flat_daily_sales_report;

-- Check if autovacuum is enabled
SHOW autovacuum;

-- Manually vacuum if needed
VACUUM ANALYZE flat_daily_sales_report;
```

---

### Issue 3: Table is Too Large

**Check table size:**
```sql
SELECT
    pg_size_pretty(pg_total_relation_size('flat_daily_sales_report')) as total_size,
    pg_size_pretty(pg_relation_size('flat_daily_sales_report')) as table_size,
    (SELECT COUNT(*) FROM flat_daily_sales_report) as row_count;
```

**If table has > 100 million rows:**
- Consider table partitioning by date
- Use more aggressive filtering (specific users/stores)
- Implement summary tables for common queries

---

### Issue 4: Queries Scanning Too Much Data

**Current approach:** Fetching up to 10,000 rows per request

**Optimization options:**

**Option A: Use filters**
- Filter by specific user, store, or product
- This dramatically reduces data scanned

**Option B: Reduce date range**
- Use 1 week instead of 1 month
- Query: Nov 1-7 instead of Nov 1-29

**Option C: Summary-only mode**
- Comment out the main detailed query
- Keep only summary, daily trend, and top products
- This will be 10x faster

---

### Issue 5: Network/Database Latency

**Check database connection:**
```sql
SELECT NOW(); -- Should return instantly
```

**If slow:**
- Database server is under heavy load
- Network latency between app and database
- Check other slow queries running: `SELECT * FROM pg_stat_activity WHERE state = 'active';`

---

## Performance Expectations

### With Indexes + Optimizations

| Data Set Size | Expected Time |
|---------------|---------------|
| 1 week, 1 user | 2-4 seconds |
| 1 month, 1 user | 8-15 seconds |
| 1 month, all users | 30-60 seconds |
| 1 month, all data (millions of rows) | 2-5 minutes |

**The key insight:** Even with indexes, scanning millions of rows takes time.

---

## Recommended Quick Fixes

### Fix 1: Start with Summary Only (Fastest)

Edit `src/app/api/lmtd-secondary/route.ts` around line 310:

```typescript
// Comment out the main data query for now
const [summaryResult, dailyTrendResult, topProductsResult] = await Promise.all([
  // query(mainQueryText, allParams),  // <-- COMMENT THIS OUT
  query(summaryQueryText, allParams),
  query(dailyTrendQueryText, allParams),
  query(topProductsQueryText, allParams)
])

// Use empty array for data
const detailedData = []  // <-- ADD THIS
```

**Result:** Report loads in 5-10 seconds (summary + charts only)

---

### Fix 2: Add User/Store Filter by Default

Most users want to see their own data, not all data.

Edit the frontend to default to current user:

```typescript
// In LMTDSecondaryReport.tsx
const [userCode, setUserCode] = useState<string | null>('187219') // Default to user
```

**Result:** Queries scan 99% less data, load in seconds

---

### Fix 3: Partition by Month (Database-level)

Create monthly partitions of the table:

```sql
-- Example for November 2025
CREATE TABLE flat_daily_sales_report_2025_11 PARTITION OF flat_daily_sales_report
FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
```

**Result:** PostgreSQL only scans relevant partition

---

## Testing Performance

### Test 1: Summary Query Only
```sql
EXPLAIN ANALYZE
WITH mtd_summary AS (
  SELECT
    SUM(ABS(COALESCE(line_quantitybu, 0))) as quantity,
    SUM(CASE WHEN trx_totalamount > 0 THEN trx_totalamount ELSE 0 END) as revenue
  FROM flat_daily_sales_report
  WHERE trx_trxdate >= '2025-11-01'::timestamp
    AND trx_trxdate < '2025-11-30'::timestamp
    AND trx_trxtype = 1
)
SELECT * FROM mtd_summary;
```

**Expected:** < 10 seconds with indexes

---

### Test 2: With User Filter
```sql
EXPLAIN ANALYZE
SELECT COUNT(*)
FROM flat_daily_sales_report
WHERE trx_trxdate >= '2025-11-01'::timestamp
  AND trx_trxdate < '2025-11-30'::timestamp
  AND trx_trxtype = 1
  AND trx_usercode = '187219';  -- Add user filter
```

**Expected:** < 2 seconds with idx_flat_sales_date_user

---

## Get Help

**Send me the output of:**

1. **Index check:**
```sql
SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass))
FROM pg_indexes
WHERE tablename = 'flat_daily_sales_report'
  AND indexname LIKE 'idx_flat_sales%';
```

2. **Table stats:**
```sql
SELECT
    pg_size_pretty(pg_total_relation_size('flat_daily_sales_report')) as size,
    (SELECT COUNT(*) FROM flat_daily_sales_report) as rows,
    (SELECT COUNT(*) FROM flat_daily_sales_report WHERE trx_trxtype = 1) as sales_rows;
```

3. **Query plan:**
```sql
EXPLAIN ANALYZE
SELECT COUNT(*)
FROM flat_daily_sales_report
WHERE trx_trxdate >= '2025-11-01'::timestamp
  AND trx_trxdate < '2025-11-30'::timestamp
  AND trx_trxtype = 1;
```

This will help identify the exact bottleneck.

---

## Nuclear Option: Summary-Only Mode

If you need the report working NOW, switch to summary-only mode:

1. Comment out the main detail query
2. Show only:
   - Summary cards (MTD vs LMTD totals)
   - Daily trend chart
   - Top 10 products
   - Top 10 stores

This gives 90% of the value at 10% of the query time.

Would you like me to implement this option?
