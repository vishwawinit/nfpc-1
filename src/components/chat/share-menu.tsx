"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Share2,
  Download,
  Loader2,
  Link,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ExportMessage,
  exportAsPDF,
} from "@/lib/export-utils";

interface ShareMenuProps {
  messages: ExportMessage[];
  conversationTitle?: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function ShareMenu({
  messages,
  conversationTitle = "AI Chat Conversation",
  variant = "ghost",
  size = "sm",
  className = "",
}: ShareMenuProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Filter out empty messages
  const validMessages = messages.filter(msg => msg.content && msg.content.trim().length > 0);

  if (validMessages.length === 0) {
    return null; // Don't show share button if no messages
  }


  const handleExportPDF = async () => {
    setIsExporting(true);
    
    // Show info toast
    toast.info("Preparing PDF export...", {
      description: "Make sure all charts are visible on screen",
      duration: 2000,
    });
    
    try {
      await exportAsPDF(validMessages, conversationTitle, (progress) => {
        console.log('📄 PDF Progress:', progress);
        toast.loading(progress, { id: 'pdf-export' });
      });
      
      toast.dismiss('pdf-export');
      toast.success("PDF exported successfully!", {
        description: "Charts and tables included - check your downloads",
      });
    } catch (error) {
      toast.dismiss('pdf-export');
      console.error('PDF export error:', error);
      toast.error("Failed to export PDF", {
        description: error instanceof Error ? error.message : "Check console for details",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyShareableLink = async () => {
    try {
      // Just copy the current URL (which already has /ask-ai/chatid format)
      const currentUrl = window.location.href;
      await navigator.clipboard.writeText(currentUrl);
      setLinkCopied(true);
      toast.success("Link copied to clipboard!", {
        description: "Share this link with anyone to view this conversation.",
        duration: 3000,
      });
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size="lg"
          className={cn(className, "cursor-pointer")}
          disabled={isExporting}
        >
          {isExporting ? (
            <>
              <Loader2 className="h-6 w-6 mr-2 animate-spin" />
              <span className="text-base font-medium">Exporting...</span>
            </>
          ) : (
            <>
              <Share2 className="h-6 w-6 mr-2" />
              <span className="text-base font-medium">Share</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Share Conversation</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={handleCopyShareableLink}>
          <Link className="h-4 w-4 mr-2" />
          <span>{linkCopied ? "Link Copied!" : "Copy Shareable Link"}</span>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={handleExportPDF}>
          <Download className="h-4 w-4 mr-2" />
          <span>{isExporting ? "Exporting..." : "Export as PDF"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

