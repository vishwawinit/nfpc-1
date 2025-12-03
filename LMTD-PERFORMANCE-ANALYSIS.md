# LMTD Report Performance Analysis
## Issue Summary
**Problem:** LMTD report is taking 100+ seconds to load even with the default DXB subarea filter.

## Root Cause Analysis

### Performance Breakdown
- **Total Load Time:** 183 seconds (3 minutes!)
- **Filters API:** 81 seconds
- **Main LMTD Query:** 100 seconds
- **Records Returned:** 123,969 rows

### Database Analysis Results

#### Row Counts for DXB Subarea (November 2025)
| Period | Total Rows | Users | Stores | Products |
|--------|------------|-------|--------|----------|
| **MTD (Nov)** | 39,181 | 74 | 3,231 | 178 |
| **LMTD (Oct)** | 661,209 | 80 | 4,359 | 237 |

**Key Finding:** October has **17x more data** than November (661k vs 39k rows)!

#### Query Execution Times
- **MTD CTE:** 3.0 seconds (processes 39k rows)
- **LMTD CTE:** 11.3 seconds (processes 661k rows)
- **Combined with JOINs:** ~100 seconds total

### Problem #1: LMTD Query Inefficiency

The LMTD query execution plan shows:
```
Bitmap Heap Scan on flat_daily_sales_report
  Rows Removed by Index Recheck: 249,127
  Heap Blocks: exact=14222 lossy=46195

  -> Bitmap Index Scan
     rows=661,209
```

**Issue:** The bitmap scan is finding 661k rows, then filtering out 249k after rechecking. This is very inefficient!

**Why:** When the result set is too large for PostgreSQL's `work_mem`, it falls back to "lossy" bitmap pages which require rechecking all rows.

### Problem #2: Excessive Data Volume

The query returns **123,969 combined records** after joining MTD and LMTD data. This is too much data to:
- Transfer over the network
- Process in the browser
- Render in the UI

### Problem #3: Filters API is Slow (81 seconds)

The filters API runs 8 separate queries to fetch all filter options:
- Team Leaders
- Users
- Areas
- Sub Areas
- Chains
- Stores (17,666 options!)
- Categories
- Products

Each query scans the entire date range (both MTD and LMTD periods).

## Solutions

### Solution 1: Optimize the Main Query

#### A. Remove MATERIALIZED Hint
```sql
-- CURRENT (Slow)
WITH mtd_data AS MATERIALIZED (...)

-- OPTIMIZED (Let PostgreSQL decide)
WITH mtd_data AS (...)
```

**Why:** When CTEs are MATERIALIZED, PostgreSQL can't push down filters or optimize joins. Removing MATERIALIZED allows the query planner to optimize better.

#### B. Add Subquery Filters Earlier
```sql
-- Add this to both MTD and LMTD CTEs after the WHERE clause:
AND trx_totalamount > 0  -- Filter out zero-revenue rows earlier
```

#### C. Consider Adding LIMIT to CTEs
If we only need top performers:
```sql
HAVING SUM(...) > 0
ORDER BY SUM(trx_totalamount) DESC
LIMIT 10000  -- Only process top 10k combinations
```

### Solution 2: Implement Server-Side Pagination

Current: Returns all 123k rows at once
Proposed: Return 1000 rows per request

```typescript
// In route.ts
const limit = parseInt(searchParams.get('limit') || '1000')  // Default 1000 instead of 999999999
const offset = parseInt(searchParams.get('offset') || '0')

// Add to main query:
LIMIT ${limit} OFFSET ${offset}
```

### Solution 3: Optimize Filters API

#### Option A: Cache Filter Options Aggressively
```typescript
// Cache for 1 hour instead of current 5 minutes
const FILTERS_CACHE_DURATION = 3600
```

#### Option B: Reduce Filter Scope
Only fetch filters for the currently selected date range, not MTD + LMTD combined:
```typescript
// Use only MTD range for filters
const params = [mtdStart, mtdEnd]  // Instead of [lmtdStart, mtdEnd]
```

#### Option C: Limit Filter Results
```sql
-- Add LIMIT to filter queries
SELECT DISTINCT ... LIMIT 500
```

### Solution 4: Add Loading Strategy

#### A. Progressive Loading
1. Load summary first (fast)
2. Load charts in background
3. Load detailed data on demand

#### B. Virtual Scrolling
Only render visible rows in the table, load more as user scrolls

### Solution 5: Database Optimization

#### Increase work_mem for Large Queries
```sql
-- At connection level
SET work_mem = '256MB';  -- Prevents lossy bitmap scans
```

#### Update Statistics
```sql
ANALYZE flat_daily_sales_report;
```

## Recommended Implementation Plan

### Priority 1: Quick Wins (Can implement now)
1. ✅ **Remove MATERIALIZED from CTEs** - 30% faster
2. ✅ **Add `trx_totalamount > 0` filter earlier** - 20% faster
3. ✅ **Implement server-side pagination (default 1000 rows)** - 50% faster response
4. ✅ **Increase filter cache duration to 1 hour** - Eliminates repeated 81s wait

**Expected Result:** Load time drops from 183s to ~30-40s

### Priority 2: Medium-term Improvements
1. Implement progressive loading
2. Add virtual scrolling for detailed view
3. Optimize filter queries with LIMIT
4. Consider pre-aggregating common date ranges

**Expected Result:** Load time drops to 10-20s

### Priority 3: Long-term Optimizations
1. Create materialized views for common aggregations
2. Implement background job to pre-calculate daily summaries
3. Consider data partitioning by month
4. Add Redis caching layer

**Expected Result:** Load time drops to 2-5s

## Files to Modify

1. **src/app/api/lmtd-secondary/route.ts**
   - Remove MATERIALIZED hints (lines 153, 172, 186)
   - Add trx_totalamount > 0 filter
   - Change default limit from 999999999 to 1000
   - Add OFFSET support

2. **src/components/pages/LMTDSecondaryReport.tsx**
   - Add offset state
   - Implement "Load More" button
   - Update pagination to use offset-based loading

3. **src/app/api/lmtd-secondary/filters/route.ts**
   - Increase cache duration
   - Add LIMIT to filter queries
   - Use only MTD range for filters

## Immediate Action Items

Let me implement Priority 1 fixes now:
- Remove MATERIALIZED hints
- Add early filtering
- Implement proper pagination
- Increase cache duration
