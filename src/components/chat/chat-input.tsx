"use client";

import { Send, StopCircle, Mic, Square, Loader2 } from "lucide-react";
import { useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { toast } from "sonner";

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (text?: string) => void;
  isLoading: boolean;
  onStop: () => void;
}

export function ChatInput({
  input,
  setInput,
  onSubmit,
  isLoading,
  onStop,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Memoize the input change handler to prevent infinite loops
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (newValue !== input) {
      setInput(newValue);
    }
  }, [input, setInput]);
  const {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useSpeechToText();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input?.trim() && !isLoading) {
        onSubmit();
      }
    }
  };

  const handleMicrophoneClick = async () => {
    if (isRecording) {
      // Stop recording and transcribe
      try {
        const transcribedText = await stopRecording();
        toast.success("Audio transcribed! Sending message...");
        // Automatically send the transcribed message
        onSubmit(transcribedText);
      } catch (error: any) {
        toast.error(error.message || "Failed to transcribe audio");
        cancelRecording();
      }
    } else {
      // Start recording
      try {
        await startRecording();
        toast.info("Recording... Click again to stop");
      } catch (error) {
        toast.error("Failed to access microphone");
      }
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-end gap-3 py-2">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={input || ""}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            disabled={isLoading}
            className={cn(
              "min-h-[48px] max-h-[160px] resize-none pr-12 text-lg font-medium",
              "focus-visible:ring-2 focus-visible:ring-blue-500"
            )}
            rows={1}
          />
        </div>

        {/* Microphone Button */}
        <Button
          onClick={handleMicrophoneClick}
          disabled={isLoading || isTranscribing}
          size="icon"
          variant={isRecording ? "destructive" : "outline"}
          className={cn(
            "h-12 w-12 cursor-pointer flex-shrink-0",
            isRecording && "animate-pulse bg-red-500 hover:bg-red-600"
          )}
          title={isRecording ? "Stop recording" : "Start voice input"}
        >
          {isTranscribing ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : isRecording ? (
            <Square className="h-6 w-6 fill-current" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </Button>

        {/* Send/Stop Button */}
        {isLoading ? (
          <Button
            onClick={onStop}
            size="icon"
            variant="destructive"
            className="h-12 w-12 cursor-pointer flex-shrink-0"
          >
            <StopCircle className="h-6 w-6" />
          </Button>
        ) : (
          <Button
            onClick={() => onSubmit()}
            disabled={!input?.trim() || isLoading || isRecording || isTranscribing}
            size="icon"
            className="h-12 w-12 bg-blue-500 hover:bg-blue-600 cursor-pointer flex-shrink-0"
          >
            <Send className="h-6 w-6" />
          </Button>
        )}
      </div>
    </div>
  );
}

