"use client";

import { Loader2 } from "lucide-react";

interface SummarizationProgressProps {
  progress: number; // 0-100
  status: string;
}

export function SummarizationProgress({
  progress,
  status,
}: SummarizationProgressProps) {
  const safeProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 my-4">
      <div className="flex items-start gap-3">
        <Loader2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0 animate-spin" />
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-blue-900">
              🔄 Optimizing Conversation
            </h3>
            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
              SUMMARIZING
            </span>
          </div>

          {/* Status message */}
          <p className="text-sm text-blue-700 mb-3">
            {status}
          </p>

          {/* Progress bar */}
          <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${safeProgress}%` }}
            />
          </div>

          {/* Progress percentage */}
          <p className="text-xs text-blue-600 mt-2 font-medium">
            {safeProgress}% Complete
          </p>

          {/* Info message */}
          <p className="text-xs text-blue-600 mt-2 opacity-75">
            Compressing conversation history to maintain context continuity...
          </p>
        </div>
      </div>
    </div>
  );
}
