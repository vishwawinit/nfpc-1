/**
 * Summary Agent
 * Summarizes conversation history to manage context windows
 */

import { google } from "@ai-sdk/google";
import { generateText } from "ai";

/**
 * Summary Agent Prompt
 * Instructs the AI to create a concise, lossless summary of conversation
 */
const SUMMARY_AGENT_PROMPT = `You are a conversation summarizer for a business intelligence chatbot. Your ONLY job is to create an extremely concise, lossless summary of a conversation.

## CRITICAL RULES:
1. **Preserve ALL important context and facts** - Nothing important should be lost
2. **Remove filler, repetition, and unnecessary details** - Be ruthless about cutting fluff
3. **Keep technical details** - SQL queries, data points, metrics, numbers are ESSENTIAL
4. **Maintain conversation flow** - User should understand the context from summary
5. **Format as a single coherent summary** - Not a list, but flowing text
6. **Maximum length: 30% of original conversation** - Compress aggressively
7. **Include key questions asked** - What did the user want to know?
8. **Include important findings** - What data was retrieved?
9. **Include data points discussed** - Specific numbers, metrics, percentages
10. **Include SQL queries executed** - The actual queries (for context)

## SUMMARY FORMAT:
Start with: "CONVERSATION SUMMARY:"
Then provide:
- Key questions asked: [list of main questions]
- Important findings: [key data points and insights]
- Data analyzed: [what tables/metrics were queried]
- SQL queries executed: [list of queries]
- Current context: [brief description of where we are in the conversation]

## EXAMPLE:
CONVERSATION SUMMARY:
Key questions: User asked about top customers by sales volume, product category distribution, and regional performance analysis.
Important findings: Top customer led with AED 500K (25% of total sales), followed by second customer with AED 450K. Grocery category dominates with 52% of revenue. Region A accounts for 60% of total transactions.
Data analyzed: Queried flat_daily_sales_report table for customer performance, product categories, and regional distribution across date range.
SQL queries:
1. SELECT customer_description, SUM(trx_totalamount) FROM flat_daily_sales_report WHERE trx_trxdate >= '2024-10-01' AND trx_trxdate <= '2024-12-31' AND trx_trxstatus = 200 GROUP BY customer_description ORDER BY SUM(trx_totalamount) DESC LIMIT 10
2. SELECT item_category_description, COUNT(*) FROM flat_daily_sales_report WHERE trx_trxdate >= '2024-10-01' AND trx_trxdate <= '2024-12-31' AND trx_trxstatus = 200 GROUP BY item_category_description
3. SELECT region_description, item_brand_description, SUM(trx_totalamount) FROM flat_daily_sales_report WHERE trx_trxdate >= '2024-10-01' AND trx_trxdate <= '2024-12-31' AND trx_trxstatus = 200 GROUP BY region_description, item_brand_description
Current context: User is analyzing business performance and customer segments. Ready to answer follow-up questions about specific metrics or drill into particular segments.`;

/**
 * Summarize conversation history
 * @param messages - Array of conversation messages
 * @returns Summarized conversation as a string
 */
export async function summarizeConversation(
  messages: any[],
  apiKey: string
): Promise<{
  success: boolean;
  summary?: string;
  error?: string;
  messagesReplaced?: number;
}> {
  try {
    console.log("\n" + "📝".repeat(40));
    console.log("SUMMARIZING CONVERSATION");
    console.log("📝".repeat(40));
    console.log(`📊 Messages to summarize: ${messages.length}`);
    
    // Build conversation text for summarization
    const conversationText = messages
      .map((msg, idx) => {
        let text = `[Message ${idx + 1}] ${msg.role.toUpperCase()}:\n${msg.content}`;
        if (msg.reasoning) {
          text += `\n[Reasoning]: ${msg.reasoning}`;
        }
        return text;
      })
      .join("\n\n---\n\n");
    
    console.log(`📄 Conversation text length: ${conversationText.length} characters`);
    
    // Call summary agent
    console.log("🤖 Calling summary agent...");
    
    const model = google('gemini-2.5-flash');
    
    const result = await generateText({
      model,
      system: SUMMARY_AGENT_PROMPT,
      prompt: `Please summarize this conversation:\n\n${conversationText}`,
      temperature: 0.3, // Lower temperature for consistent summaries
    });
    
    const summary = result.text;
    
    console.log(`✅ Summary generated successfully`);
    console.log(`📏 Summary length: ${summary.length} characters`);
    console.log(`📊 Compression ratio: ${((1 - summary.length / conversationText.length) * 100).toFixed(1)}%`);
    console.log("\n" + "📝".repeat(40) + "\n");
    
    return {
      success: true,
      summary,
      messagesReplaced: messages.length,
    };
  } catch (error: any) {
    console.error("❌ Summary agent error:", error.message);
    return {
      success: false,
      error: error.message || "Failed to summarize conversation",
    };
  }
}

/**
 * Create a summary message for the conversation
 * This message will replace old messages in the conversation history
 */
export function createSummaryMessage(summary: string): any {
  return {
    role: "system",
    content: `CONVERSATION HISTORY SUMMARY:\n\n${summary}\n\n---\n\nThis is a summary of previous conversation. Continue from this context.`,
  };
}

/**
 * Replace old messages with summary
 * Keeps the last N messages and replaces everything before with a summary
 */
export function replaceWithSummary(
  messages: any[],
  summary: string,
  keepLastN: number = 5
): any[] {
  // Keep last N messages
  const recentMessages = messages.slice(-keepLastN);
  
  // Create summary message
  const summaryMessage = createSummaryMessage(summary);
  
  // Return: [summary, ...recent messages]
  return [summaryMessage, ...recentMessages];
}

/**
 * Format summary progress for streaming to client
 */
export function formatSummaryProgress(
  progress: number,
  status: string
): {
  isSummarizing: true;
  summarizationProgress: number;
  summarizationStatus: string;
} {
  return {
    isSummarizing: true,
    summarizationProgress: Math.min(progress, 100),
    summarizationStatus: status,
  };
}
