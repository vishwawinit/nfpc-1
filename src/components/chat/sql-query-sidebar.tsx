"use client";

import { useState } from "react";
import { Code2, ChevronRight, ChevronLeft, Database, Clock, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type SqlQuerySidebarProps = {
  sqlHistory: Array<{ id: string; query: string; timestamp: Date }>;
  isOpen: boolean;
  onToggle: () => void;
};

export function SqlQuerySidebar({ sqlHistory, isOpen, onToggle }: SqlQuerySidebarProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (query: string, id: string) => {
    try {
      await navigator.clipboard.writeText(query);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formatSql = (sql: string) => {
    // Basic SQL formatting for better readability
    return sql
      .replace(/\bSELECT\b/gi, '<span class="text-blue-600 font-semibold">SELECT</span>')
      .replace(/\bFROM\b/gi, '<span class="text-blue-600 font-semibold">FROM</span>')
      .replace(/\bWHERE\b/gi, '<span class="text-blue-600 font-semibold">WHERE</span>')
      .replace(/\bINNER JOIN\b/gi, '<span class="text-blue-600 font-semibold">INNER JOIN</span>')
      .replace(/\bLEFT JOIN\b/gi, '<span class="text-blue-600 font-semibold">LEFT JOIN</span>')
      .replace(/\bGROUP BY\b/gi, '<span class="text-blue-600 font-semibold">GROUP BY</span>')
      .replace(/\bORDER BY\b/gi, '<span class="text-blue-600 font-semibold">ORDER BY</span>')
      .replace(/\bLIMIT\b/gi, '<span class="text-blue-600 font-semibold">LIMIT</span>')
      .replace(/\bAS\b/gi, '<span class="text-purple-600 font-semibold">AS</span>')
      .replace(/\bAND\b/gi, '<span class="text-purple-600 font-semibold">AND</span>')
      .replace(/\bOR\b/gi, '<span class="text-purple-600 font-semibold">OR</span>')
      .replace(/\bCOUNT\b/gi, '<span class="text-green-600 font-semibold">COUNT</span>')
      .replace(/\bSUM\b/gi, '<span class="text-green-600 font-semibold">SUM</span>')
      .replace(/\bAVG\b/gi, '<span class="text-green-600 font-semibold">AVG</span>')
      .replace(/\bMAX\b/gi, '<span class="text-green-600 font-semibold">MAX</span>')
      .replace(/\bMIN\b/gi, '<span class="text-green-600 font-semibold">MIN</span>');
  };

  return (
    <TooltipProvider>
      {/* Sidebar */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full bg-[#1e293b] border-l border-gray-700 shadow-lg transition-all duration-300 z-40 flex flex-col overflow-hidden",
          isOpen ? "w-[400px]" : "w-0"
        )}
      >
        <div className={cn("flex flex-col h-full", !isOpen && "hidden")}>
          {/* Header */}
          <div className="p-4 bg-[#1e293b] border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded shadow-sm border border-gray-700">
                  <Database className="h-5 w-5 text-gray-300" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">SQL Query Log</h2>
                  <p className="text-xs text-gray-400">Developer Tools</p>
                </div>
              </div>
              <Badge variant="outline" className="bg-gray-800 text-gray-300 border-gray-700">
                {sqlHistory.length} queries
              </Badge>
            </div>
          </div>

          {/* Query History */}
          <ScrollArea className="flex-1 p-4 bg-[#1e293b] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-500">
            {sqlHistory.length === 0 ? (
              <Card className="bg-gray-800/50 border-dashed border-gray-700">
                <CardContent className="text-center py-12">
                  <Database className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 font-medium">No queries executed yet</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Queries will appear here as you interact with the AI
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {[...sqlHistory].reverse().map((item, index) => (
                  <Card
                    key={item.id}
                    className="bg-gray-800/30 border-gray-700 hover:shadow-sm transition-shadow"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="bg-gray-800 text-gray-300 border-gray-700"
                          >
                            Query #{sqlHistory.length - index}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            {item.timestamp.toLocaleTimeString()}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 w-9 p-0 cursor-pointer hover:bg-gray-700 text-gray-400 hover:text-white"
                          onClick={() => handleCopy(item.query, item.id)}
                        >
                          {copiedId === item.id ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="relative">
                        <pre className="text-xs font-mono bg-[#0f172a] text-slate-100 p-3 rounded overflow-auto whitespace-pre-wrap break-words border border-gray-800">
                          <code dangerouslySetInnerHTML={{ __html: formatSql(item.query) }} />
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Toggle Button */}
      <Button
        onClick={onToggle}
        variant="outline"
        size="sm"
        className={cn(
          "fixed top-[88px] z-20 bg-[#1e293b] border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer",
          isOpen ? "right-[400px]" : "right-0 rounded-r-none"
        )}
      >
        {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
    </TooltipProvider>
  );
}
