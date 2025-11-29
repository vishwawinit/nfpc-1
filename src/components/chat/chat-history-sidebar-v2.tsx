"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  ChevronLeft,
  Menu,
  Clock,
  Calendar,
  History,
} from "lucide-react";
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Conversation = {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
};

type ChatHistorySidebarProps = {
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  isOpen: boolean;
  onToggle: () => void;
  refreshKey?: number;
};

export function ChatHistorySidebar({
  currentConversationId,
  onSelectConversation,
  onNewChat,
  isOpen,
  onToggle,
  refreshKey,
}: ChatHistorySidebarProps) {
  const NAVBAR_HEIGHT = 64;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversations();
  }, [refreshKey]);

  useEffect(() => {
    if (!isOpen && editingId !== null) {
      cancelEditing();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (editingId !== null) {
        const target = e.target as HTMLElement;
        if (!target.closest('.edit-conversation-input')) {
          cancelEditing();
        }
      }
    };

    if (editingId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [editingId]);

  const fetchConversations = async () => {
    try {
      const response = await fetch("/api/chat-history/conversations");
      const data = await response.json();
      if (data.success) {
        setConversations(data.conversations);
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this conversation?")) return;

    try {
      const response = await fetch("/api/chat-history/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id }),
      });

      if (response.ok) {
        setConversations(conversations.filter((c) => c.id !== id));
        if (currentConversationId === id) {
          onNewChat();
        }
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  };

  const handleRename = async (id: string) => {
    if (!editingTitle.trim()) {
      setEditingId(null);
      return;
    }

    try {
      const response = await fetch(`/api/chat-history/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingTitle }),
      });

      if (response.ok) {
        setConversations(
          conversations.map((c) =>
            c.id === id ? { ...c, title: editingTitle } : c
          )
        );
      }
    } catch (error) {
      console.error("Error renaming conversation:", error);
    } finally {
      setEditingId(null);
    }
  };

  const startEditing = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(title);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  // Group conversations by time period
  const groupConversations = () => {
    const grouped: { [key: string]: Conversation[] } = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      "This Month": [],
      Older: [],
    };

    const filtered = conversations.filter((c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    filtered.forEach((conv) => {
      const date = new Date(conv.updated_at);
      if (isToday(date)) {
        grouped["Today"].push(conv);
      } else if (isYesterday(date)) {
        grouped["Yesterday"].push(conv);
      } else if (isThisWeek(date)) {
        grouped["This Week"].push(conv);
      } else if (isThisMonth(date)) {
        grouped["This Month"].push(conv);
      } else {
        grouped["Older"].push(conv);
      }
    });

    return grouped;
  };

  const groupedConversations = groupConversations();

  const getTimeIcon = (period: string) => {
    switch (period) {
      case "Today":
        return <Clock className="h-3 w-3" />;
      case "Yesterday":
        return <History className="h-3 w-3" />;
      default:
        return <Calendar className="h-3 w-3" />;
    }
  };

  return (
    <TooltipProvider>
      {/* Sidebar */}
      <div
        className={cn(
          "fixed left-0 bg-[#1e293b] border-r border-gray-700 shadow-lg transition-all duration-300 z-10 flex flex-col overflow-hidden box-border",
          isOpen ? "w-80" : "w-0"
        )}
        style={{
          top: NAVBAR_HEIGHT,
          height: `calc(100vh - ${NAVBAR_HEIGHT}px)`,
          maxWidth: isOpen ? "320px" : "0px"
        }}
      >
        <div className={cn("flex flex-col h-full w-full max-w-full overflow-hidden box-border", !isOpen && "hidden")}>
          {/* Header */}
          <div className="p-4 pb-4 border-b border-gray-700 bg-[#1e293b] w-full max-w-full box-border">
            <Button
              onClick={() => {
                if (editingId !== null) {
                  cancelEditing();
                }
                onNewChat();
              }}
              className="w-full max-w-full bg-slate-700 hover:bg-slate-600 text-white shadow-sm cursor-pointer border border-slate-600 mt-6"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Chat
            </Button>
          </div>

          {/* Search */}
          <div className="p-4 bg-[#1e293b] border-b border-gray-700 w-full max-w-full box-border">
            <div className="relative w-full max-w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500 w-full max-w-full"
              />
            </div>
          </div>

          {/* Conversations List */}
          <ScrollArea
            className="flex-1 overflow-x-hidden [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-500"
            style={{ width: "320px", maxWidth: "320px" }}
          >
            <div className="p-3" style={{ width: "100%", maxWidth: "320px", boxSizing: "border-box" }}>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                </div>
              ) : (
                <div className="space-y-4" style={{ width: "100%", maxWidth: "296px", overflow: "hidden" }}>
                  {Object.entries(groupedConversations).map(([period, convs]) => {
                    if (convs.length === 0) return null;
                    return (
                      <div key={period} style={{ width: "100%", maxWidth: "296px", overflow: "hidden" }}>
                        <div className="flex items-center gap-2 px-2 py-1 mb-2" style={{ width: "100%", maxWidth: "296px" }}>
                          <span className="text-gray-400">{getTimeIcon(period)}</span>
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">
                            {period}
                          </span>
                          <Badge variant="secondary" className="ml-auto text-xs flex-shrink-0 bg-gray-700 text-gray-300">
                            {convs.length}
                          </Badge>
                        </div>

                        <div className="space-y-1" style={{ width: "100%", maxWidth: "296px", overflow: "hidden" }}>
                          {convs.map((conversation) => (
                            <Card
                              key={conversation.id}
                              onClick={() => {
                                if (editingId !== null) {
                                  cancelEditing();
                                }
                                onSelectConversation(conversation.id);
                              }}
                              className={cn(
                                "group cursor-pointer transition-all hover:shadow-sm relative border-0",
                                currentConversationId === conversation.id
                                  ? "bg-slate-700/50 text-white shadow-md border-l-2 border-indigo-500 rounded-l-none"
                                  : "bg-transparent text-gray-300 hover:bg-gray-800/50 hover:text-white"
                              )}
                              style={{ width: "100%", maxWidth: "296px", overflow: "hidden", boxSizing: "border-box" }}
                            >
                              <CardContent className="p-3 pr-12" style={{ width: "100%", maxWidth: "296px", overflow: "hidden", boxSizing: "border-box" }}>
                                <div className="flex items-start gap-3" style={{ width: "100%", minWidth: 0 }}>
                                  <MessageSquare className={cn(
                                    "h-4 w-4 mt-0.5 flex-shrink-0",
                                    currentConversationId === conversation.id
                                      ? "text-indigo-400"
                                      : "text-gray-500 group-hover:text-gray-400"
                                  )} />

                                  {editingId === conversation.id ? (
                                    <div className="flex-1 min-w-0 flex items-center gap-1 edit-conversation-input">
                                      <Input
                                        type="text"
                                        value={editingTitle}
                                        onChange={(e) => setEditingTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") handleRename(conversation.id);
                                          if (e.key === "Escape") cancelEditing();
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-7 text-sm flex-1 min-w-0 bg-gray-700 border-gray-600 text-white"
                                        autoFocus
                                      />
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 flex-shrink-0 cursor-pointer hover:bg-gray-600 text-white"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRename(conversation.id);
                                        }}
                                      >
                                        <Check className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 flex-shrink-0 cursor-pointer hover:bg-gray-600 text-white"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          cancelEditing();
                                        }}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex-1 overflow-hidden min-w-0">
                                        <p className={cn(
                                          "text-sm font-medium truncate",
                                          currentConversationId === conversation.id
                                            ? "text-white"
                                            : "text-gray-300 group-hover:text-white"
                                        )}
                                          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {conversation.title}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                          <span className={cn(
                                            "text-xs truncate",
                                            currentConversationId === conversation.id
                                              ? "text-blue-100"
                                              : "text-gray-500 group-hover:text-gray-400"
                                          )}>
                                            {format(new Date(conversation.updated_at), "MMM d, h:mm a")}
                                          </span>
                                          {conversation.message_count > 0 && (
                                            <Badge variant="outline" className={cn(
                                              "text-xs px-1 py-0 flex-shrink-0 border-0",
                                              currentConversationId === conversation.id
                                                ? "bg-white/20 text-white"
                                                : "bg-gray-700 text-gray-400"
                                            )}>
                                              {conversation.message_count} msgs
                                            </Badge>
                                          )}
                                        </div>
                                      </div>

                                      {/* Actions - Icons Only - Hidden by default, show on hover */}
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 absolute right-3 top-1/2 -translate-y-1/2">
                                        <button
                                          className={cn(
                                            "h-9 w-9 p-0 flex items-center justify-center rounded transition-colors cursor-pointer",
                                            currentConversationId === conversation.id
                                              ? "hover:bg-white/20 text-white"
                                              : "hover:bg-gray-700 text-gray-400 hover:text-white"
                                          )}
                                          onClick={(e) => startEditing(conversation.id, conversation.title, e)}
                                          title="Rename"
                                        >
                                          <Edit2 className="h-5 w-5" />
                                        </button>

                                        <button
                                          className={cn(
                                            "h-9 w-9 p-0 flex items-center justify-center rounded transition-colors cursor-pointer",
                                            currentConversationId === conversation.id
                                              ? "hover:bg-red-500/20 text-red-200 hover:text-red-100"
                                              : "hover:bg-red-900/30 text-red-400 hover:text-red-300"
                                          )}
                                          onClick={(e) => handleDelete(conversation.id, e)}
                                          title="Delete"
                                        >
                                          <Trash2 className="h-5 w-5" />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!loading && conversations.length === 0 && (
                <Card className="bg-gray-800/50 border-dashed border-gray-700">
                  <CardContent className="text-center py-12">
                    <MessageSquare className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-400 font-medium">No conversations yet</p>
                    <p className="text-xs text-gray-500 mt-1">Start a new chat to begin</p>
                  </CardContent>
                </Card>
              )}
            </div>
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
          isOpen ? "left-80" : "left-0 rounded-l-none"
        )}
      >
        {isOpen ? <ChevronLeft className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>
    </TooltipProvider>
  );
}

