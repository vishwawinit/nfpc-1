# Store User Visit Report - Dynamic Filters Implementation

## Overview
Created a dedicated, dynamic filtering system specifically for the Store User Visit Report. This replaces the generic dashboard filters with a specialized hook that provides dynamic, cascading filters tailored to store visit data.

## What Was Implemented

### 1. Custom Hook: `useStoreUserVisitFilters`
**Location:** `src/hooks/useStoreUserVisitFilters.ts`

**Features:**
- Dynamic filter fetching based on current selections
- Cascading filter logic (when you select an area, sub-areas update automatically)
- Real-time availability counts for each filter option
- Active filter count tracking
- Default date range (last month)
- Easy reset functionality

**Available Filters:**
- `startDate` / `endDate` - Date range filters
- `areaCode` - Geographic area/region filter
- `subAreaCode` - Sub-area/city filter
- `routeCode` - Route/TL code filter
- `teamLeaderCode` - Team leader filter
- `userCode` - Field user filter
- `storeCode` - Individual store filter
- `chainName` - Chain/brand filter
- `storeClass` - Store classification filter

**Cascading Logic:**
```
Area → Sub-Area → Route → Team Leader → Field User → Store
                          ↓
                        Chain
                          ↓
                     Store Class
```

When you change a higher-level filter, all dependent filters below it are automatically cleared and refreshed with relevant options.

### 2. Updated API Endpoint: `/api/store-visits/filters`
**Location:** `src/app/api/store-visits/filters/route.ts`

**Enhancements:**
- Returns filter options specific to store visits
- Includes visit counts for each option
- Includes store counts and user counts where relevant
- Provides summary statistics:
  - Total visits
  - Total unique users
  - Total unique stores
  - Total routes
  - Date range with days of data available

**Response Structure:**
```typescript
{
  success: true,
  data: {
    areas: [{ value, label, visitCount }],
    subAreas: [{ value, label, visitCount }],
    routes: [{ value, label, visitCount }],
    teamLeaders: [{ value, label, role }],
    fieldUsers: [{ value, label, visitCount, storeCount }],
    stores: [{ value, label, visitCount, userCount }],
    chains: [{ value, label, visitCount, storeCount }],
    storeClasses: [{ value, label, visitCount, storeCount }],
    summary: {
      totalVisits,
      totalUsers,
      totalStores,
      totalRoutes,
      dateRange: { min, max, daysWithData }
    }
  }
}
```

### 3. Updated Component: `StoreUserVisitReport`
**Location:** `src/components/pages/StoreUserVisitReport.tsx`

**Changes:**
- Now uses `useStoreUserVisitFilters` instead of generic dashboard filters
- Query params are built dynamically from all active filters
- Filter panel shows all relevant filter options:
  - Area Filter ✓
  - Sub-Area Filter ✓
  - Route Filter ✓
  - Team Leader Filter ✓
  - Field User Filter ✓
  - Store Filter ✓
  - Chain Filter ✓
  - Store Class Filter ✓

## How It Works

### 1. Initial Load
```
Component Mounts
     ↓
Hook initializes with default date range (last month)
     ↓
API fetches all available filter options
     ↓
Filters displayed to user
```

### 2. Filter Selection
```
User selects Area "UAE"
     ↓
Hook updates areaCode filter
     ↓
Hook clears dependent filters (subArea, route, user, store)
     ↓
API re-fetches options with area filter applied
     ↓
Sub-areas dropdown now shows only sub-areas in UAE
     ↓
Visit count shown next to each option (e.g., "Dubai (234 visits)")
```

### 3. Data Fetching
```
User selects filters
     ↓
queryParams automatically built from all active filters
     ↓
/api/store-visits called with all query params
     ↓
Filtered visit data returned and displayed
```

## Key Benefits

### 1. **Dynamic & Context-Aware**
- Filter options update based on current selections
- Only shows relevant, available options
- Displays visit counts for each option

### 2. **Intelligent Cascading**
- Selecting a region automatically updates available cities
- Selecting a route updates available users
- No invalid filter combinations possible

