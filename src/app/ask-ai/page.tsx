import { redirect } from "next/navigation";
import { generateUUID } from "@/lib/uuid";

export default function AskAIPage() {
  // Generate a new conversation ID and redirect
  const newConversationId = generateUUID();
  redirect(`/ask-ai/${newConversationId}`);
}

