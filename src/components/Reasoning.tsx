'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface ReasoningProps {
  isStreaming?: boolean;
  children?: React.ReactNode;
  className?: string;
}

interface ReasoningTriggerProps {
  title?: string;
  className?: string;
}

interface ReasoningContentProps {
  children?: React.ReactNode;
  className?: string;
}

/**
 * Reasoning Component - Displays AI thinking process
 * Automatically opens during streaming and closes when finished
 */
export const Reasoning: React.FC<ReasoningProps> = ({
  isStreaming = false,
  children,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(isStreaming);

  useEffect(() => {
    setIsOpen(isStreaming);
  }, [isStreaming]);

  return (
    <div className={`w-full border border-blue-200 rounded-lg bg-blue-50 overflow-hidden ${className}`}>
      {children}
    </div>
  );
};

/**
 * ReasoningTrigger - Collapsible header for reasoning content
 */
export const ReasoningTrigger: React.FC<ReasoningTriggerProps> = ({
  title = 'AI Thinking',
  className = '',
}) => {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className={`w-full px-4 py-3 flex items-center justify-between bg-blue-100 hover:bg-blue-150 transition-colors ${className}`}
    >
      <div className="flex items-center gap-2">
        <div className="animate-pulse">
          <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
        </div>
        <span className="text-sm font-semibold text-blue-900">{title}</span>
      </div>
      <ChevronDown
        size={18}
        className={`text-blue-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
      />
    </button>
  );
};

/**
 * ReasoningContent - Displays the actual thinking text
 */
export const ReasoningContent: React.FC<ReasoningContentProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`px-4 py-3 text-sm text-blue-900 bg-white max-h-96 overflow-y-auto ${className}`}>
      <div className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
        {children}
      </div>
    </div>
  );
};

export default Reasoning;