### 3. **Performance Optimized**
- Uses `useMemo` and `useCallback` to prevent unnecessary re-renders
- API responses are cached
- Only fetches when filters actually change

### 4. **Type-Safe**
- Full TypeScript support
- Well-defined interfaces for all data structures
- Compile-time validation

### 5. **User-Friendly**
- Shows active filter count
- Easy reset to defaults
- Date range presets (today, yesterday, this week, last month, etc.)
- Visual feedback for loading states

## Usage Example

```typescript
// In a component
const {
  filters,              // Current filter values
  filterOptions,        // Available options for each filter
  loading,              // Is fetching filter options?
  error,                // Any error messages
  updateFilter,         // Function to update a single filter
  setDateRange,         // Function to set date range
  resetFilters,         // Reset all filters to defaults
  getQueryParams,       // Get URLSearchParams for API calls
  activeFilterCount,    // Number of non-date filters active
  summary              // Summary statistics
} = useStoreUserVisitFilters()

// Update a filter
updateFilter('areaCode', 'UAE')

// Set date range
setDateRange('2024-01-01', '2024-01-31')

// Reset all filters
resetFilters()

// Get query params for API call
const params = getQueryParams()
fetch(`/api/store-visits?${params}`)
```

## Filter Availability Logic

Each filter option shows how many visits match that filter:

```
Areas:
  - UAE (1,234 visits)
  - Saudi Arabia (567 visits)

Sub-Areas (when UAE selected):
  - Dubai (890 visits)
  - Abu Dhabi (344 visits)

Routes (when Dubai selected):
  - Route A (234 visits)
  - Route B (178 visits)
```

If a filter has **0 visits**, it's hidden from the dropdown (except if it's currently selected).

## Database Query Optimization

The filter API uses efficient SQL queries with:
- **Materialized CTEs** for better performance
- **Indexed columns** for fast filtering
- **Parallel queries** using Promise.all()
- **COUNT aggregations** for visit/store counts
- **DISTINCT** to get unique values only

## API Cache Strategy

- **Client-side cache**: 5 minutes (via `clientCache`)
- **API cache**: Uses `apiCache` for server-side caching
- **Cache key**: Unique combination of all filter parameters
- **Invalidation**: Automatic when filter combination changes

## Future Enhancements

Potential additions:
1. **Save Filter Presets** - Allow users to save commonly used filter combinations
2. **Export Filters** - Export current filter state as URL or JSON
3. **Advanced Date Filters** - Custom date ranges, fiscal periods
4. **Multi-Select Filters** - Select multiple stores, users, or chains at once
5. **Filter Analytics** - Show which filters are most commonly used

## Testing

To test the implementation:

1. **Navigate to Store User Visit Report**
2. **Select date range** - Choose "Last Month" preset
3. **Select area** - Pick a region, watch sub-areas update
4. **Select sub-area** - See routes filter update
5. **Select route** - See field users filter update
6. **Observe visit counts** - Each option shows number of visits
7. **Check query results** - Table updates with filtered data
8. **Reset filters** - Click reset, all return to defaults

## Troubleshooting

**Issue: Filters not loading**
- Check browser console for API errors
- Verify database connection
- Check that `flat_store_visits` table exists

**Issue: Filters not cascading**
- Verify `updateFilter` is being called
- Check browser console for errors in hook logic

**Issue: No data in dropdowns**
- Verify date range has data
- Check database has visits in selected period
- Verify filter conditions aren't too restrictive

## Technical Details

**Dependencies:**
- React hooks (useState, useEffect, useCallback, useMemo)
- PostgreSQL database
- Next.js API routes
- TypeScript

**Database Schema:**
Uses `flat_store_visits` table with columns:
- `visit_date`, `region_code`, `city_code`, `tl_code`
- `field_user_code`, `store_code`, `chain_code`, `chain_name`
- `store_class`, and other visit-related fields

---

**Created:** December 2025
**Author:** Claude Code Assistant
**Version:** 1.0
