"use client";

import React, { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    PieChart,
    Pie,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell,
    ComposedChart,
} from "recharts";

interface ChartConfig {
    chartType: "bar" | "line" | "pie" | "area" | "composed";
    title: string;
    description: string;
    xAxisKey?: string;
    yAxisKey?: string;
    dataKey?: string;
    dataKeys?: string[];
    nameKey?: string;
    valueKey?: string;
    colors: string[];
    showLegend: boolean;
    showGrid: boolean;
    tooltipFormat?: string;  // Format for tooltips: "AED", "%", "#", "date"
    yAxisFormat?: string;    // Format for Y-axis: "AED", "%", "#", "date"
}

interface DataChartProps {
    config: ChartConfig;
    data: any[];
}

// Format value based on format type
const formatValue = (value: number, format?: string) => {
    if (format === '%') return `${value.toFixed(2)}%`;
    if (format === '#') return value.toLocaleString('en-US');
    if (format === 'AED') {
        return `AED ${value.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    }
    // Default to number format
    return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

// Custom tooltip styling with name, code, and dynamic formatting
const CustomTooltip = ({ active, payload, label, config }: any) => {
    if (active && payload && payload.length) {
        const dataItem = payload[0]?.payload;

        return (
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-w-xs">
                {/* Show label (name) */}
                {label && <p className="font-semibold text-gray-900 dark:text-white mb-2 break-words">{label}</p>}

                {/* Show code if available in the data - check multiple possible field names */}
                {(dataItem?.code || dataItem?.material_code || dataItem?.product_code || dataItem?.customer_code) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Code: <span className="font-mono font-bold text-gray-700 dark:text-gray-300">{dataItem?.code || dataItem?.material_code || dataItem?.product_code || dataItem?.customer_code}</span>
                    </p>
                )}

                {/* Show values with dynamic formatting */}
                {payload.map((entry: any, index: number) => (
                    <p key={index} className="text-sm" style={{ color: entry.color }}>
                        <span className="font-medium">{entry.name}:</span>{" "}
                        <span className="font-bold">
                            {typeof entry.value === "number"
                                ? formatValue(entry.value, config?.tooltipFormat)
                                : entry.value}
                        </span>
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

// Format numbers based on format type (for Y-axis tick labels)
const formatNumber = (value: unknown, format?: string) => {
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(num) || !isFinite(num)) return String(value);

    // Percentage format
    if (format === '%') {
        return `${num.toFixed(0)}%`;
    }

    // Number/Count format
    if (format === '#') {
        if (num >= 1000000000) return `${(num / 1000000000).toFixed(0)}B`;
        if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
        return num.toFixed(0);
    }

    // AED currency format (default)
    if (num >= 1000000000) return `AED ${(num / 1000000000).toFixed(0)}B`;
    if (num >= 1000000) return `AED ${(num / 1000000).toFixed(0)}M`;
    if (num >= 1000) return `AED ${(num / 1000).toFixed(0)}K`;
    return `AED ${num.toFixed(0)}`;
};

// Get Y-axis label based on format
const getYAxisLabel = (format?: string) => {
    if (format === '%') return 'Percentage (%)';
    if (format === '#') return 'Count';
    if (format === 'AED') return 'Value (AED)';
    return 'Value'; // Default
};

// Validate domain before passing to Recharts
const validateDomain = (domain: any): [number, number] => {
    if (!Array.isArray(domain) || domain.length !== 2) return [0, 100];
    const [min, max] = domain;
    if (!isFinite(min) || !isFinite(max)) return [0, 100];
    if (min >= max) return [0, 100];
    return [min, max];
};

// Calculate flexible Y-axis domain based on data range
const calculateYAxisDomain = (data: any[], dataKeys: string[], format?: string): [number, number] => {
    try {
        if (!data || !Array.isArray(data) || data.length === 0) return [0, 100];

        // Find min and max values across all data keys
        let maxValue = -Infinity;
        let minValue = Infinity;

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            if (!item || typeof item !== 'object') continue;

            for (let j = 0; j < dataKeys.length; j++) {
                const key = dataKeys[j];
                const rawVal = item[key];

                // Skip null, undefined, empty strings
                if (rawVal === null || rawVal === undefined || rawVal === '') continue;

                const val = parseFloat(String(rawVal));
                if (!isNaN(val) && isFinite(val)) {
                    if (val > maxValue) maxValue = val;
                    if (val < minValue) minValue = val;
                }
            }
        }

        // If no valid values found
        if (!isFinite(maxValue) || !isFinite(minValue)) return [0, 100];

        // For percentage data, ensure we show both positive and negative ranges properly
        if (format === '%') {
            // Round to nice percentage values
            const range = maxValue - minValue;
            const padding = range * 0.1; // 10% padding

            let roundedMin = Math.floor((minValue - padding) / 5) * 5;
            let roundedMax = Math.ceil((maxValue + padding) / 5) * 5;

            // Ensure reasonable bounds for percentages
            roundedMin = Math.max(roundedMin, -100);
            roundedMax = Math.min(roundedMax, 1000); // Allow for high growth percentages

            return [roundedMin, roundedMax];
        }

        // Calculate Y-axis domain with exactly 5 tick marks covering the data range
        if (maxValue === 0 || !isFinite(maxValue)) return [0, 100];

        // Add 10% padding to min and max for better visualization
        const padding = (maxValue - minValue) * 0.1;
        const paddedMin = Math.max(0, minValue - padding);
        const paddedMax = maxValue + padding;

        // Calculate the range we need to cover
        const range = paddedMax - paddedMin;

        // We want 5 ticks (0, 1, 2, 3, 4) = 4 intervals
        // Calculate interval size that would give us nice round numbers
        const rawInterval = range / 4;

        // Find the magnitude of the interval (1, 10, 100, 1000, etc.)
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));

        // Round interval to a nice number (1, 2, 5, or 10 times the magnitude)
        const normalized = rawInterval / magnitude;
        let niceInterval;
        if (normalized <= 1) niceInterval = 1 * magnitude;
        else if (normalized <= 2) niceInterval = 2 * magnitude;
        else if (normalized <= 5) niceInterval = 5 * magnitude;
        else niceInterval = 10 * magnitude;

        // Calculate min and max based on nice intervals
        // Round min DOWN to nearest interval
        let roundedMin = Math.floor(paddedMin / niceInterval) * niceInterval;
        // Ensure min is not negative unless data is actually negative
        if (minValue >= 0 && roundedMin < 0) roundedMin = 0;

        // Round max UP to nearest interval
        let roundedMax = Math.ceil(paddedMax / niceInterval) * niceInterval;

        // Ensure we have exactly 4-5 intervals
        // If the range is too small, extend it
        while ((roundedMax - roundedMin) / niceInterval < 4) {
            roundedMax += niceInterval;
        }

        // Final validation
        if (!isFinite(roundedMax) || roundedMax <= 0) return [0, 100];
        if (!isFinite(roundedMin) || roundedMin < 0) roundedMin = 0;

        // This will create 5 ticks: min, min+interval, min+2*interval, min+3*interval, max
        return [roundedMin, roundedMax];
    } catch (e) {
        console.error('Error calculating Y-axis domain:', e);
        return [0, 100];
    }
};

export function DataChart({ config, data }: DataChartProps) {
    const [isFullscreen, setIsFullscreen] = useState(false);

    try {
        const { chartType, title, description, colors, showLegend, showGrid } = config;

        // Sanitize all keys to remove any trailing commas or spaces
        const sanitizeKey = (key: string | undefined) => {
            if (!key) return key;
            return String(key).trim().replace(/,+$/, '').trim();
        };

        // Apply sanitization to config
        const sanitizedConfig = {
            ...config,
            xAxisKey: sanitizeKey(config.xAxisKey),
            yAxisKey: sanitizeKey(config.yAxisKey),
            dataKey: sanitizeKey(config.dataKey),
            nameKey: sanitizeKey(config.nameKey),
            valueKey: sanitizeKey(config.valueKey),
            dataKeys: config.dataKeys ? config.dataKeys.map(sanitizeKey).filter(Boolean) : undefined,
        };

        // Guard: Validate data before rendering
        if (!data || !Array.isArray(data) || data.length === 0) {
            return (
                <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 my-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-center h-64 text-gray-500">
                        <p>No data available to display chart</p>
                    </div>
                </div>
            );
        }

        // Sanitize data: Remove items with NaN or Infinity values
        const sanitizedData = data.filter(item => {
            if (!item || typeof item !== 'object') return false;

            // Check all numeric values in the item
            for (const key in item) {
                const val = item[key];
                if (typeof val === 'number' && (!isFinite(val))) {
                    console.warn('Skipping data item with NaN/Infinity:', item);
                    return false;
                }
            }
            return true;
        });

        // If all data was filtered out, show error
        if (sanitizedData.length === 0) {
            return (
                <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 my-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-center h-64 text-gray-500">
                        <p>No valid data available (all values were NaN or Infinity)</p>
                    </div>
                </div>
            );
        }

        // Use sanitized data for rendering
        const chartData = sanitizedData;

        // Guard: Validate config
        if (!sanitizedConfig || !chartType || !colors || colors.length === 0) {
            console.error('Invalid chart config:', { config: sanitizedConfig, chartType, colors });
            return (
                <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 my-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-center h-64 text-gray-500">
                        <p>Invalid chart configuration</p>
                    </div>
                </div>
            );
        }

        // Guard: Validate colors array contains valid color strings
        if (!Array.isArray(colors) || colors.some(c => typeof c !== 'string' || !c.trim())) {
            console.error('Invalid colors array:', colors);
            return (
                <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 my-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-center h-64 text-gray-500">
                        <p>Invalid color configuration</p>
                    </div>
                </div>
            );
        }

        // Log chart rendering
        console.log("\n" + "📊".repeat(40));
        console.log("RENDERING CHART COMPONENT");
        console.log("📊".repeat(40));
        console.log("📈 Chart Type:", chartType);
        console.log("📝 Title:", title);
        console.log("🔢 Data points:", data?.length || 0);
        console.log("🎨 Colors:", colors?.join(", "));
        if ((sanitizedConfig as any).dataKeys) {
            console.log("📊 Multiple Metrics:", (sanitizedConfig as any).dataKeys.join(", "));
        }
        console.log("📊".repeat(40) + "\n");

        // Helper to detect if we need dual Y-axes (when scales differ by 100x or more)
        const needsDualAxis = () => {
            const dataKeys = (sanitizedConfig as any).dataKeys;
            if (!dataKeys || dataKeys.length < 2 || !data || data.length === 0) return false;

            try {
                // Calculate max values for each metric
                const maxValues = dataKeys.map((key: string) => {
                    const values = data
                        .map(item => {
                            const val = parseFloat(item[key]);
                            return !isNaN(val) ? Math.abs(val) : 0;
                        })
                        .filter(v => isFinite(v));

                    return values.length > 0 ? Math.max(...values) : 0;
                });

                const validMaxValues = maxValues.filter((v: number) => v > 0 && isFinite(v));
                if (validMaxValues.length < 2) return false;

                const max = Math.max(...validMaxValues);
                const min = Math.min(...validMaxValues);

                // If max is 100x or more than min, use dual axes
                return min > 0 && max / min >= 100;
            } catch (e) {
                console.error('Error checking dual axis need:', e);
                return false;
            }
        };

        // Render different chart types with error boundary
        const renderChart = () => {
            try {
                return renderChartSafe();
            } catch (error) {
                console.error('Error rendering chart:', error);
                return (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                        <p>Error rendering chart. Please check the data format.</p>
                    </div>
                );
            }
        };

        const renderChartSafe = () => {
            switch (chartType) {
                case "bar":
                    const barDataKey = sanitizedConfig.yAxisKey || sanitizedConfig.dataKey || sanitizedConfig.valueKey || "value";
                    const barXAxisKey = sanitizedConfig.xAxisKey || sanitizedConfig.nameKey || "name";

                    // Debug: Log bar chart configuration
                    console.log("📊 BAR CHART DEBUG:");
                    console.log("  xAxisKey:", barXAxisKey);
                    console.log("  yAxisKey (dataKey):", barDataKey);
                    console.log("  Colors:", colors);
                    console.log("  Sample data item:", chartData[0]);
                    console.log("  Has xAxis data?", chartData.length > 0 && chartData[0][barXAxisKey] !== undefined);
                    console.log("  Has yAxis data?", chartData.length > 0 && chartData[0][barDataKey] !== undefined);

                    // Verify data keys exist in the data
                    if (chartData.length > 0) {
                        if (chartData[0][barXAxisKey] === undefined) {
                            console.error(`❌ X-Axis key "${barXAxisKey}" not found in data. Available keys:`, Object.keys(chartData[0]));
                        }
                        if (chartData[0][barDataKey] === undefined) {
                            console.error(`❌ Y-Axis key "${barDataKey}" not found in data. Available keys:`, Object.keys(chartData[0]));
                        }
                    }

                    const barDomain = validateDomain(calculateYAxisDomain(chartData, [barDataKey], config.yAxisFormat));

                    return (
                        <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : 400}>
                            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 60, bottom: 60 }}>
                                {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
                                <XAxis
                                    dataKey={barXAxisKey}
                                    angle={-45}
                                    textAnchor="end"
                                    height={100}
                                    tick={{ fontSize: 12 }}
                                />
                                <YAxis
                                    domain={barDomain}
                                    tickFormatter={(value) => formatNumber(value, config.yAxisFormat)}
                                    tick={{ fontSize: 12, fill: '#666' }}
                                    stroke="#666"
                                    label={{ value: getYAxisLabel(config.yAxisFormat), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                                />
                                <Tooltip content={<CustomTooltip config={config} />} />
                                {showLegend && <Legend />}
                                <Bar
                                    dataKey={barDataKey}
                                    fill={colors[0] || "#3B82F6"}
                                    radius={[8, 8, 0, 0]}
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    );

                case "line":
                    const useDualAxis = needsDualAxis();
                    let lineDataKeys = (sanitizedConfig as any).dataKeys || [];

                    // If no dataKeys but has yAxisKey, use it as single metric
                    if (lineDataKeys.length === 0 && sanitizedConfig.yAxisKey) {
                        lineDataKeys = [sanitizedConfig.yAxisKey];
                    }
                    // If still no keys, try to find any numeric columns
                    if (lineDataKeys.length === 0 && chartData.length > 0) {
                        const firstItem = chartData[0];
                        const numericKeys = Object.keys(firstItem).filter(key =>
                            !['id', 'name', 'date', 'month', 'year', 'time'].includes(key.toLowerCase()) &&
                            typeof firstItem[key] === 'number'
                        );
                        if (numericKeys.length > 0) {
                            lineDataKeys = numericKeys.slice(0, 2); // Take first 2 numeric columns
                            console.warn("⚠️ No dataKeys found, using detected numeric columns:", lineDataKeys);
                        }
                    }

                    // Debug: Log line chart configuration
                    const lineXAxisKey = sanitizedConfig.xAxisKey || sanitizedConfig.nameKey;
                    console.log("📈 LINE CHART DEBUG:");
                    console.log("  xAxisKey:", lineXAxisKey);
                    console.log("  dataKeys:", lineDataKeys);
                    console.log("  Colors:", colors);
                    console.log("  Sample data item:", chartData[0]);
                    if (chartData.length > 0) {
                        if (lineXAxisKey) {
                            console.log("  Has xAxis data?", chartData[0][lineXAxisKey] !== undefined);
                        }
                        lineDataKeys.forEach((key: string) => {
                            console.log(`  Has "${key}" data?`, chartData[0][key] !== undefined);
                        });
                    }

                    const lineDomain = validateDomain(calculateYAxisDomain(chartData, lineDataKeys.length > 0 ? lineDataKeys : [sanitizedConfig.yAxisKey || sanitizedConfig.dataKey || sanitizedConfig.valueKey || "value"], config.yAxisFormat));

                    // Margins for line chart
                    const lineMargin = { top: 20, right: 30, left: 35, bottom: 80 };

                    console.log("🎨 LINE MARGIN:", lineMargin);
                    console.log("📊 LINE DOMAIN:", lineDomain);
                    console.log("📈 LINE DUAL AXIS NEEDED:", useDualAxis);

                    return (
                        <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : 400}>
                            <ComposedChart data={chartData} margin={lineMargin}>
                                {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
                                <XAxis
                                    dataKey={sanitizedConfig.xAxisKey || sanitizedConfig.nameKey}
                                    angle={-45}
                                    textAnchor="end"
                                    height={100}
                                    tick={{ fontSize: 12 }}
                                />

                                {/* Render single YAxis for line charts */}
                                <YAxis
                                  stroke="#666"
                                  tick={{ fontSize: 12, fill: '#000' }}
                                  tickFormatter={(value) => formatNumber(value, config.yAxisFormat)}
                                  label={{ value: getYAxisLabel(config.yAxisFormat), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                                />

                                <Tooltip content={<CustomTooltip config={config} />} />
                                {showLegend && <Legend />}

                                {/* Support multiple lines for combined charts */}
                                {lineDataKeys.length > 0 ? (
                                    lineDataKeys.map((key: string, idx: number) => {
                                        const lineProps: any = {
                                            type: "monotone",
                                            dataKey: key,
                                            stroke: colors[idx % colors.length] || "#3B82F6",
                                            strokeWidth: 3,
                                            dot: { fill: colors[idx % colors.length] || "#3B82F6", r: 5 },
                                            activeDot: { r: 7 },
                                            name: key.replace(/_/g, ' ').toUpperCase(),
                                        };

                                        return <Line key={key} {...lineProps} />;
                                    })
                                ) : (
                                    <Line
                                        type="monotone"
                                        dataKey={sanitizedConfig.yAxisKey || sanitizedConfig.dataKey || sanitizedConfig.valueKey || "value"}
                                        stroke={colors[0] || "#3B82F6"}
                                        strokeWidth={3}
                                        dot={{ fill: colors[0] || "#3B82F6", r: 6 }}
                                        activeDot={{ r: 8 }}
                                    />
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    );

                case "pie":
                    const nameKeyPie = sanitizedConfig.nameKey || sanitizedConfig.xAxisKey || Object.keys(data[0])[0];
                    const valueKeyPie = sanitizedConfig.valueKey || sanitizedConfig.dataKey || sanitizedConfig.yAxisKey || Object.keys(data[0])[1];

                    // Debug: Log pie chart configuration
                    console.log("🥧 PIE CHART DEBUG:");
                    console.log("  nameKey:", nameKeyPie);
                    console.log("  valueKey:", valueKeyPie);
                    console.log("  Colors:", colors);
                    console.log("  Sample data item:", chartData[0]);
                    if (chartData.length > 0) {
                        console.log("  Has name data?", chartData[0][nameKeyPie] !== undefined);
                        console.log("  Has value data?", chartData[0][valueKeyPie] !== undefined);
                    }

                    const pieData = data
                        .map((item, index) => {
                            const value = parseFloat(item[valueKeyPie]);
                            return {
                                name: item[nameKeyPie],
                                value: !isNaN(value) && isFinite(value) ? value : 0,
                            };
                        })
                        .filter(item => item.value > 0); // Filter out zero or invalid values

                    // Guard: Check if we have valid pie data
                    if (pieData.length === 0) {
                        return (
                            <div className="flex items-center justify-center h-64 text-gray-500">
                                <p>No valid data available for pie chart</p>
                            </div>
                        );
                    }

                    return (
                        <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : 400}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={true}
                                    label={(entry) => `${entry.name}: ${formatNumber(entry.value, config.yAxisFormat)}`}
                                    outerRadius={120}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip config={config} />} />
                                {showLegend && <Legend />}
                            </PieChart>
                        </ResponsiveContainer>
                    );

                case "area":
                    const areaDataKey = sanitizedConfig.yAxisKey || sanitizedConfig.dataKey || sanitizedConfig.valueKey || "value";
                    const areaXAxisKey = sanitizedConfig.xAxisKey || sanitizedConfig.nameKey || "name";

                    // Debug: Log area chart configuration
                    console.log("📊 AREA CHART DEBUG:");
                    console.log("  xAxisKey:", areaXAxisKey);
                    console.log("  dataKey:", areaDataKey);
                    console.log("  Colors:", colors);
                    console.log("  Sample data item:", chartData[0]);
                    if (chartData.length > 0) {
                        console.log("  Has xAxis data?", chartData[0][areaXAxisKey] !== undefined);
                        console.log("  Has dataKey?", chartData[0][areaDataKey] !== undefined);
                    }

                    const areaDomain = validateDomain(calculateYAxisDomain(chartData, [areaDataKey], config.yAxisFormat));

                    return (
                        <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : 400}>
                            <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 60, bottom: 60 }}>
                                {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
                                <XAxis
                                    dataKey={areaXAxisKey}
                                    angle={-45}
                                    textAnchor="end"
                                    height={100}
                                    tick={{ fontSize: 12 }}
                                />
                                <YAxis
                                    domain={areaDomain}
                                    tickFormatter={(value) => formatNumber(value, config.yAxisFormat)}
                                    tick={{ fontSize: 12 }}
                                    label={{ value: getYAxisLabel(config.yAxisFormat), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                                />
                                <Tooltip content={<CustomTooltip config={config} />} />
                                {showLegend && <Legend />}
                                <Area
                                    type="monotone"
                                    dataKey={areaDataKey}
                                    stroke={colors[0] || "#3B82F6"}
                                    fill={colors[0] || "#3B82F6"}
                                    fillOpacity={0.6}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    );

                case "composed":
                    // Composed chart for multiple metrics with dual Y-axes
                    const composedUseDualAxis = needsDualAxis();
                    let composedDataKeys = (sanitizedConfig as any).dataKeys || [];

                    // If no dataKeys but has yAxisKey, use it as single metric
                    if (composedDataKeys.length === 0 && sanitizedConfig.yAxisKey) {
                        composedDataKeys = [sanitizedConfig.yAxisKey];
                    }
                    // If still no keys, try to find any numeric columns
                    if (composedDataKeys.length === 0 && chartData.length > 0) {
                        const firstItem = chartData[0];
                        const numericKeys = Object.keys(firstItem).filter(key =>
                            !['id', 'name', 'date', 'month', 'year', 'time'].includes(key.toLowerCase()) &&
                            typeof firstItem[key] === 'number'
                        );
                        if (numericKeys.length > 0) {
                            composedDataKeys = numericKeys.slice(0, 2); // Take first 2 numeric columns
                            console.warn("⚠️ COMPOSED: No dataKeys found, using detected numeric columns:", composedDataKeys);
                        }
                    }

                    const composedDomain = validateDomain(calculateYAxisDomain(chartData, composedDataKeys.length > 0 ? composedDataKeys : [sanitizedConfig.yAxisKey || sanitizedConfig.dataKey || sanitizedConfig.valueKey || "value"], config.yAxisFormat));

                    // Increase margins for multi-metric charts (Y-axis ticks need space)
                    const composedMargin = composedUseDualAxis && composedDataKeys.length > 1
                        ? { top: 20, right: 90, left: 50, bottom: 80 }  // Dual axes need more space on both sides
                        : { top: 20, right: 30, left: 50, bottom: 80 }; // Single axis needs left space for Y-axis ticks

                    console.log("🎨 COMPOSED MARGIN:", composedMargin);
                    console.log("📊 COMPOSED DOMAIN:", composedDomain);
                    console.log("📈 COMPOSED DATAKEYS:", composedDataKeys);
                    console.log("📊 COMPOSED DUAL AXIS NEEDED:", composedUseDualAxis);

                    return (
                        <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : 400}>
                            <ComposedChart data={chartData} margin={composedMargin}>
                                {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
                                <XAxis
                                    dataKey={sanitizedConfig.xAxisKey || sanitizedConfig.nameKey}
                                    angle={-45}
                                    textAnchor="end"
                                    height={100}
                                    tick={{ fontSize: 12 }}
                                />

                                {/* Render single YAxis for composed charts */}
                                <YAxis
                                    domain={composedDomain}
                                    tickFormatter={(value) => formatNumber(value, config.yAxisFormat)}
                                    stroke="#666"
                                    tick={{ fontSize: 12, fill: '#000' }}
                                    label={{ value: getYAxisLabel(config.yAxisFormat), angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                                />

                                <Tooltip content={<CustomTooltip config={config} />} />
                                {showLegend && <Legend />}

                                {/* Render multiple lines with different colors */}
                                {composedDataKeys.length > 0 ? (
                                    composedDataKeys.map((key: string, idx: number) => {
                                        const composedLineProps: any = {
                                            type: "monotone",
                                            dataKey: key,
                                            stroke: colors[idx % colors.length] || "#3B82F6",
                                            strokeWidth: 2,
                                            dot: { fill: colors[idx % colors.length], r: 4 },
                                            name: key.replace(/_/g, ' ').toUpperCase(),
                                        };

                                        return <Line key={key} {...composedLineProps} />;
                                    })
                                ) : (
                                    <Line
                                        type="monotone"
                                        dataKey={sanitizedConfig.yAxisKey || sanitizedConfig.dataKey || sanitizedConfig.valueKey || "value"}
                                        stroke={colors[0] || "#3B82F6"}
                                        strokeWidth={2}
                                    />
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    );

                default:
                    return (
                        <div className="flex items-center justify-center h-64 text-gray-500">
                            Unsupported chart type: {chartType}
                        </div>
                    );
            }
        };

        return (
            <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-800 p-8' : 'w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 my-4 border border-gray-200 dark:border-gray-700'}`}>
                {/* Header */}
                <div className="mb-6 flex items-start justify-between">
                    <div className="flex-1">
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                            <span className="text-3xl">📊</span>
                            {title}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">{description}</p>
                    </div>

                    {/* Fullscreen Button */}
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="ml-4 flex items-center justify-center p-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors duration-200 cursor-pointer"
                        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    >
                        {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                    </button>
                </div>

                {/* Chart */}
                <div className={`w-full ${isFullscreen ? 'h-[calc(100vh-200px)]' : ''}`}>{renderChart()}</div>

                {/* Footer */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                        Generated from {chartData.length} data point{chartData.length !== 1 ? "s" : ""}
                    </p>
                </div>
            </div>
        );
    } catch (error) {
        console.error('Error rendering DataChart component:', error);
        return (
            <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 my-4 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-center h-64 text-gray-500">
                    <p>Error rendering chart. Please try again.</p>
                </div>
            </div>
        );
    }
}

