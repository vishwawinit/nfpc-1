import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

export const runtime = "nodejs";

// Helper function to validate hex color codes
function isValidHexColor(color: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(color);
}

// Helper function to sanitize column names (remove commas, extra spaces)
function sanitizeKey(key: string | undefined, availableColumns: string[]): string | undefined {
  if (!key) return undefined;
  
  // Trim and remove trailing commas
  let sanitized = String(key).trim().replace(/,+$/, '').trim();
  
  // If the sanitized key exists in columns, use it
  if (availableColumns.includes(sanitized)) {
    return sanitized;
  }
  
  // Try case-insensitive match
  const lowerKey = sanitized.toLowerCase();
  const match = availableColumns.find(col => col.toLowerCase() === lowerKey);
  if (match) {
    return match;
  }
  
  // Return original if no match found (will be caught by validation)
  return sanitized;
}

// Helper function to validate data types in columns
function analyzeColumnTypes(columns: string[], rows: any[][]): Record<string, 'numeric' | 'date' | 'string'> {
  const types: Record<string, 'numeric' | 'date' | 'string'> = {};

  columns.forEach((col, idx) => {
    let isNumeric = true;
    let isDate = true;

    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const value = rows[i]?.[idx];
      if (value === null || value === undefined || value === '') continue;

      // Check if numeric
      if (isNumeric && isNaN(parseFloat(value))) {
        isNumeric = false;
      }

      // Check if date
      if (isDate && isNaN(Date.parse(String(value)))) {
        isDate = false;
      }
    }

    if (isNumeric) types[col] = 'numeric';
    else if (isDate) types[col] = 'date';
    else types[col] = 'string';
  });

  return types;
}

// Helper function to detect axis columns intelligently
function detectAxisColumns(columns: string[], columnTypes: Record<string, 'numeric' | 'date' | 'string'>) {
  const datePatterns = ['date', 'time', 'timestamp', 'created_at', 'updated_at', 'period', 'month', 'year', 'day', 'week'];
  const namePatterns = ['name', 'title', 'description', 'category', 'type', 'code', 'id', 'label'];

  let dateColumn: string | null = null;
  let nameColumn: string | null = null;
  let valueColumns: string[] = [];

  columns.forEach((col: string) => {
    const colLower = col.toLowerCase();
    const type = columnTypes[col];

    // Detect date column
    if (!dateColumn && (type === 'date' || datePatterns.some(p => colLower.includes(p)))) {
      dateColumn = col;
    }
    // Detect name/category column
    else if (!nameColumn && (type === 'string' && namePatterns.some(p => colLower.includes(p)))) {
      nameColumn = col;
    }
    // Collect numeric columns as potential values
    else if (type === 'numeric') {
      valueColumns.push(col);
    }
  });

  return { dateColumn, nameColumn, valueColumns };
}

// Schema for chart configuration
const ChartConfigSchema = z.object({
  chartType: z.enum(["bar", "line", "pie", "area", "composed"]).describe("Best chart type for this data"),
  title: z.string().describe("Chart title"),
  description: z.string().describe("Brief description of what the chart shows"),
  xAxisKey: z.string().optional().describe("Column name for X axis (for bar/line charts)"),
  yAxisKey: z.string().optional().describe("Column name for Y axis (for bar/line charts)"),
  dataKey: z.string().optional().describe("Main data column to visualize"),
  nameKey: z.string().optional().describe("Column for labels/names (for pie charts)"),
  valueKey: z.string().optional().describe("Column for values (for pie charts)"),
  dataKeys: z.array(z.string()).optional().describe("Multiple data keys for combined charts"),
  colors: z.array(z.string()).describe("Array of valid hex color codes"),
  showLegend: z.boolean().describe("Whether to show legend"),
  showGrid: z.boolean().describe("Whether to show grid lines"),
  tooltipFormat: z.string().optional().describe("Format for tooltip display"),
  yAxisFormat: z.string().optional().describe("Format for Y-axis values"),
});

