/**
 * Voice API Routes
 *
 * Handles voice-to-text transcription via Modal + Parakeet.
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";

type Variables = {
  userId: string;
};

export const voiceRoute = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all routes
voiceRoute.use("*", authMiddleware);

// Modal endpoint URL (set via environment variable)
const MODAL_VOICE_ENDPOINT = process.env["MODAL_VOICE_ENDPOINT"];

// Max audio size: 10MB
const MAX_AUDIO_SIZE = 10 * 1024 * 1024;

// Allowed audio MIME types
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/ogg",
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
]);

/**
 * POST /voice/transcribe
 *
 * Transcribe audio to text using Parakeet.
 *
 * Request: multipart/form-data with "audio" file
 * Response: { text: string, language: string }
 */
voiceRoute.post("/transcribe", async (c) => {
  // Check if Modal endpoint is configured
  if (!MODAL_VOICE_ENDPOINT) {
    return c.json(
      { error: "Voice transcription not configured", code: "voice_not_configured" },
      503
    );
  }

  try {
    const formData = await c.req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof File)) {
      return c.json({ error: "No audio file provided", code: "missing_audio" }, 400);
    }

    // Validate file size
    if (audioFile.size > MAX_AUDIO_SIZE) {
      return c.json({ error: "Audio file too large (max 10MB)", code: "file_too_large" }, 400);
    }

    // Validate MIME type (allow unknown types as browsers vary)
    const mimeType = audioFile.type.toLowerCase();
    if (mimeType && !ALLOWED_AUDIO_TYPES.has(mimeType) && !mimeType.startsWith("audio/")) {
      return c.json({ error: "Invalid audio format", code: "invalid_format" }, 400);
    }

    // Get audio bytes
    const audioBuffer = await audioFile.arrayBuffer();

    // Call Modal endpoint
    const startTime = Date.now();
    const response = await fetch(MODAL_VOICE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: audioBuffer,
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`Modal transcription failed: ${response.status} - ${errorText}`);
      return c.json({ error: "Transcription service error", code: "transcription_failed" }, 502);
    }

    const result = (await response.json()) as { text: string; language: string };

    // Return transcription with metadata
    return c.json({
      text: result.text,
      language: result.language,
      latencyMs,
    });
  } catch (error) {
    console.error("Voice transcription error:", error);

    // Check for timeout
    if (error instanceof Error && error.name === "AbortError") {
      return c.json({ error: "Transcription timed out", code: "timeout" }, 504);
    }

    return c.json({ error: "Internal server error", code: "internal_error" }, 500);
  }
});

/**
 * GET /voice/status
 *
 * Check if voice transcription is configured and available.
 */
voiceRoute.get("/status", async (c) => {
  const configured = !!MODAL_VOICE_ENDPOINT;

  return c.json({
    configured,
    provider: configured ? "modal" : null,
    model: configured ? "parakeet-tdt-0.6b-v2" : null,
  });
});
