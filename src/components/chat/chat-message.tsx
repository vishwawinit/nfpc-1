"use client";

import { motion } from "framer-motion";
import { Bot, User, Edit2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/Reasoning";
import { ErrorMessage } from "./error-message";
import { SummarizationProgress } from "./summarization-progress";

interface ChatMessageProps {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
    reasoning?: string;
    isError?: boolean;
    errorType?: string;
    errorDetails?: any;
    isSummarizing?: boolean;
    summarizationProgress?: number;
    summarizationStatus?: string;
  };
  onEdit?: (messageId: string, newContent: string) => void;
  isEditable?: boolean;
  isStreaming?: boolean;
}

export function ChatMessage({ message, onEdit, isEditable = true, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const handleSaveEdit = () => {
    if (editContent.trim() && onEdit) {
      onEdit(message.id, editContent.trim());
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex gap-3 p-4 rounded-lg",
        isUser ? "bg-blue-50 ml-12" : "bg-gray-50 mr-12"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md",
          isUser ? "bg-blue-500 text-white" : "bg-gray-700 text-white"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className="flex-1 space-y-2 overflow-hidden">
        {isUser ? (
          <div className="space-y-2">
            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[80px] text-sm resize-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveEdit();
                    }
                    if (e.key === "Escape") {
                      handleCancelEdit();
                    }
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Save & Regenerate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelEdit}
                    className="cursor-pointer"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="group relative">
                <div className="flex items-start gap-2">
                  <p className="text-base text-gray-700 whitespace-pre-wrap break-words flex-1">
                    {message.content}
                  </p>
                  {isEditable && onEdit && (
                    <Button
                      size="lg"
                      variant="ghost"
                      onClick={() => setIsEditing(true)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer h-10 w-10 p-0 flex-shrink-0"
                    >
                      <Edit2 className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 w-full">
            {/* Handle Summarization Progress */}
            {message.isSummarizing && (
              <SummarizationProgress
                progress={message.summarizationProgress || 0}
                status={message.summarizationStatus || "Summarizing..."}
              />
            )}

            {/* Handle Error Messages */}
            {message.isError ? (
              <ErrorMessage
                error={message.content}
                errorType={message.errorType}
                details={message.errorDetails}
                timestamp={new Date().toISOString()}
              />
            ) : (
              <div className="prose prose-sm max-w-none prose-gray">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ node, ...props }) => (
                      <h1 className="text-2xl font-bold mt-4 mb-2" {...props} />
                    ),
                    h2: ({ node, ...props }) => (
                      <h2 className="text-xl font-semibold mt-3 mb-2" {...props} />
                    ),
                    h3: ({ node, ...props }) => (
                      <h3 className="text-lg font-semibold mt-2 mb-1" {...props} />
                    ),
                    p: ({ node, ...props }) => (
                      <p className="text-base text-gray-700 mb-2" {...props} />
                    ),
                    ul: ({ node, ...props }) => (
                      <ul className="list-disc list-inside mb-2 text-base" {...props} />
                    ),
                    ol: ({ node, ...props }) => (
                      <ol className="list-decimal list-inside mb-2 text-base" {...props} />
                    ),
                    li: ({ node, ...props }) => (
                      <li className="text-gray-700 mb-1 text-base" {...props} />
                    ),
                    code: ({ node, inline, ...props }: any) =>
                      inline ? (
                        <code
                          className="bg-gray-200 text-red-600 px-1 py-0.5 rounded text-xs font-mono"
                          {...props}
                        />
                      ) : (
                        <code
                          className="block bg-gray-800 text-gray-100 p-3 rounded-lg text-xs font-mono overflow-x-auto mb-2"
                          {...props}
                        />
                      ),
                    pre: ({ node, ...props }) => (
                      <pre className="mb-2" {...props} />
                    ),
                    blockquote: ({ node, ...props }) => (
                      <blockquote
                        className="border-l-4 border-gray-300 pl-4 italic text-gray-600 mb-2"
                        {...props}
                      />
                    ),
                    a: ({ node, ...props }) => (
                      <a
                        className="text-blue-600 hover:text-blue-800 underline"
                        target="_blank"
                        rel="noopener noreferrer"
                        {...props}
                      />
                    ),
                    strong: ({ node, ...props }) => (
                      <strong className="font-semibold text-gray-900" {...props} />
                    ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}

            {/* Reasoning Section */}
            {message.reasoning && !message.isError && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <Reasoning isStreaming={isStreaming} className="w-full">
                  <ReasoningTrigger title="🧠 AI Thinking Process" />
                  <ReasoningContent>{message.reasoning}</ReasoningContent>
                </Reasoning>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

