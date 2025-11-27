# Target vs Achievement Report - Final Setup Guide

## ✅ What Has Been Done

I've updated the Target vs Achievement Report to use **tblCommonTarget** table for storing targets and **tblTrxHeader** table for calculating achievements.

### Files Modified:
1. ✅ `src/app/api/targets/route.ts` - Updated to use tblCommonTarget
2. ✅ `src/app/api/targets/filters/route.ts` - Updated to use tblCommonTarget
3. ✅ `create_targets_table.sql` - SQL script to create the table
4. ✅ `CREATE_TARGETS_TABLE_INSTRUCTIONS.md` - Step-by-step setup guide

## 🔧 How It Works Now

### Data Flow:
1. **Targets** → Stored in `tblCommonTarget` table (manual entry)
2. **Achievements** → Calculated from `tblTrxHeader` (actual sales)
3. **Achievement %** → (Achievement / Target) × 100

### API Logic:
```sql
-- Get targets from tblCommonTarget
SELECT TargetAmount FROM tblCommonTarget
WHERE TargetYear = 2025 AND TargetMonth = 11

-- Calculate achievements from tblTrxHeader
SELECT SUM(TotalAmount) as AchievementAmount
FROM tblTrxHeader
WHERE YEAR(TrxDate) = 2025 AND MONTH(TrxDate) = 11

-- Join and calculate percentage
Achievement % = (AchievementAmount / TargetAmount) × 100
```

## 📋 What You Need to Do

### Step 1: Create the tblCommonTarget Table

**Option A: Using SQL Script**
```bash
psql -h your_host -U your_username -d your_database -f create_targets_table.sql
```

**Option B: Using pgAdmin**
1. Open pgAdmin
2. Connect to your database
3. Open Query Tool
4. Load `create_targets_table.sql`
5. Execute (F5)

### Step 2: Add Target Data

After creating the table, you need to populate it with targets. You have three options:

#### Option 1: Manual Insert (Sample)
```sql
INSERT INTO "tblCommonTarget" (
    "TargetYear", "TargetMonth", "TargetPeriod",
    "UserCode", "CustomerCode", "TargetAmount",
    "TargetType", "TargetLevel", "TargetFrequency",
    "TargetStatus", "IsActive", "IsApproved", "CreatedBy"
) VALUES
(2025, 11, '2025-11', 'USER001', 'CUST001', 50000, 'Sales', 'User-Customer', 'Monthly', 'Active', TRUE, TRUE, 'ADMIN'),
(2025, 11, '2025-11', 'USER002', 'CUST002', 75000, 'Sales', 'User-Customer', 'Monthly', 'Active', TRUE, TRUE, 'ADMIN');
```

#### Option 2: Import from Excel/CSV
1. Prepare Excel file with columns:
   - TargetYear, TargetMonth, UserCode, CustomerCode, TargetAmount
2. Use pgAdmin or DBeaver to import
3. Map columns to table structure

#### Option 3: Bulk Insert from Existing Data
```sql
-- Create targets based on previous month sales
INSERT INTO "tblCommonTarget" (
    "TargetYear", "TargetMonth", "TargetPeriod",
    "UserCode", "CustomerCode", "TargetAmount",
    "TargetType", "TargetLevel", "TargetFrequency",
    "TargetStatus", "IsActive", "IsApproved", "CreatedBy"
)
SELECT
    2025 as "TargetYear",
    11 as "TargetMonth",
    '2025-11' as "TargetPeriod",
    "UserCode",
    "ClientCode" as "CustomerCode",
    SUM("TotalAmount") * 1.1 as "TargetAmount", -- 10% growth target
    'Sales' as "TargetType",
    'User-Customer' as "TargetLevel",
    'Monthly' as "TargetFrequency",
    'Active' as "TargetStatus",
    TRUE as "IsActive",
    TRUE as "IsApproved",
    'SYSTEM' as "CreatedBy"
FROM "tblTrxHeader"
WHERE EXTRACT(YEAR FROM "TrxDate") = 2025
  AND EXTRACT(MONTH FROM "TrxDate") = 10
  AND "TrxType" = 1
GROUP BY "UserCode", "ClientCode"
HAVING SUM("TotalAmount") > 0;
```

### Step 3: Verify Setup

```sql
-- Check table exists
SELECT COUNT(*) as total_targets FROM "tblCommonTarget";

-- View sample data
SELECT * FROM "tblCommonTarget" LIMIT 10;

-- Check target summary for November 2025
SELECT
    "TargetYear",
    "TargetMonth",
    COUNT(*) as target_count,
    SUM("TargetAmount") as total_target_amount
FROM "tblCommonTarget"
WHERE "TargetYear" = 2025 AND "TargetMonth" = 11
GROUP BY "TargetYear", "TargetMonth";
```

