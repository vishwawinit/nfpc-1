"use client";

import React, { useState, useMemo } from "react";
import { Download, ArrowUpDown, ArrowUp, ArrowDown, Maximize2, Minimize2 } from "lucide-react";
import * as XLSX from "xlsx";

interface DataTableProps {
  data: {
    rows: any[][];
    columns: string[];
    rowCount: number;
  };
  title?: string;
}

type SortConfig = {
  columnIndex: number;
  direction: "asc" | "desc" | null;
};

export function DataTable({ data, title }: DataTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    columnIndex: -1,
    direction: null,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sort data based on current sort config
  const sortedData = useMemo(() => {
    if (sortConfig.direction === null || sortConfig.columnIndex === -1) {
      return data.rows;
    }

    const sorted = [...data.rows].sort((a, b) => {
      const aVal = a[sortConfig.columnIndex];
      const bVal = b[sortConfig.columnIndex];

      // Handle null/undefined
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Try numeric comparison first
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortConfig.direction === "asc" ? aNum - bNum : bNum - aNum;
      }

      // String comparison
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (sortConfig.direction === "asc") {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });

    return sorted;
  }, [data.rows, sortConfig]);

  // Handle column header click for sorting
  const handleSort = (columnIndex: number) => {
    setSortConfig((prev) => {
      if (prev.columnIndex === columnIndex) {
        // Cycle through: asc -> desc -> null
        if (prev.direction === "asc") {
          return { columnIndex, direction: "desc" };
        } else if (prev.direction === "desc") {
          return { columnIndex: -1, direction: null };
        }
      }
      return { columnIndex, direction: "asc" };
    });
  };

  // Export to XLSX
  const handleExportXLSX = () => {
    try {
      // Create worksheet data with headers
      const wsData = [data.columns, ...sortedData];

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Auto-size columns
      const maxWidths = data.columns.map((col, colIdx) => {
        const columnValues = [col, ...sortedData.map((row) => String(row[colIdx] || ""))];
        const maxLength = Math.max(...columnValues.map((val) => val.length));
        return Math.min(maxLength + 2, 50); // Max width of 50
      });

      ws["!cols"] = maxWidths.map((width) => ({ wch: width }));

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Data");

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split("T")[0];
      const filename = title
        ? `${title.replace(/[^a-z0-9]/gi, "_")}_${timestamp}.xlsx`
        : `export_${timestamp}.xlsx`;

      // Write file
      XLSX.writeFile(wb, filename);

      console.log("✅ Exported to XLSX:", filename);
    } catch (error) {
      console.error("❌ Export error:", error);
      alert("Failed to export data. Please try again.");
    }
  };

  // Format cell value for display
  const formatCellValue = (value: any) => {
    if (value == null) return "—";

    // Check if value is a string that looks like a number
    // We use Number() instead of parseFloat() because parseFloat() is too aggressive
    // e.g., parseFloat("2025-08") returns 2025, but Number("2025-08") returns NaN
    const num = Number(value);

    // Only format if it's a valid number and not an empty string (which Number() converts to 0)
    if (!isNaN(num) && value !== "" && String(value).trim() !== "") {
      if (Math.abs(num) > 1000) {
        return num.toLocaleString("en-US", {
          maximumFractionDigits: 2,
        });
      }
      return String(value);
    }

    return String(value);
  };

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-800' : 'w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700'} overflow-hidden`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span className="text-2xl">📊</span>
            {title || "Query Results"}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {data.rowCount.toLocaleString()} row{data.rowCount !== 1 ? "s" : ""} × {data.columns.length} column
            {data.columns.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportXLSX}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors duration-200 shadow-md hover:shadow-lg cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Export
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="flex items-center justify-center px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 shadow-md hover:shadow-lg cursor-pointer"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Table Container - Scrollable */}
      <div className="overflow-auto" style={{ maxHeight: isFullscreen ? "calc(100vh - 150px)" : "600px", maxWidth: "100%" }}>
        <table className="w-full text-sm">
          {/* Fixed Header */}
          <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10 shadow-sm">
            <tr>
              {data.columns.map((column, index) => (
                <th
                  key={index}
                  onClick={() => handleSort(index)}
                  className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 border-b-2 border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-2">
                    <span>{column}</span>
                    {sortConfig.columnIndex === index ? (
                      sortConfig.direction === "asc" ? (
                        <ArrowUp className="h-4 w-4 text-blue-600" />
                      ) : (
                        <ArrowDown className="h-4 w-4 text-blue-600" />
                      )
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {sortedData.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap"
                  >
                    {formatCellValue(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {sortConfig.direction
            ? `Sorted by "${data.columns[sortConfig.columnIndex]}" (${sortConfig.direction === "asc" ? "ascending" : "descending"})`
            : "Click column headers to sort"}
        </p>
      </div>
    </div>
  );
}