// Function to handle combined datasets (merge into one chart)
async function handleCombinedDatasets(question: string, datasets: Array<{ query: string; data: any }>) {
  try {
    console.log("🔀 Merging datasets...");

    // Analyze column types for all datasets
    const firstDataset = datasets[0].data;
    const columnTypes = analyzeColumnTypes(firstDataset.columns, firstDataset.rows);
    const { dateColumn, nameColumn, valueColumns: detectedValueColumns } = detectAxisColumns(firstDataset.columns, columnTypes);

    if (!dateColumn) {
      console.log("❌ No common date column found, cannot combine");
      return new Response(JSON.stringify({ error: "Cannot combine datasets - no common axis", canVisualize: false }));
    }

    console.log("📅 Common X-axis:", dateColumn);
    console.log("📊 Detected value columns:", detectedValueColumns);

    // Merge all datasets by date
    const mergedData: any = {};
    const valueColumns: string[] = [];

    datasets.forEach((dataset, idx) => {
      const { rows, columns } = dataset.data;
      const dateColIdx = columns.indexOf(dateColumn);

      // Find numeric columns to merge
      const numericCols = columns
        .map((col: string, i: number) => ({ col, idx: i, type: columnTypes[col] }))
        .filter((c: any) => c.type === 'numeric' && c.col !== dateColumn)
        .map((c: any) => c.col);

      if (numericCols.length === 0) {
        console.warn(`⚠️ Dataset ${idx} has no numeric columns to merge`);
        return;
      }

      numericCols.forEach((valueCol: string) => {
        if (!valueColumns.includes(valueCol)) {
          valueColumns.push(valueCol);
        }
      });

      rows.forEach((row: any[]) => {
        const dateValue = row[dateColIdx];
        if (!mergedData[dateValue]) {
          mergedData[dateValue] = { [dateColumn]: dateValue };
        }

        numericCols.forEach((valueCol: string) => {
          const colIdx = columns.indexOf(valueCol);
          mergedData[dateValue][valueCol] = parseFloat(row[colIdx]) || 0;
        });
      });
    });

    const combinedRows = Object.values(mergedData);
     console.log("✅ Merged into", combinedRows.length, "rows with columns:", [dateColumn, ...valueColumns]);

     // Generate chart config with AI
     const numMetrics = valueColumns.length;
     
     // For combined datasets, we're guaranteed to have time-series data
     // So force line/composed chart type
     const prompt = `You are an expert data visualization specialist. Your PRIMARY GOAL is to create CLEAN, READABLE charts by selecting ONLY the most important metrics.

    ⚠️ CRITICAL: This is MERGED TIME-SERIES data from multiple queries. MUST use LINE or COMPOSED chart type.

## CONTEXT
User Question: "${question}"
Total Available Metrics: ${numMetrics}
All Metrics: ${valueColumns.join(", ")}
Data Points: ${combinedRows.length}
Time Axis: ${dateColumn}
Sample Data: ${JSON.stringify(combinedRows.slice(0, 2))}

## 🚨 CRITICAL RULE: MAXIMUM 3 METRICS 🚨
**YOU MUST select ONLY 2-3 most important metrics. DO NOT include all ${numMetrics} metrics.**

### Selection Criteria (in priority order):
1. **Relevance**: Which metrics directly answer the user's question?
2. **Business Impact**: Which metrics are most important for decision-making?
3. **Scale Compatibility**: Can these metrics be shown together without one dominating?
4. **Clarity**: Will users understand this chart at a glance?

### Examples of Good Selection:
- Available: [total_sales, total_revenue, units_sold, discounts, returns, shipping_cost, tax, fees]
- ✅ SELECT: [total_sales, total_revenue, units_sold] (top 3 most important)
- ❌ DON'T: Include all 8 metrics (chart becomes unreadable)

- Available: [cash_sales, credit_sales, total_orders, customers, returns]
- ✅ SELECT: [cash_sales, credit_sales] (if question is about payment methods)
- ✅ SELECT: [total_orders, customers] (if question is about volume)

**RULE: If you have more than 3 important metrics, choose the TOP 3 only.**

## DECISION LOGIC (CRITICAL)
Decide based on these rules:

### COMBINE INTO ONE CHART if:
1. Selected metrics ≤ 3 (max 3 lines for readability)
2. Metrics have SIMILAR scales (max value ratio < 10x)
3. Metrics are RELATED or COMPARABLE (e.g., Sales vs Revenue, Units vs Amount)
4. User is asking for COMPARISON or CORRELATION

### CREATE SEPARATE CHARTS if:
1. More than 3 important metrics exist
2. Metrics have VASTLY DIFFERENT scales (max value ratio > 10x)
3. Metrics are UNRELATED (e.g., Temperature vs Revenue)
4. One metric dominates others (would make others invisible)
5. Different units or measurement types

## CHART TYPE SELECTION
- **LINE**: For time-series trends, comparisons over time (PREFERRED for multi-metric)
- **COMPOSED**: For combining line + bar when metrics have different scales
- **AREA**: For cumulative or magnitude-focused trends
- **BAR**: Only if NOT time-series data

## FORMAT DETECTION RULES (CRITICAL)
**YOU MUST intelligently detect data type from column names:**

### Percentage Data (%, growth, share, rate):
- Column contains: "percentage", "percent", "%", "growth", "share", "rate", "ratio", "change"
- tooltipFormat: "%", yAxisFormat: "%"

### Currency Data (AED, sales, revenue, money):
- Column contains: "sales", "revenue", "amount", "value", "cost", "price", "total", "net_value"
- tooltipFormat: "AED", yAxisFormat: "AED"

### Count/Units Data (numbers, quantities):
- Column contains: "count", "quantity", "units", "qty", "orders", "items", "number_of"
- tooltipFormat: "#", yAxisFormat: "#"

### Mixed Metrics (CRITICAL - NEVER visualize percentages):
- **CRITICAL RULE**: NEVER include percentage/growth/change columns in dataKeys
- **WHY**: Negative percentages (like -10%) destroy the Y-axis scale and make charts unreadable
- **SOLUTION**: Only select currency/count columns for visualization
  - Exclude: columns with "percentage", "percent", "%", "growth", "change", "rate", "ratio"
  - Include: columns with "sales", "revenue", "value", "amount", "count", "quantity", "units"
- **Percentages = Tooltips ONLY**: Users see % on hover, but percentages should NOT be lines/bars
- Example: [sales_2025, sales_2024, percentage_change] → dataKeys: ["sales_2025", "sales_2024"] only
- Use format based on selected columns: all currency → "AED", all count → "#"

## STRICT REQUIREMENTS
1. **ALWAYS include showLegend: true** - Users MUST identify each metric
2. **ALWAYS include showGrid: true** - Grid helps read values accurately
3. **ANALYZE dataKeys to set correct tooltipFormat** (%, AED, # based on column names)
4. **ANALYZE dataKeys to set correct yAxisFormat** (%, AED, # based on column names)
5. **Color Palette** (use ONLY these valid hex codes in order):
   - #3B82F6 (Blue)
   - #10B981 (Green)
   - #F59E0B (Amber)
   - #EF4444 (Red)
   - #8B5CF6 (Purple)
   - #14B8A6 (Teal)
   - #F97316 (Orange)
   - #6366F1 (Indigo)
6. **Title**: Clear, concise, action-oriented
7. **Description**: Explain what the chart shows and key insights
8. **For combined charts**: Set dataKeys to ONLY selected important metrics (2-3 max)
9. **For separate charts**: Return ONE config for the FIRST most important metric only

## OUTPUT
Return a SINGLE chart configuration object with:
- chartType: Chosen type (line/composed/area)
- title: Descriptive title
- description: What the chart shows
- xAxisKey: "${dateColumn}"
- dataKeys: Array of ONLY 2-3 most important metrics (NOT all metrics)
- colors: Array of VALID hex colors matching number of selected metrics
- showLegend: true
- showGrid: true
- tooltipFormat: "AED"
- yAxisFormat: "AED"

**REMEMBER: Select only the most important metrics. Prioritize readability over showing everything.**`;

    const result = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: ChartConfigSchema,
      prompt,
      temperature: 0.2,
    });

    const chartConfig = result.object;
    // Don't force all dataKeys - let AI select only important metrics
    
    // Sanitize keys for combined datasets
    chartConfig.xAxisKey = sanitizeKey(chartConfig.xAxisKey, [dateColumn, ...valueColumns]);
    if (chartConfig.dataKeys && Array.isArray(chartConfig.dataKeys)) {
      chartConfig.dataKeys = chartConfig.dataKeys
        .map((key: string) => sanitizeKey(key, valueColumns))
        .filter((key: string | undefined): key is string => key !== undefined);
    }

    console.log("\n" + "🎨".repeat(40));
    console.log("COMBINED CHART CONFIGURATION GENERATED");
    console.log("🎨".repeat(40));
    console.log("📊 Chart Type:", chartConfig.chartType);
    console.log("📝 Title:", chartConfig.title);
    console.log("📈 Data Keys (metrics):", valueColumns.join(", "));
    console.log("🎨 Colors:", chartConfig.colors?.slice(0, valueColumns.length).join(", "));
    console.log("📋 Legend:", chartConfig.showLegend ? "YES" : "NO");
    console.log("📊 Grid:", chartConfig.showGrid ? "YES" : "NO");

    // DEBUG: Print the final chart config before sending
    console.log("\n" + "🔍".repeat(40));
    console.log("DEBUG: FINAL COMBINED CHART CONFIG BEING SENT TO FRONTEND");
    console.log("🔍".repeat(40));
    console.log(JSON.stringify(chartConfig, null, 2));
    console.log("🔍".repeat(40) + "\n");
    console.log("🔢 Combined data points:", combinedRows.length);
    console.log("📝 Sample combined data:", JSON.stringify(combinedRows.slice(0, 2), null, 2));
    console.log("🎨".repeat(40) + "\n");

    return new Response(
      JSON.stringify({
        success: true,
        canVisualize: true,
        chartConfig,
        data: combinedRows,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ Error combining datasets:", error);
    return new Response(
      JSON.stringify({ error: error.message, canVisualize: false }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    console.log("\n" + "📊".repeat(40));
    console.log("VISUALIZATION AGENT CALLED");
    console.log("📊".repeat(40));
    console.log("🤖 Model: Gemini 2.5 Pro");

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError: any) {
      console.error("❌ Failed to parse request JSON:", parseError.message);
      return new Response(
        JSON.stringify({
          error: "Invalid JSON in request body",
          canVisualize: false,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { question, query, data, datasets, combineMode } = requestBody;

    console.log("❓ Question:", question);
    console.log("🔄 Combine Mode:", combineMode || false);

    // Handle combined datasets mode
    if (combineMode && datasets && datasets.length > 1) {
      console.log(`🔀 Combining ${datasets.length} datasets into one chart`);
      return handleCombinedDatasets(question, datasets);
    }

    // Single dataset mode
    console.log("🔍 Query:", query);
    console.log("📈 Data rows:", data?.rows?.length || 0);
    console.log("📋 Columns:", data?.columns?.join(", "));

    // COMPREHENSIVE DATA VALIDATION
    if (!data || !data.rows || data.rows.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No data provided for visualization",
          canVisualize: false,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate column types and detect invalid data
    const columnTypes = analyzeColumnTypes(data.columns, data.rows);
    console.log("📊 Column Types Analysis:", columnTypes);

    // Check for NaN/Infinity values
    let hasInvalidValues = false;
    data.rows.forEach((row: any[], rowIdx: number) => {
      row.forEach((val: any, colIdx: number) => {
        if (typeof val === 'number' && !isFinite(val)) {
          console.warn(`⚠️ Invalid value (NaN/Infinity) at row ${rowIdx}, column ${data.columns[colIdx]}`);
          hasInvalidValues = true;
        }
      });
    });

    if (hasInvalidValues) {
      console.warn("⚠️ Data contains NaN or Infinity values - frontend will filter these");
    }

    // Detect axis columns intelligently
    const { dateColumn, nameColumn, valueColumns } = detectAxisColumns(data.columns, columnTypes);
    console.log("📅 Detected Date Column:", dateColumn);
    console.log("📝 Detected Name Column:", nameColumn);
    console.log("📊 Detected Value Columns:", valueColumns);

    // Check if API key is set
    const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!geminiApiKey) {
      console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
      return new Response(
        JSON.stringify({
          error: "API key not configured",
          canVisualize: false,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Prepare data summary for AI
     const dataSummary = {
       columns: data.columns,
       rowCount: data.rows.length,
       sampleRows: data.rows.slice(0, 5),
       question: question,
     };

     // Determine if this is likely a categorical (bar) or time-series (line) dataset
     const isCategorical = nameColumn && !dateColumn;
     const isTimeSeries = dateColumn && !nameColumn;
     
     console.log("🤖 Asking AI to generate chart configuration...");
     console.log(`📊 Data Type: ${isCategorical ? "CATEGORICAL (bar chart)" : isTimeSeries ? "TIME SERIES (line chart)" : "MIXED"}`);

    // Use Gemini 2.5 Flash to generate chart configuration
    const model = google("gemini-2.5-flash");

    let chartConfig: any;
    try {
      const result = await generateObject({
        model,
        schema: ChartConfigSchema,
        prompt: `You are a data visualization expert. Your PRIMARY GOAL is to create CLEAN, READABLE charts with complete visibility.

    ## USER REQUEST
    Question: "${question}"

    ## DATA ANALYSIS
    Columns: ${data.columns.join(", ")}
    Column Types: ${JSON.stringify(columnTypes)}
    Row Count: ${data.rows.length}
    Sample Data: ${JSON.stringify(data.rows.slice(0, 3))}
    Detected Date Column: ${dateColumn || "None"}
    Detected Name Column: ${nameColumn || "None"}
    Detected Value Columns: ${valueColumns.join(", ") || "None"}

    ## 🚨 CRITICAL RULE: LIMIT METRICS 🚨
    **If there are multiple value columns (${valueColumns.length} detected), select ONLY the top 2-3 most important ones.**

    ### Metric Selection Priority:
    1. **Relevance**: Which metrics directly answer the user's question?
    2. **Business Impact**: Revenue, sales, orders are usually more important than fees, discounts, taxes
    3. **User Intent**: What is the user trying to understand?

    ### Examples:
    - Available: [total_sales, total_revenue, units_sold, discounts, returns, tax]
    - ✅ SELECT: [total_sales, total_revenue] (top 2 for sales overview)
    - ❌ DON'T: Include all 6 (chart becomes cluttered)

    - Available: [cash_sales, credit_sales, total_orders, customers]
    - ✅ SELECT: [cash_sales, credit_sales, total_orders] (top 3 for sales breakdown)

    **MAXIMUM 3 METRICS. Choose wisely.**

    ## CHART TYPE DECISION RULES (STRICT - FOLLOW EXACTLY)

    ### STEP 1: Identify Data Structure
    - Time-series: Has date/time/period/month/year column → ${dateColumn ? `YES (${dateColumn})` : 'NO'}
    - Categorical: Has name/category/label column → ${nameColumn ? `YES (${nameColumn})` : 'NO'}
    - Numeric metrics: ${valueColumns.length} columns detected

    ### STEP 2: Select Chart Type Based on Structure

    **1. TIME SERIES DATA** (has date column: ${dateColumn}):
    - ✅ **LINE**: Best for trends, comparisons over time, showing changes (PREFERRED)
    - ✅ **AREA**: For cumulative trends, emphasizing magnitude
    - ✅ **COMPOSED**: When mixing different metric types (sales + percentage, sales + count)
    - ❌ **NEVER BAR**: Time-series should flow, not be discrete bars
    - ❌ **NEVER PIE**: Time cannot be shown as pie slices

    **2. CATEGORICAL DATA** (categories like ${nameColumn}):
    - ✅ **BAR**: Perfect for comparisons, rankings, top N (PRIMARY CHOICE)
      - Use HORIZONTAL bars for long labels
      - Use VERTICAL bars for short labels or dates
    - ✅ **PIE**: ONLY if:
      - Less than 7 items (max 10)
      - Showing parts of a whole (percentages, shares, distributions)
      - Question asks for "breakdown", "distribution", "share"
    - ❌ **NEVER LINE**: Categories don't have continuity

    **3. COMPARISON DATA** (showing rankings, top items):
    - ✅ **BAR**: Always use bar for "top 10", "best", "worst", "highest", "lowest"
    - Sort bars by value (descending for top, ascending for worst)

    **4. PERCENTAGE/DISTRIBUTION DATA**:
    - If total = 100%: Consider **PIE** (if < 7 items) or **BAR**
    - If showing growth rates: Use **BAR** for comparison or **LINE** for trend
    - If showing market shares: **PIE** (if < 7 brands) or **BAR**

    **5. MULTI-METRIC DATA** (multiple value columns):
    - ✅ **COMPOSED**: When metrics have vastly different scales (e.g., sales in thousands, count in tens)
    - ✅ **LINE**: When metrics have similar scales and are time-series
    - ✅ **BAR**: When metrics are categorical comparisons
    - **REMEMBER**: Select only top 2-3 metrics, not all

    ### BUSINESS LOGIC RULES:
    - **Growth/Change**: Use BAR for categorical comparison, LINE for time trend
    - **Top N (customers, products, routes)**: Always use BAR chart, sorted descending
    - **Sales over time**: Use LINE or AREA chart
    - **Market share**: Use PIE (< 7 items) or BAR chart
    - **Quantity/Units**: Use BAR for comparison, LINE for time-series
    - **Percentages**: Context matters - BAR for comparison, LINE for trend

    ## VALIDATION RULES (CRITICAL)
    ✓ Match chart type to data structure (time-series → line, categorical → bar, etc.)
    ✓ If data has ${dateColumn} column → MUST be time-series chart (line/area/composed)
    ✓ If data has ${nameColumn} column → MUST be categorical chart (bar/pie)
    ✓ If multiple value columns → Use dataKeys array for SELECTED metrics only (max 3)
    ✓ **NEVER include percentage/growth/change columns in dataKeys** (they ruin Y-axis scale)
    ✓ Percentage columns are for TOOLTIPS ONLY, not visualization
    ✓ ALWAYS validate chart type matches detected columns

    ## 🚨 AXIS CONFIGURATION RULES (PREVENT MISSING BARS) 🚨
    **CRITICAL: BAR CHARTS MUST HAVE EXACTLY ONE OF: yAxisKey OR dataKey**
    - If chartType is "bar":
    - MUST set xAxisKey: "${nameColumn || dateColumn}"
    - MUST set yAxisKey: first value column name (e.g., "${valueColumns[0] || "value"}")
    - DO NOT use dataKeys array for single-metric bar charts
    - ONLY use dataKeys if creating a multi-metric "composed" or "line" chart

    - If chartType is "line" or "composed" and you have multiple metrics:
    - MUST set xAxisKey: "${dateColumn || nameColumn}"
    - MUST set dataKeys: array of selected metric names (2-3 max)
    - DO NOT use yAxisKey - let dataKeys handle multiple metrics

    ## FORMAT DETECTION RULES (CRITICAL - ANALYZE DATA TYPE)
    **YOU MUST intelligently detect the data type and set appropriate formats:**

    ### Percentage Data (%, percent, growth, share, rate, ratio):
    - If column name contains: "percentage", "percent", "%", "growth", "share", "rate", "ratio", "change"
    - tooltipFormat: "%"
    - yAxisFormat: "%"
    - Examples: growth_percentage, market_share_percentage, growth_rate, change_rate

    ### Currency Data (AED, money, sales, revenue, amount, value, cost, price):
    - If column name contains: "sales", "revenue", "amount", "value", "cost", "price", "total", "net_value"
    - tooltipFormat: "AED"
    - yAxisFormat: "AED"
    - Examples: total_sales, revenue, net_value, sales_amount

    ### Count/Quantity Data (numbers, units, count, qty, orders):
    - If column name contains: "count", "quantity", "units", "qty", "orders", "items", "number_of"
    - tooltipFormat: "#"
    - yAxisFormat: "#"
    - Examples: order_count, units_sold, total_quantity, item_count

    ### Date/Time Data:
    - If column name contains: "date", "time", "month", "year", "day", "period"
    - tooltipFormat: "date"
    - yAxisFormat: "date"

    ### Mixed Data (multiple metrics with different types):
    - **CRITICAL RULE**: NEVER include percentage/growth columns as dataKeys for visualization
    - **WHY**: Percentage values (especially negative ones like -10%) ruin the Y-axis scale and make charts unreadable
    - **SOLUTION**: Only select non-percentage columns for dataKeys
      - Percentage columns: "percentage", "percent", "%", "growth", "change", "rate", "ratio"
      - Currency/Count columns: "sales", "revenue", "amount", "value", "count", "quantity", "units"
    - **Percentages are for TOOLTIPS ONLY**: Users can see % values on hover, but they should NOT be visualized as separate lines/bars
    - If you see percentage columns → EXCLUDE them from dataKeys, only use currency/count columns
    - Example: Given columns [sales_2025, sales_2024, percentage_change]
      - ✅ CORRECT dataKeys: ["sales_2025", "sales_2024"] (show only currency)
      - ❌ WRONG dataKeys: ["sales_2025", "sales_2024", "percentage_change"] (includes %)
    - Use appropriate format based on selected columns (if all currency → "AED", if all count → "#")

    **CRITICAL**: Look at the actual column names being visualized, not just available columns!

    ## MANDATORY REQUIREMENTS
    ✓ ALWAYS set showLegend: true (users must identify metrics)
    ✓ ALWAYS set showGrid: true (improves readability)
    ✓ ALWAYS analyze column names to set correct tooltipFormat (%, AED, #, or date)
    ✓ ALWAYS analyze column names to set correct yAxisFormat (%, AED, #, or date)
    ✓ Use ONLY these valid hex colors in order:
    1. #3B82F6 (Blue)
    2. #10B981 (Green)
    3. #F59E0B (Amber)
    4. #EF4444 (Red)
    5. #8B5CF6 (Purple)
    6. #14B8A6 (Teal)
    7. #F97316 (Orange)
    8. #6366F1 (Indigo)
    ✓ Title: Clear, concise, action-oriented
    ✓ Description: Explain what the chart shows and key insights
    ✓ For BAR charts: Always have xAxisKey and yAxisKey set to real column names
    ✓ For LINE/AREA charts: Have xAxisKey and dataKeys (NOT yAxisKey)
    ✓ Colors array length MUST match number of metrics being shown
    ✓ Use common sense - prioritize readability over complexity

    ## OUTPUT
    Return a single, well-configured chart object with:
    - chartType: Appropriate type matching data structure (bar|line|pie|area|composed)
    - title: Descriptive title
    - description: What the chart shows
    - xAxisKey: Real column name for X-axis
    - yAxisKey: Real column name for Y-axis (BAR charts ONLY)
    - dataKey: Alternative for single value (rarely needed)
    - dataKeys: Array of column names for multi-metric charts (LINE/AREA/COMPOSED ONLY)
    - colors: Array of VALID hex colors matching number of metrics
    - showLegend: true
    - showGrid: true
    - tooltipFormat: "AED"
    - yAxisFormat: "AED"

    CRITICAL: Ensure bars will be visible by using correct axis configuration.`,
        temperature: 0.2,
      });

      chartConfig = result.object;

      // ENFORCE: Ensure tooltipFormat is always set (with intelligent default)
      if (!chartConfig.tooltipFormat) {
        // Detect format from column names
        const mainColumn = chartConfig.yAxisKey || chartConfig.dataKeys?.[0] || chartConfig.valueKey;
        if (mainColumn) {
          const colLower = mainColumn.toLowerCase();
          if (colLower.includes('percent') || colLower.includes('growth') || colLower.includes('share') || colLower.includes('rate')) {
            chartConfig.tooltipFormat = "%";
          } else if (colLower.includes('count') || colLower.includes('quantity') || colLower.includes('units') || colLower.includes('orders')) {
            chartConfig.tooltipFormat = "#";
          } else if (colLower.includes('sales') || colLower.includes('revenue') || colLower.includes('amount') || colLower.includes('value')) {
            chartConfig.tooltipFormat = "AED";
          } else {
            chartConfig.tooltipFormat = "#"; // Generic number format
          }
          console.warn(`⚠️ AI didn't generate tooltipFormat, detected '${chartConfig.tooltipFormat}' from column: ${mainColumn}`);
        } else {
          console.warn("⚠️ AI didn't generate tooltipFormat and couldn't detect column, using '#'");
          chartConfig.tooltipFormat = "#";
        }
      }

      // ENFORCE: Ensure yAxisFormat is always set (with intelligent default)
      if (!chartConfig.yAxisFormat) {
        // Use same logic as tooltipFormat
        const mainColumn = chartConfig.yAxisKey || chartConfig.dataKeys?.[0] || chartConfig.valueKey;
        if (mainColumn) {
          const colLower = mainColumn.toLowerCase();
          if (colLower.includes('percent') || colLower.includes('growth') || colLower.includes('share') || colLower.includes('rate')) {
            chartConfig.yAxisFormat = "%";
          } else if (colLower.includes('count') || colLower.includes('quantity') || colLower.includes('units') || colLower.includes('orders')) {
            chartConfig.yAxisFormat = "#";
          } else if (colLower.includes('sales') || colLower.includes('revenue') || colLower.includes('amount') || colLower.includes('value')) {
            chartConfig.yAxisFormat = "AED";
          } else {
            chartConfig.yAxisFormat = "#"; // Generic number format
          }
          console.warn(`⚠️ AI didn't generate yAxisFormat, detected '${chartConfig.yAxisFormat}' from column: ${mainColumn}`);
        } else {
          console.warn("⚠️ AI didn't generate yAxisFormat and couldn't detect column, using '#'");
          chartConfig.yAxisFormat = "#";
        }
      }

      // CRITICAL: Filter out percentage columns from dataKeys to prevent Y-axis scaling issues
      if (chartConfig.dataKeys && chartConfig.dataKeys.length > 0) {
        const originalDataKeys = [...chartConfig.dataKeys];
        const percentagePatterns = ['percentage', 'percent', '%', 'growth', 'change', 'rate', 'ratio', 'share'];

        // Remove any percentage-related columns
        chartConfig.dataKeys = chartConfig.dataKeys.filter((key: string) => {
          const keyLower = key.toLowerCase();
          const isPercentage = percentagePatterns.some((pattern: string) => keyLower.includes(pattern));

          if (isPercentage) {
            console.log(`🚫 Excluding percentage column from visualization: "${key}" (will be available in tooltip only)`);
            return false;
          }
          return true;
        });

        // If we filtered out some columns, log it
        if (chartConfig.dataKeys.length !== originalDataKeys.length) {
          console.log(`📊 Filtered dataKeys: ${originalDataKeys.join(', ')} → ${chartConfig.dataKeys.join(', ')}`);
        }

        // If no dataKeys left after filtering, keep the first non-percentage column
        if (chartConfig.dataKeys.length === 0) {
          console.warn('⚠️ All columns were percentages! Keeping first column for visualization.');
          chartConfig.dataKeys = [originalDataKeys[0]];
        }
      }

      // 🚨 CRITICAL FIX: Validate ALL chart configurations
      console.log(`\n🔧 Validating ${chartConfig.chartType.toUpperCase()} chart configuration...`);
      
      // FIRST: Sanitize all keys to remove commas and extra spaces
      console.log("🧹 Sanitizing keys (removing commas, extra spaces)...");
      const originalConfig = { ...chartConfig };
      
      chartConfig.xAxisKey = sanitizeKey(chartConfig.xAxisKey, data.columns);
      chartConfig.yAxisKey = sanitizeKey(chartConfig.yAxisKey, data.columns);
      chartConfig.dataKey = sanitizeKey(chartConfig.dataKey, data.columns);
      chartConfig.nameKey = sanitizeKey(chartConfig.nameKey, data.columns);
      chartConfig.valueKey = sanitizeKey(chartConfig.valueKey, data.columns);
      
      if (chartConfig.dataKeys && Array.isArray(chartConfig.dataKeys)) {
        chartConfig.dataKeys = chartConfig.dataKeys
          .map((key: string) => sanitizeKey(key, data.columns))
          .filter((key: string | undefined): key is string => key !== undefined);
      }
      
      // Log any keys that were sanitized
      if (originalConfig.xAxisKey !== chartConfig.xAxisKey && originalConfig.xAxisKey) {
        console.warn(`  ⚠️ xAxisKey: "${originalConfig.xAxisKey}" → "${chartConfig.xAxisKey}"`);
      }
      if (originalConfig.yAxisKey !== chartConfig.yAxisKey && originalConfig.yAxisKey) {
        console.warn(`  ⚠️ yAxisKey: "${originalConfig.yAxisKey}" → "${chartConfig.yAxisKey}"`);
      }
      if (originalConfig.nameKey !== chartConfig.nameKey && originalConfig.nameKey) {
        console.warn(`  ⚠️ nameKey: "${originalConfig.nameKey}" → "${chartConfig.nameKey}"`);
      }
      if (originalConfig.valueKey !== chartConfig.valueKey && originalConfig.valueKey) {
        console.warn(`  ⚠️ valueKey: "${originalConfig.valueKey}" → "${chartConfig.valueKey}"`);
      }
      
      if (chartConfig.chartType === "bar") {
        // BAR charts MUST have xAxisKey set
        if (!chartConfig.xAxisKey) {
          const fallbackXAxis = nameColumn || dateColumn || data.columns[0];
          console.warn(`⚠️ BAR chart missing xAxisKey, using: ${fallbackXAxis}`);
          chartConfig.xAxisKey = fallbackXAxis;
        }
        
        // BAR charts MUST have yAxisKey set (for bars to render)
        if (!chartConfig.yAxisKey && !chartConfig.dataKey && !chartConfig.valueKey) {
          const fallbackYAxis = valueColumns[0] || data.columns.find((col: string) => columnTypes[col] === 'numeric');
          console.warn(`⚠️ BAR chart missing yAxisKey/dataKey, using: ${fallbackYAxis}`);
          chartConfig.yAxisKey = fallbackYAxis;
        }
        
        // If dataKeys is set, convert to yAxisKey for bar charts
        if (chartConfig.dataKeys && Array.isArray(chartConfig.dataKeys) && chartConfig.dataKeys.length > 0) {
          console.warn(`⚠️ BAR chart has dataKeys array, converting to single yAxisKey: ${chartConfig.dataKeys[0]}`);
          chartConfig.yAxisKey = chartConfig.dataKeys[0];
          if (chartConfig.colors && chartConfig.colors.length > 1) {
            chartConfig.colors = [chartConfig.colors[0]];
          }
          delete chartConfig.dataKeys;
        }
        
        console.log("✅ BAR chart validated:", { xAxisKey: chartConfig.xAxisKey, yAxisKey: chartConfig.yAxisKey });
      }
      
      else if (chartConfig.chartType === "line" || chartConfig.chartType === "area" || chartConfig.chartType === "composed") {
        // LINE/AREA/COMPOSED charts with single metric
        if (!chartConfig.dataKeys || (Array.isArray(chartConfig.dataKeys) && chartConfig.dataKeys.length === 0)) {
          console.warn(`⚠️ ${chartConfig.chartType.toUpperCase()} chart missing dataKeys array`);
          
          const fallbackDataKey = chartConfig.yAxisKey || chartConfig.dataKey || chartConfig.valueKey || valueColumns[0] || data.columns.find((col: string) => columnTypes[col] === 'numeric');
          
          if (fallbackDataKey) {
            console.warn(`   Converting to dataKeys: [${fallbackDataKey}]`);
            chartConfig.dataKeys = [fallbackDataKey];
            // Clean up duplicate keys
            delete chartConfig.yAxisKey;
            delete chartConfig.dataKey;
            delete chartConfig.valueKey;
          }
        }
        
        // Ensure xAxisKey is set
        if (!chartConfig.xAxisKey) {
          const fallbackXAxis = dateColumn || nameColumn || data.columns[0];
          console.warn(`⚠️ ${chartConfig.chartType.toUpperCase()} chart missing xAxisKey, using: ${fallbackXAxis}`);
          chartConfig.xAxisKey = fallbackXAxis;
        }
        
        // Ensure colors array matches number of dataKeys
        if (chartConfig.dataKeys && Array.isArray(chartConfig.dataKeys)) {
          const metricCount = chartConfig.dataKeys.length;
          if (!chartConfig.colors || chartConfig.colors.length < metricCount) {
            const defaultPalette = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#F97316', '#6366F1'];
            const neededColors = defaultPalette.slice(0, metricCount);
            console.warn(`⚠️ Colors array too small (${chartConfig.colors?.length || 0}), need ${metricCount}. Using defaults.`);
            chartConfig.colors = neededColors;
          }
        }
        
        console.log(`✅ ${chartConfig.chartType.toUpperCase()} chart validated:`, { 
          xAxisKey: chartConfig.xAxisKey, 
          dataKeys: chartConfig.dataKeys,
          colorCount: chartConfig.colors?.length 
        });
      }
      
      else if (chartConfig.chartType === "pie") {
        // PIE charts need nameKey and valueKey
        if (!chartConfig.nameKey && !chartConfig.xAxisKey) {
          const fallbackNameKey = nameColumn || data.columns[0];
          console.warn(`⚠️ PIE chart missing nameKey, using: ${fallbackNameKey}`);
          chartConfig.nameKey = fallbackNameKey;
        }
        
        if (!chartConfig.valueKey && !chartConfig.dataKey && !chartConfig.yAxisKey) {
          const fallbackValueKey = valueColumns[0] || data.columns.find((col: string) => columnTypes[col] === 'numeric');
          console.warn(`⚠️ PIE chart missing valueKey, using: ${fallbackValueKey}`);
          chartConfig.valueKey = fallbackValueKey;
        }
        
        console.log("✅ PIE chart validated:", { 
          nameKey: chartConfig.nameKey || chartConfig.xAxisKey, 
          valueKey: chartConfig.valueKey || chartConfig.dataKey || chartConfig.yAxisKey 
        });
      }

      // Validate and sanitize colors
      if (chartConfig.colors && Array.isArray(chartConfig.colors)) {
        chartConfig.colors = chartConfig.colors.map((color: string) => {
          if (isValidHexColor(color)) {
            return color;
          }
          // Fallback to default palette if invalid
          const defaultPalette = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#F97316', '#6366F1'];
          return defaultPalette[chartConfig.colors.indexOf(color) % defaultPalette.length];
        });
      }
    } catch (aiError: any) {
      console.error("❌ AI generation failed:", aiError.message);
      throw new Error(`Failed to generate chart configuration: ${aiError.message}`);
    }

    console.log("\n" + "🎨".repeat(40));
    console.log("SINGLE CHART CONFIGURATION GENERATED");
    console.log("🎨".repeat(40));
    console.log("📊 Chart Type:", chartConfig.chartType);
    console.log("📝 Title:", chartConfig.title);
    console.log("📄 Description:", chartConfig.description);
    console.log("📈 X-Axis Key:", chartConfig.xAxisKey || chartConfig.nameKey || "auto");
    console.log("📊 Y-Axis Key:", chartConfig.yAxisKey || chartConfig.dataKey || chartConfig.valueKey || "auto");
    console.log("🎨 Colors:", chartConfig.colors?.join(", "));
    console.log("📋 Show Legend:", chartConfig.showLegend ? "YES" : "NO");
    console.log("📊 Show Grid:", chartConfig.showGrid ? "YES" : "NO");
    console.log("🔢 Data points:", data.rows.length);
    console.log("\n📋 Full Config:");
    console.log(JSON.stringify(chartConfig, null, 2));
    console.log("🎨".repeat(40) + "\n");

    // Transform data to format expected by recharts
    const transformedData = data.rows.map((row: any[], index: number) => {
      const obj: any = { id: index };

      // Add all columns to object
      data.columns.forEach((col: string, colIndex: number) => {
        obj[col] = row[colIndex];
      });

      // Detect and add important metadata fields for tooltips and legends
      // 1. Code columns (material_code, product_code, customer_code, etc.)
      const codePatterns = ['code', 'id', 'sku', 'product_id', 'customer_id', 'material_id'];
      const codeCol = data.columns.find((col: string) =>
        codePatterns.some(pattern => col.toLowerCase().includes(pattern))
      );
      if (codeCol) {
        const codeIndex = data.columns.indexOf(codeCol);
        obj.code = row[codeIndex];
      }

      // 2. Name/Description columns (product_name, customer_name, description, etc.)
      const namePatterns = ['name', 'title', 'description', 'label', 'category', 'type'];
      const nameCol = data.columns.find((col: string) =>
        namePatterns.some(pattern => col.toLowerCase().includes(pattern))
      );
      if (nameCol && nameCol !== codeCol) {
        const nameIndex = data.columns.indexOf(nameCol);
        obj.displayName = row[nameIndex];
      }

      // 3. Amount/Value columns (for reference in tooltips)
      const amountPatterns = ['amount', 'value', 'total', 'sum', 'revenue', 'sales', 'quantity'];
      const amountCol = data.columns.find((col: string) =>
        amountPatterns.some(pattern => col.toLowerCase().includes(pattern)) && columnTypes[col] === 'numeric'
      );
      if (amountCol) {
        const amountIndex = data.columns.indexOf(amountCol);
        obj.amount = row[amountIndex];
      }

      return obj;
    });

    console.log("📝 Sample Transformed Data (first 2 items):");
    console.log(JSON.stringify(transformedData.slice(0, 2), null, 2));
    console.log("✅ Data transformation complete - all columns preserved for tooltips and legends");

    // DEBUG: Print the final chart config before sending
    console.log("\n" + "🔍".repeat(40));
    console.log("DEBUG: FINAL CHART CONFIG BEING SENT TO FRONTEND");
    console.log("🔍".repeat(40));
    console.log(JSON.stringify(chartConfig, null, 2));
    console.log("🔍".repeat(40) + "\n");

    const responsePayload = {
      success: true,
      canVisualize: true,
      chartConfig,
      data: transformedData,
    };

    return new Response(
      JSON.stringify(responsePayload),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("❌ Visualization error:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to generate visualization",
        canVisualize: false,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

