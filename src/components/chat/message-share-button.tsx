"use client"

import { useState } from "react"
import { Share2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { 
  exportAsPDF,
  type ExportMessage
} from "@/lib/export-utils"

interface MessageShareButtonProps {
  questionMessage: any
  answerMessage: any
  messageIndex: number
}

export function MessageShareButton({ questionMessage, answerMessage, messageIndex }: MessageShareButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  // Prepare messages for export (Q&A pair)
  const getMessagePair = (): ExportMessage[] => {
    return [
      {
        id: questionMessage.id,
        role: 'user' as const,
        content: questionMessage.content,
      },
      {
        id: answerMessage.id,
        role: 'assistant' as const,
        content: answerMessage.content,
        chartData: answerMessage.chartData,
        chartConfig: answerMessage.chartConfig,
        charts: answerMessage.charts,
        tableData: answerMessage.tableData,
        datasets: answerMessage.datasets,
      }
    ]
  }

  const handleExportPDF = async () => {
    setIsExporting(true)
    toast.info("Preparing PDF export...", {
      description: "Exporting this Q&A",
      duration: 2000,
    })
    try {
      const messages = getMessagePair()
      await exportAsPDF(messages, `Q${messageIndex + 1}`, (progress) => {
        console.log('📄 PDF Progress:', progress)
        toast.loading(progress, { id: 'pdf-export' })
      })
      toast.dismiss('pdf-export')
      toast.success("PDF exported successfully!")
    } catch (error) {
      toast.dismiss('pdf-export')
      console.error('PDF export error:', error)
      toast.error("Failed to export PDF")
    } finally {
      setIsExporting(false)
    }
  }


  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="lg"
          className="gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          disabled={isExporting}
        >
          <Share2 className="h-5 w-5" />
          <span className="text-sm font-medium">Share Q{messageIndex + 1}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={handleExportPDF} className="gap-2 cursor-pointer">
          <Download className="h-4 w-4" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

