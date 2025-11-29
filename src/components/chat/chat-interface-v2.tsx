"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { DataChart } from "./data-chart";
import { DataTable } from "./data-table";
import { ChatHistorySidebar } from "./chat-history-sidebar-v2";
import { SqlQuerySidebar } from "./sql-query-sidebar";
import { ErrorMessage } from "./error-message";
import { SummarizationProgress } from "./summarization-progress";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { LoadingRing } from "@/components/ai-elements/loading-ring";
import { Bot, Loader2, BarChart3, MessageSquare, TrendingUp, Users, FileSpreadsheet } from "lucide-react";
import { nanoid } from "nanoid";
import { generateUUID } from "@/lib/uuid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareMenu } from "./share-menu"
import { MessageShareButton } from "./message-share-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string; // AI thinking process
  chartData?: any;
  chartConfig?: any;
  charts?: Array<{ chartData: any; chartConfig: any }>;
  isGeneratingChart?: boolean;
  tableData?: { rows: any[][]; columns: string[]; rowCount: number };
  sqlQuery?: string;
  sqlQueries?: string[];
  datasets?: Array<{ id: string; queryData: { rows: any[][]; columns: string[]; rowCount: number }; sqlQuery: string }>;
  isError?: boolean;
  errorType?: string;
  errorDetails?: any;
  isSummarizing?: boolean;
  summarizationProgress?: number;
  summarizationStatus?: string;
};

interface ChatInterfaceProps {
  conversationId?: string;
}