### Step 4: Test the Report

1. Open your application: **http://localhost:3000**
2. Navigate to **Target vs Achievement Report**
3. Select filters (Year: 2025, Month: 11)
4. Verify you see:
   - ✅ Targets from tblCommonTarget
   - ✅ Achievements from actual sales
   - ✅ Achievement percentages
   - ✅ All charts and tables working

## 📊 Table Structure

### tblCommonTarget Fields:

#### Core Fields:
- **TargetYear, TargetMonth** - When the target applies
- **UserCode** - Salesperson code
- **CustomerCode** - Customer code (NULL for user-level targets)
- **TargetAmount** - Target sales amount
- **TeamLeaderCode** - Team leader (optional)

#### Classification:
- **TargetType** - 'Sales', 'Volume', 'Customer Count'
- **TargetLevel** - 'User', 'User-Customer', 'Team'
- **TargetFrequency** - 'Monthly', 'Quarterly', 'Yearly'
- **TargetStatus** - 'Active', 'Inactive', 'Achieved'

#### Audit Fields:
- **IsActive** - TRUE/FALSE
- **IsApproved** - TRUE/FALSE
- **CreatedBy, CreatedOn** - Who created, when
- **ModifiedBy, ModifiedOn** - Last modification

## 🎯 Target Types

### 1. User-Level Target
Target for entire user (all customers combined)
```sql
INSERT INTO "tblCommonTarget" (
    "TargetYear", "TargetMonth", "UserCode",
    "CustomerCode", "TargetAmount", "TargetLevel", ...
) VALUES (
    2025, 11, 'USER001',
    NULL, 100000, 'User', ...  -- CustomerCode = NULL
);
```

### 2. User-Customer Target
Target for specific user-customer combination
```sql
INSERT INTO "tblCommonTarget" (
    "TargetYear", "TargetMonth", "UserCode",
    "CustomerCode", "TargetAmount", "TargetLevel", ...
) VALUES (
    2025, 11, 'USER001',
    'CUST001', 50000, 'User-Customer', ...
);
```

### 3. Team-Level Target
Target for entire team
```sql
INSERT INTO "tblCommonTarget" (
    "TargetYear", "TargetMonth", "TeamLeaderCode",
    "UserCode", "TargetAmount", "TargetLevel", ...
) VALUES (
    2025, 11, 'TL001',
    NULL, 500000, 'Team', ...
);
```

## 🔍 Troubleshooting

### Error: "tblCommonTarget table not found"
**Solution:** Run `create_targets_table.sql` to create the table

### Report shows "No targets found"
**Possible Reasons:**
1. Table is empty - Add target data
2. Wrong year/month selected - Check filters
3. IsActive = FALSE - Update to TRUE

**Check:**
```sql
SELECT COUNT(*) FROM "tblCommonTarget" WHERE "IsActive" = TRUE;
```

### Achievements showing but no targets
**Reason:** Targets not entered for that period
**Solution:** Add targets for the selected year/month

### Achievement % is 0 but there are sales
**Reason:** Target amount is 0 or NULL
**Solution:** Update target amounts to valid values

## 📈 Best Practices

### 1. Set Realistic Targets
- Base on historical performance
- Consider seasonality
- Factor in growth expectations

### 2. Monthly Target Entry
- Enter targets at the beginning of each month
- Review and adjust mid-month if needed
- Approve targets before tracking

### 3. Regular Monitoring
- Check achievement daily/weekly
- Identify underperformers early
- Celebrate achievers

### 4. Data Cleanup
- Archive old targets (set IsActive = FALSE)
- Keep only last 24 months active
- Document target changes in Remarks

## 🚀 Ready to Use

Once you've created the table and added target data:

1. ✅ Targets stored in tblCommonTarget
2. ✅ Achievements calculated from tblTrxHeader
3. ✅ Report shows real target vs achievement comparison
4. ✅ All filters work
5. ✅ Excel export works
6. ✅ Charts display correctly

## 📞 Need Help?

If you encounter issues:
1. Check `CREATE_TARGETS_TABLE_INSTRUCTIONS.md` for detailed steps
2. Verify table structure matches the SQL script
3. Ensure target data is entered correctly
4. Check server logs for error messages

The application is now ready to track target vs achievement properly!
