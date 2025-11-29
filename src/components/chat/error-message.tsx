"use client";

import { AlertCircle, AlertTriangle, Zap, Database } from "lucide-react";

interface ErrorMessageProps {
  error: string;
  errorType?: string;
  details?: any;
  timestamp?: string;
}

export function ErrorMessage({
  error,
  errorType = "ERROR",
  details,
  timestamp,
}: ErrorMessageProps) {
  // Determine icon and color based on error type
  const getErrorConfig = (type: string) => {
    switch (type) {
      case "RATE_LIMIT":
        return {
          icon: Zap,
          bgColor: "bg-yellow-50",
          borderColor: "border-yellow-200",
          titleColor: "text-yellow-900",
          textColor: "text-yellow-800",
          badgeColor: "bg-yellow-100 text-yellow-800",
          title: "⏱️ Rate Limit Reached",
        };
      case "CONTEXT_LIMIT":
        return {
          icon: Database,
          bgColor: "bg-blue-50",
          borderColor: "border-blue-200",
          titleColor: "text-blue-900",
          textColor: "text-blue-800",
          badgeColor: "bg-blue-100 text-blue-800",
          title: "📊 Context Limit",
        };
      case "SQL_ERROR":
        return {
          icon: AlertTriangle,
          bgColor: "bg-orange-50",
          borderColor: "border-orange-200",
          titleColor: "text-orange-900",
          textColor: "text-orange-800",
          badgeColor: "bg-orange-100 text-orange-800",
          title: "🔍 SQL Error",
        };
      case "API_ERROR":
        return {
          icon: AlertCircle,
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          titleColor: "text-red-900",
          textColor: "text-red-800",
          badgeColor: "bg-red-100 text-red-800",
          title: "❌ API Error",
        };
      default:
        return {
          icon: AlertCircle,
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          titleColor: "text-red-900",
          textColor: "text-red-800",
          badgeColor: "bg-red-100 text-red-800",
          title: "❌ Error",
        };
    }
  };

  const config = getErrorConfig(errorType);
  const Icon = config.icon;

  return (
    <div className={`${config.bgColor} border ${config.borderColor} rounded-lg p-4 my-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 ${config.titleColor} mt-0.5 flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          {/* Header with title and badge */}
          <div className="flex items-center gap-2 mb-2">
            <h3 className={`font-semibold ${config.titleColor}`}>{config.title}</h3>
            <span className={`text-xs px-2 py-1 rounded ${config.badgeColor}`}>
              {errorType}
            </span>
          </div>

          {/* Error message */}
          <p className={`${config.textColor} text-sm leading-relaxed break-words`}>
            {error}
          </p>

          {/* Details section */}
          {details && (
            <details className="mt-3 cursor-pointer">
              <summary className={`text-xs font-medium ${config.titleColor} hover:underline`}>
                Show Details
              </summary>
              <div className={`mt-2 p-2 bg-white bg-opacity-50 rounded text-xs ${config.textColor} font-mono overflow-auto max-h-48`}>
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(details, null, 2)}
                </pre>
              </div>
            </details>
          )}

          {/* Timestamp */}
          {timestamp && (
            <p className={`text-xs ${config.textColor} opacity-70 mt-2`}>
              {new Date(timestamp).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
