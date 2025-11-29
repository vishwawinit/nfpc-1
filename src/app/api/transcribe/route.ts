import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    // Check if API key is set
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        {
          error: "GROQ_API_KEY is not set in environment variables",
          status: "error",
        },
        { status: 500 }
      );
    }

    // Get the audio file from the request
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json(
        {
          error: "No audio file provided",
          status: "error",
        },
        { status: 400 }
      );
    }

    // Convert File to a format Groq can use
    const audioBuffer = await audioFile.arrayBuffer();
    
    // Create a File object for Groq (Groq API expects a File object)
    const groqAudioFile = new File([audioBuffer], audioFile.name || "recording.webm", {
      type: audioFile.type || "audio/webm",
    });

    console.log("🎤 Transcribing audio with Groq Whisper...");

    // Call Groq Whisper API for transcription (OpenAI-compatible format)
    const transcription = await groq.audio.transcriptions.create({
      file: groqAudioFile,
      model: "whisper-large-v3-turbo", // Using turbo for faster transcription
      language: "en", // Optional: specify language
      response_format: "text",
    });

    // Groq returns the transcription text directly when response_format is "text"
    const transcribedText = typeof transcription === "string" 
      ? transcription 
      : (transcription as any).text || "";

    console.log("✅ Transcription successful:", transcribedText);

    return NextResponse.json({
      text: transcribedText,
      status: "success",
    });
  } catch (error: any) {
    console.error("❌ Transcription error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to transcribe audio",
        status: "error",
      },
      { status: 500 }
    );
  }
}