export function ChatInterface({ conversationId: initialConversationId }: ChatInterfaceProps = {}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastQueryData, setLastQueryData] = useState<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isSqlSidebarOpen, setIsSqlSidebarOpen] = useState(false);
  const [sqlHistory, setSqlHistory] = useState<Array<{ id: string; query: string; timestamp: Date }>>([]);
  
  // Chat history management state
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const isLoadingConversation = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const HISTORY_SIDEBAR_WIDTH = 320;
  const SQL_SIDEBAR_WIDTH = 400;

  const parseMaybeJSON = (value: unknown) => {
    if (!value) return value;
    
    // If it's already an object, return it
    if (typeof value === 'object') {
      return value;
    }
    
    if (typeof value === "string") {
      // Skip if it's the string "[object Object]" - this is corrupted data
      if (value === "[object Object]") {
        console.warn("Skipping corrupted [object Object] string");
        return undefined;
      }
      
      try {
        const parsed = JSON.parse(value);
        // Validate that parsed value is not empty or incomplete
        if (parsed === null || parsed === undefined || (typeof parsed === 'object' && Object.keys(parsed).length === 0)) {
          console.warn("Parsed JSON is empty or incomplete:", value);
          return undefined;
        }
        return parsed;
      } catch (error) {
        console.warn("Failed to parse JSON value from history", error, "Value:", value);
        return undefined;
      }
    }
    return value;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Debug log for messages state
  useEffect(() => {
    console.log('💬 Messages state changed:', messages.length, 'messages');
  }, [messages]);

  // Load conversation from URL on mount
  useEffect(() => {
    console.log('🔍 useEffect triggered - initialConversationId:', initialConversationId, 'currentConversationId:', currentConversationId);
    if (initialConversationId) {
      // Only load if we haven't already loaded this conversation and not currently loading
      if (currentConversationId !== initialConversationId && !isLoadingConversation.current) {
        console.log('🚀 Starting to load conversation:', initialConversationId);
        isLoadingConversation.current = true;
        loadConversationData(initialConversationId).finally(() => {
          isLoadingConversation.current = false;
          console.log('✅ Finished loading conversation');
        });
      } else {
        console.log('⏭️ Skipping load - already loaded or loading in progress');
      }
    }
  }, [initialConversationId]); // Only re-run when URL param changes

  // Don't auto-create conversations - only create when user sends first message

  // Auto-save messages when they change (after initial load)
  useEffect(() => {
    if (currentConversationId && hasUnsavedChanges && messages.length > 0) {
      saveCurrentConversation();
    }
  }, [messages]);

  // Start a new chat (don't create DB entry until first message is sent)
  const createNewConversation = async () => {
    const newId = generateUUID();
    router.push(`/ask-ai/${newId}`);
    setCurrentConversationId(newId);
    setMessages([]);
    setHasUnsavedChanges(false);
    setSqlHistory([]);
  };

  // Helper function to load conversation data
  const loadConversationData = async (conversationId: string) => {
    try {
      console.log('🔄 Loading conversation:', conversationId);
      const response = await fetch(`/api/chat-history/conversations/${conversationId}`);
      const data = await response.json();
      console.log('📦 Received data:', data);
      
      if (data.success && data.messages && data.messages.length > 0) {
        // Conversation exists in database - load it
        console.log('✅ Found conversation with', data.messages.length, 'messages');
        setCurrentConversationId(conversationId);
        
        // Transform messages from database format to UI format
        const loadedMessages = data.messages.map((msg: any) => {
          // Safely parse chart data
          let chartData = parseMaybeJSON(msg.chart_data);
          let chartConfig = parseMaybeJSON(msg.chart_config);
          let charts = parseMaybeJSON(msg.charts);
          
          // Log chart data for debugging
          if (chartData) {
            console.log('📊 Message', msg.id, 'has chartData:', {
              type: Array.isArray(chartData) ? 'array' : typeof chartData,
              length: Array.isArray(chartData) ? chartData.length : 'N/A',
              hasNaN: Array.isArray(chartData) ? chartData.some((item: any) => {
                for (const key in item) {
                  const val = item[key];
                  if (typeof val === 'number' && !isFinite(val)) return true;
                }
                return false;
              }) : false,
              sample: Array.isArray(chartData) && chartData.length > 0 ? chartData[0] : chartData,
            });
          }
          
          // Validate chart data
          if (chartData && !Array.isArray(chartData)) {
            console.warn('Invalid chartData for message', msg.id, '- resetting to undefined');
            chartData = undefined;
          }
          if (chartConfig && typeof chartConfig !== 'object') {
            console.warn('Invalid chartConfig for message', msg.id, '- resetting to undefined');
            chartConfig = undefined;
          }
          if (charts && !Array.isArray(charts)) {
            console.warn('Invalid charts for message', msg.id, '- resetting to undefined');
            charts = undefined;
          }
          
          return {
            id: msg.id,
            role: msg.role,
            content: msg.content,
            reasoning: msg.reasoning,
            chartData,
            chartConfig,
            charts,
            tableData: parseMaybeJSON(msg.table_data),
            sqlQuery: msg.sql_query,
            sqlQueries: parseMaybeJSON(msg.sql_queries),
            datasets: parseMaybeJSON(msg.datasets),
          };
        });
        
        console.log('✅ Setting messages:', loadedMessages);
        setMessages(loadedMessages);
        setHasUnsavedChanges(false);
        
        // Load SQL history from messages
        const sqlHistoryFromMessages: any[] = [];
        loadedMessages.forEach((msg: any) => {
          if (msg.sqlQuery) {
            sqlHistoryFromMessages.push({
              id: nanoid(),
              query: msg.sqlQuery,
              timestamp: new Date(msg.created_at || new Date()),
            });
          }
          if (msg.sqlQueries) {
            msg.sqlQueries.forEach((query: string) => {
              sqlHistoryFromMessages.push({
                id: nanoid(),
                query: query,
                timestamp: new Date(msg.created_at || new Date()),
              });
            });
          }
        });
        setSqlHistory(sqlHistoryFromMessages);
      } else {
        // Conversation doesn't exist yet (new/fresh URL) - start empty chat with this ID
        console.log('📝 Conversation not found in DB - starting fresh with ID:', conversationId);
        setCurrentConversationId(conversationId);
        setMessages([]);
        setSqlHistory([]);
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error("❌ Error loading conversation:", error);
      // On error, still set the ID so user can start chatting
      setCurrentConversationId(conversationId);
      setMessages([]);
      setSqlHistory([]);
      setHasUnsavedChanges(false);
    }
  };

  // Load a conversation and update URL (called from sidebar)
  const loadConversation = async (conversationId: string) => {
    // Just update the URL - the useEffect will handle loading the data
    router.push(`/ask-ai/${conversationId}`);
  };

  // Save the current conversation
  const saveCurrentConversation = async () => {
    if (!currentConversationId || messages.length === 0) return;

    try {
      await fetch("/api/chat-history/messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: currentConversationId,
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            reasoning: msg.reasoning,
            chartData: msg.chartData,
            chartConfig: msg.chartConfig,
            charts: msg.charts,
            tableData: msg.tableData,
            sqlQuery: msg.sqlQuery,
            sqlQueries: msg.sqlQueries,
            datasets: msg.datasets,
          })),
        }),
      });
      setHasUnsavedChanges(false);
      // Trigger sidebar refresh to show newly saved conversation
      setSidebarRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error("Error saving conversation:", error);
    }
  };

  // Function to try generating visualization
  const tryGenerateVisualization = async (
    messageId: string, 
    question: string, 
    sqlQuery: string,
    queryData: any
  ) => {
    if (!queryData || !queryData.rows || queryData.rows.length < 2) {
      console.log("📊 Not enough data for visualization");
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, isGeneratingChart: true }
          : m
      )
    );

    try {
      const vizResponse = await fetch("/api/visualize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          query: sqlQuery,
          data: queryData,
        }),
      });

      if (!vizResponse.ok) {
        throw new Error("Visualization API failed");
      }

      const vizData = await vizResponse.json();
      
      if (vizData.success && vizData.canVisualize) {
        setHasUnsavedChanges(true);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  chartData: vizData.data,
                  chartConfig: vizData.chartConfig,
                  isGeneratingChart: false,
                }
              : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, isGeneratingChart: false }
              : m
          )
        );
      }
    } catch (error) {
      console.error("❌ Visualization error:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, isGeneratingChart: false }
            : m
        )
      );
    }
  };

  // Function to generate multiple visualizations
  const tryGenerateMultipleVisualizations = async (
    messageId: string,
    question: string,
    datasets: Array<{ id: string; queryData: any; sqlQuery: string }>
  ) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, isGeneratingChart: true } : m
      )
    );

    try {
      const charts: Array<{ chartData: any; chartConfig: any }> = [];

      const canCombine = datasets.length > 1 && datasets.every(ds => {
        const cols = ds.queryData.columns || [];
        return cols.some((col: string) => 
          col.includes('date') || col.includes('day') || col.includes('month') || col.includes('year')
        );
      });

      if (canCombine) {
        try {
          const vizResponse = await fetch("/api/visualize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question,
              datasets: datasets.map(ds => ({
                query: ds.sqlQuery,
                data: ds.queryData,
              })),
              combineMode: true,
            }),
          });

          if (vizResponse.ok) {
            const vizData = await vizResponse.json();
            if (vizData.success && vizData.canVisualize) {
              charts.push({
                chartData: vizData.data,
                chartConfig: vizData.chartConfig,
              });
            }
          }
        } catch (err) {
          console.error("Error generating combined chart:", err);
        }
      } else {
        for (let i = 0; i < datasets.length; i++) {
          const dataset = datasets[i];

          try {
            const vizResponse = await fetch("/api/visualize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                question,
                query: dataset.sqlQuery,
                data: dataset.queryData,
              }),
            });

            if (vizResponse.ok) {
              const vizData = await vizResponse.json();
              if (vizData.success && vizData.canVisualize) {
                charts.push({
                  chartData: vizData.data,
                  chartConfig: vizData.chartConfig,
                });
              }
            }
          } catch (err) {
            console.error(`Error generating chart ${i + 1}:`, err);
          }
        }
      }

      if (charts.length > 0) {
        setHasUnsavedChanges(true);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  charts,
                  isGeneratingChart: false,
                }
              : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, isGeneratingChart: false } : m
          )
        );
      }
    } catch (error) {
      console.error("Multiple visualization error:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, isGeneratingChart: false } : m
        )
      );
    }
  };

  const handleSubmit = async (textToSend?: string) => {
    const messageText = textToSend || input;
    if (!messageText.trim() || isLoading) return;

    // Create a new conversation if this is the first message
    let conversationIdToUse = currentConversationId;
    if (!currentConversationId) {
      try {
        const response = await fetch("/api/chat-history/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Chat" }),
        });
        const data = await response.json();
        if (data.success) {
          conversationIdToUse = data.conversation.id;
          setCurrentConversationId(conversationIdToUse);
          // Update URL to the new conversation ID
          router.push(`/ask-ai/${conversationIdToUse}`);
        }
      } catch (error) {
        console.error("Error creating conversation:", error);
      }
    }

    const userMessage: Message = {
      id: nanoid(),
      role: "user",
      content: messageText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setHasUnsavedChanges(true);

    try {
      abortControllerRef.current = new AbortController();
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
            // Include context from previous interactions for better conversation flow
            reasoning: m.reasoning,
            sqlQuery: m.sqlQuery,
            tableData: m.tableData ? {
              columns: m.tableData.columns,
              rowCount: m.tableData.rowCount,
              // Send first 5 rows as sample context (not all rows to avoid token bloat)
              sampleRows: m.tableData.rows?.slice(0, 5)
            } : undefined,
          })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        let errorMessage = `Server error (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          try {
            const errorText = await response.text();
            if (errorText) errorMessage = errorText;
          } catch (e2) {
            // Use default message
          }
        }
        throw new Error(errorMessage);
      }

      const responseData = await response.json();

      const assistantId = nanoid();
      const assistantMessage = responseData.text || "";
      const isProgressiveLoading = responseData.progressiveLoading === true;

      setHasUnsavedChanges(true);

      const tableData = responseData.queryData ? {
        rows: responseData.queryData.rows,
        columns: responseData.queryData.columns,
        rowCount: responseData.queryData.rowCount,
      } : undefined;

      // Store SQL queries for sidebar display
      if (responseData.sqlQuery) {
        setSqlHistory(prev => [...prev, {
          id: assistantId,
          query: responseData.sqlQuery,
          timestamp: new Date()
        }]);
      }

      if (responseData.datasets) {
        responseData.datasets.forEach((dataset: any) => {
          if (dataset.sqlQuery) {
            setSqlHistory(prev => [...prev, {
              id: nanoid(),
              query: dataset.sqlQuery,
              timestamp: new Date()
            }]);
          }
        });
      }

      // Add message with table data immediately (summary comes later if progressive loading)
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant" as const,
          content: assistantMessage,
          reasoning: responseData.reasoning,
          tableData,
          sqlQuery: responseData.sqlQuery,
          sqlQueries: responseData.datasets?.map((ds: any) => ds.sqlQuery).filter(Boolean),
          datasets: responseData.datasets,
          loadingSummary: isProgressiveLoading, // Flag to show summary loading state
          loadingVisualization: isProgressiveLoading && responseData.hasData,
        },
      ]);

      // PROGRESSIVE LOADING: Fire summary and visualization in parallel, show BOTH when complete
      if (isProgressiveLoading && responseData.queryData) {
        console.log("🚀 PROGRESSIVE LOADING: Firing summary and visualization in parallel");

        // Wait for BOTH to complete, then update message ONCE with all data
        Promise.all([
          // Fetch summary
          fetch("/api/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userQuestion: messageText,
              sqlQuery: responseData.sqlQuery,
              queryData: responseData.queryData,
              currentDateTime: new Date().toISOString(),
              conversationHistory: messages.slice(0, -1), // Pass all messages except the current one being processed
            }),
          })
            .then(res => res.json())
            .then(summaryData => {
              console.log("✅ Summary received");
              return summaryData.summary || "";
            })
            .catch(err => {
              console.error("❌ Summary generation failed:", err);
              return "Summary could not be generated.";
            }),

          // Generate visualization
          responseData.hasData && responseData.queryData
            ? tryGenerateVisualization(
                assistantId,
                responseData.question,
                responseData.sqlQuery,
                responseData.queryData
              ).then(() => {
                console.log("✅ Visualization received");
                // Get the chart data from the message that was updated by tryGenerateVisualization
                return true;
              })
            : Promise.resolve(false),
        ]).then(([summary, hasVisualization]) => {
          console.log("🎉 BOTH summary and visualization complete - updating message");
          // Update message with BOTH summary and turn off loading flags
          setMessages(prev => prev.map(msg =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: summary,
                  loadingSummary: false,
                  loadingVisualization: false
                }
              : msg
          ));
        });
      } else {
        // Traditional flow: Handle visualization(s)
        if (responseData.hasData) {
          if (responseData.multipleQueries && responseData.datasets) {
            await tryGenerateMultipleVisualizations(
              assistantId,
              responseData.question,
              responseData.datasets
            );
          } else if (responseData.queryData) {
            await tryGenerateVisualization(
              assistantId,
              responseData.question,
              responseData.sqlQuery,
              responseData.queryData
            );
          }
        }
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("Chat error:", error);
        
        // Check if response has error details
        let errorType = "UNKNOWN";
        let errorDetails = null;
        let errorMessage = error.message || 'Unknown error';
        
        // If error is from API response, use those details
        if (error.response) {
          try {
            const errorData = await error.response.json();
            errorType = errorData.errorType || "UNKNOWN";
            errorMessage = errorData.error || errorMessage;
            errorDetails = errorData.details;
          } catch (e) {
            // Failed to parse error response
          }
        }
        
        setMessages((prev) => [
          ...prev,
          {
            id: nanoid(),
            role: "assistant",
            content: errorMessage,
            isError: true,
            errorType: errorType,
            errorDetails: errorDetails,
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    // Find the index of the message being edited
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    // Remove the edited message and all messages after it
    const updatedMessages = messages.slice(0, messageIndex);
    
    // Update state - remove old messages, handleSubmit will add the new one
    setMessages(updatedMessages);
    setHasUnsavedChanges(true);
    
    // Re-submit the edited message to get new response
    await handleSubmit(newContent);
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Left Sidebar - Chat History */}
      <ChatHistorySidebar
        currentConversationId={currentConversationId}
        onSelectConversation={loadConversation}
        onNewChat={createNewConversation}
        isOpen={isHistorySidebarOpen}
        onToggle={() => setIsHistorySidebarOpen(!isHistorySidebarOpen)}
        refreshKey={sidebarRefreshKey}
      />
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b bg-white px-6 py-4 shadow-sm sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center">
                <img
                  src="https://nfpcsfalive.winitsoftware.com/nfpcsfa-92/Img/logoNew1.jpg?v=2"
                  alt="NFPC Logo"
                  className="h-14 w-auto rounded-sm border border-gray-200 bg-white shadow-md"
                />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">NFPC Analytics</h1>
                <p className="text-sm text-slate-500">AI-Powered Analytics Assistant</p>
              </div>
            </div>
            {messages.length > 0 && (
              <ShareMenu
                messages={messages}
                conversationTitle="NFPC Analytics Chat"
                variant="outline"
                size="sm"
              />
            )}
          </div>
        </div>

        {/* Messages Container */}
        <ScrollArea
          className="flex-1 px-6 transition-[padding] duration-300"
          style={{
            paddingLeft: `calc(1.5rem + ${isHistorySidebarOpen ? HISTORY_SIDEBAR_WIDTH : 0}px)`,
            paddingRight: `calc(1.5rem + ${isSqlSidebarOpen ? SQL_SIDEBAR_WIDTH : 0}px)`
          }}
        >
          <div className="max-w-4xl mx-auto py-6 space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="max-w-4xl w-full">
                  {/* Welcome Header */}
                  <div className="text-center mb-12">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white mb-6 mx-auto shadow-lg">
                      <Bot className="h-8 w-8" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 mb-3">
                      Business Intelligence Assistant
                    </h1>
                    <p className="text-slate-600 max-w-2xl mx-auto">
                      Access real-time business metrics, analyze performance data, and generate comprehensive reports through natural language queries.
                    </p>
                  </div>

                  {/* Feature Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
                    <Card className="border-slate-200 hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 mb-4">
                          <TrendingUp className="h-5 w-5 text-slate-700" />
                        </div>
                        <h3 className="font-semibold text-slate-900 mb-2">Sales Analytics</h3>
                        <p className="text-sm text-slate-600">
                          Monitor sales performance, track revenue trends, and identify top-performing products.
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200 hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 mb-4">
                          <Users className="h-5 w-5 text-slate-700" />
                        </div>
                        <h3 className="font-semibold text-slate-900 mb-2">Customer Insights</h3>
                        <p className="text-sm text-slate-600">
                          Analyze customer behavior, segment audiences, and track customer lifetime value.
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200 hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 mb-4">
                          <FileSpreadsheet className="h-5 w-5 text-slate-700" />
                        </div>
                        <h3 className="font-semibold text-slate-900 mb-2">Automated Reports</h3>
                        <p className="text-sm text-slate-600">
                          Generate detailed reports with visualizations and export data in multiple formats.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            )}

            {messages.map((message: any, index: number) => (
              <div key={message.id} data-message-id={message.id} className="space-y-4">
                {/* Show ChatMessage for user messages (always) or assistant messages with content */}
                {(message.role === "user" || message.content) && (
                  <ChatMessage
                    message={{
                      id: message.id,
                      role: message.role as "user" | "assistant",
                      content: message.content,
                      reasoning: message.reasoning,
                    }}
                    onEdit={message.role === "user" ? handleEditMessage : undefined}
                    isEditable={message.role === "user" && !isLoading}
                    isStreaming={isLoading && index === messages.length - 1 && message.role === "assistant"}
                  />
                )}

                {/* Progressive Loading State - Show BEFORE any content (charts/tables) if summary/viz are loading */}
                {(message.loadingSummary || message.loadingVisualization) && (
                  <div className="flex items-center gap-3 py-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white flex-shrink-0">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="flex items-center gap-3">
                      <LoadingRing size="md" />
                      <Shimmer as="h2" className="text-2xl font-bold">
                        Summarizing & Visualizing...
                      </Shimmer>
                    </div>
                  </div>
                )}

                {/* Single Chart */}
                {message.chartData &&
                 Array.isArray(message.chartData) &&
                 message.chartData.length > 0 &&
                 message.chartConfig &&
                 !message.isGeneratingChart &&
                 !message.charts && (
                  <div className="ml-14" data-chart>
                    <DataChart config={message.chartConfig} data={message.chartData} />
                  </div>
                )}

                {/* Multiple Charts */}
                {message.charts &&
                 Array.isArray(message.charts) &&
                 message.charts.length > 0 &&
                 !message.isGeneratingChart && (
                  <div className="ml-14 space-y-4">
                    {message.charts.map((chart: any, index: number) => {
                      // Validate chart data before rendering
                      if (!chart || !chart.chartData || !Array.isArray(chart.chartData) || chart.chartData.length === 0 || !chart.chartConfig) {
                        return null;
                      }
                      return (
                        <div key={`chart-${index}`} className="relative" data-chart>
                          <Badge
                            className="absolute -left-10 top-4 bg-slate-100 text-slate-700"
                          >
                            #{index + 1}
                          </Badge>
                          <DataChart config={chart.chartConfig} data={chart.chartData} />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Single Data Table */}
                {message.tableData && message.tableData.rows && message.tableData.rows.length > 0 && !message.sqlQueries && (
                  <div className="ml-14 space-y-4">
                    <DataTable
                      data={message.tableData}
                      title="Query Results"
                    />
                  </div>
                )}

                {/* Multiple Data Tables */}
                {message.datasets && message.datasets.length > 0 && (
                  <div className="ml-14 space-y-4">
                    {message.datasets.map((dataset: any, datasetIndex: number) => (
                      <div key={`table-${datasetIndex}`} className="relative">
                        <Badge 
                          className="absolute -left-10 top-4 bg-slate-100 text-slate-700"
                        >
                          #{datasetIndex + 1}
                        </Badge>
                        <DataTable 
                          data={dataset.queryData} 
                          title={`Query ${datasetIndex + 1} Results`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Individual Message Share Button - Only for assistant messages with a preceding user message */}
                {message.role === "assistant" && index > 0 && messages[index - 1]?.role === "user" && (
                  <div className="ml-14 mt-2 flex justify-end">
                    <MessageShareButton 
                      questionMessage={messages[index - 1]}
                      answerMessage={message}
                      messageIndex={Math.floor(index / 2)}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* AI Loading State - Initial SQL query execution */}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-3 py-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white flex-shrink-0">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-3">
                  <LoadingRing size="md" />
                  <Shimmer as="h2" className="text-2xl font-bold">
                    Thinking & Analyzing...
                  </Shimmer>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Chat Input */}
        <div
          className="border-t bg-white p-3 transition-[padding] duration-300"
          style={{
            paddingLeft: `calc(0.75rem + ${isHistorySidebarOpen ? HISTORY_SIDEBAR_WIDTH : 0}px)`,
            paddingRight: `calc(0.75rem + ${isSqlSidebarOpen ? SQL_SIDEBAR_WIDTH : 0}px)`
          }}
        >
          <div className="max-w-4xl mx-auto">
            <ChatInput
              input={input}
              setInput={setInput}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              onStop={handleStop}
            />
          </div>
        </div>
      </div>

      {/* Right Sidebar - SQL Queries */}
      <SqlQuerySidebar
        sqlHistory={sqlHistory}
        isOpen={isSqlSidebarOpen}
        onToggle={() => setIsSqlSidebarOpen(!isSqlSidebarOpen)}
      />
    </div>
  );
}

