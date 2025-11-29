/**
 * Token Counting Utilities
 * Estimates token usage for conversations to manage context windows
 */

/**
 * Rough token estimation: 1 token ≈ 4 characters
 * This is a fast approximation. For exact counting, use tiktoken library.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Count tokens for a single message
 */
export function countMessageTokens(message: any): number {
  let tokens = 0;
  
  if (message.content) {
    tokens += estimateTokens(message.content);
  }
  
  if (message.reasoning) {
    tokens += estimateTokens(message.reasoning);
  }
  
  // Add overhead for metadata
  tokens += 10;
  
  return tokens;
}

/**
 * Count total tokens in conversation
 */
export function countConversationTokens(messages: any[], systemPrompt: string): number {
  let total = estimateTokens(systemPrompt);
  
  messages.forEach(msg => {
    total += countMessageTokens(msg);
  });
  
  // Add buffer for response
  total += 500;
  
  return total;
}

/**
 * Check if conversation is approaching context limit
 */
export interface ContextStatus {
  totalTokens: number;
  percentageUsed: number;
  isApproachingLimit: boolean;
  needsSummarization: boolean;
  isCritical: boolean;
}

export function checkContextStatus(messages: any[], systemPrompt: string): ContextStatus {
  const CONTEXT_LIMIT = 1000000; // Gemini 2.5 Flash: 1M tokens
  const SUMMARIZATION_THRESHOLD = 750000; // 75% of limit
  const CRITICAL_THRESHOLD = 900000; // 90% of limit
  
  const totalTokens = countConversationTokens(messages, systemPrompt);
  const percentageUsed = (totalTokens / CONTEXT_LIMIT) * 100;
  
  return {
    totalTokens,
    percentageUsed,
    isApproachingLimit: totalTokens > SUMMARIZATION_THRESHOLD,
    needsSummarization: totalTokens > SUMMARIZATION_THRESHOLD,
    isCritical: totalTokens > CRITICAL_THRESHOLD,
  };
}

/**
 * Detect error type from error message
 */
export type ErrorType = 
  | 'CONTEXT_LIMIT' 
  | 'RATE_LIMIT' 
  | 'SQL_ERROR' 
  | 'API_ERROR' 
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export function detectErrorType(error: any): ErrorType {
  const message = error.message?.toLowerCase() || '';
  const code = error.code?.toLowerCase() || '';
  
  if (message.includes('context') || message.includes('token') || message.includes('limit')) {
    return 'CONTEXT_LIMIT';
  }
  
  if (message.includes('rate') || message.includes('quota') || code === '429') {
    return 'RATE_LIMIT';
  }
  
  if (message.includes('sql') || message.includes('query') || message.includes('column')) {
    return 'SQL_ERROR';
  }
  
  if (message.includes('api') || message.includes('request') || code === '500') {
    return 'API_ERROR';
  }
  
  if (message.includes('validation') || message.includes('invalid')) {
    return 'VALIDATION_ERROR';
  }
  
  return 'UNKNOWN';
}

/**
 * Format error details for display
 */
export interface ErrorDetails {
  message: string;
  code?: string;
  timestamp: string;
  requestContext: {
    messagesCount: number;
    estimatedTokens: number;
  };
}

export function formatErrorDetails(
  error: any,
  messagesCount: number,
  estimatedTokens: number
): ErrorDetails {
  return {
    message: error.message || 'Unknown error',
    code: error.code,
    timestamp: new Date().toISOString(),
    requestContext: {
      messagesCount,
      estimatedTokens,
    },
  };
}
