import { ChatInterface } from "@/components/chat/chat-interface-v2";
import { Toaster } from "sonner";

export default async function ConversationPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params;
  
  return (
    <>
      <ChatInterface conversationId={id} />
      <Toaster position="top-center" richColors />
    </>
  );
}

