"use client";

import { useState, useRef, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { getApiUrl } from "@/lib/config";

interface VoiceButtonProps {
  workspaceId: string;
  disabled?: boolean;
}

type RecordingState = "idle" | "recording" | "processing";

/**
 * Voice input button that records audio, transcribes it via Parakeet,
 * and sends the result to the terminal.
 *
 * Usage: Press and hold to record, release to transcribe.
 */
export default function VoiceButton({ workspaceId, disabled = false }: VoiceButtonProps) {
  const { getToken } = useAuth();
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Send transcribed text to terminal via custom event
  const sendToTerminal = useCallback(
    (text: string) => {
      const event = new CustomEvent("terminal-input", {
        detail: { workspaceId, key: text },
      });
      window.dispatchEvent(event);
    },
    [workspaceId]
  );

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // Optimal for Parakeet
        },
      });

      streamRef.current = stream;

      // Create MediaRecorder with optimal settings
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());

        if (chunksRef.current.length === 0) {
          setState("idle");
          return;
        }

        setState("processing");

        try {
          // Create audio blob
          const audioBlob = new Blob(chunksRef.current, { type: mimeType });

          // Get auth token
          const authToken = await getToken();
          if (!authToken) {
            throw new Error("Not authenticated");
          }

          // Send to transcription API
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");

          const response = await fetch(`${getApiUrl()}/api/v1/voice/transcribe`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
            body: formData,
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `Transcription failed: ${response.status}`);
          }

          const result = await response.json();

          if (result.text && result.text.trim()) {
            // Send transcribed text to terminal
            sendToTerminal(result.text.trim());
          }
        } catch (err) {
          console.error("Transcription error:", err);
          setError(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setState("idle");
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      setState("recording");
    } catch (err) {
      console.error("Failed to start recording:", err);
      setError(err instanceof Error ? err.message : "Failed to access microphone");
      setState("idle");
    }
  }, [getToken, sendToTerminal]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, [state]);

  // Handle button interactions
  const handleMouseDown = () => {
    if (!disabled && state === "idle") {
      startRecording();
    }
  };

  const handleMouseUp = () => {
    if (state === "recording") {
      stopRecording();
    }
  };

  const handleMouseLeave = () => {
    if (state === "recording") {
      stopRecording();
    }
  };

  // Touch events for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling
    if (!disabled && state === "idle") {
      startRecording();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (state === "recording") {
      stopRecording();
    }
  };

  return (
    <>
      <button
        className={`voice-btn ${state}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        disabled={disabled || state === "processing"}
        aria-label={
          state === "recording"
            ? "Recording... Release to stop"
            : state === "processing"
              ? "Transcribing..."
              : "Hold to speak"
        }
        title={error || undefined}
      >
        {state === "idle" && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        )}
        {state === "recording" && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="pulse">
            <circle cx="12" cy="12" r="8" />
          </svg>
        )}
        {state === "processing" && (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="spin"
          >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        )}
      </button>

      <style jsx>{`
        .voice-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          padding: 0;
          border: 1px solid var(--border);
          background: var(--background);
          color: var(--foreground);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .voice-btn:hover:not(:disabled) {
          background: var(--surface);
        }

        .voice-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .voice-btn.recording {
          background: var(--error, #ef4444);
          border-color: var(--error, #ef4444);
          color: white;
        }

        .voice-btn.processing {
          background: var(--surface);
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .voice-btn.recording :global(.pulse) {
          animation: pulse 0.8s ease-in-out infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        :global(.spin) {
          animation: spin 1s linear infinite;
        }

        /* Hide on desktop, show on mobile (like accessory bar) */
        @media (min-width: 769px) {
          .voice-btn {
            /* Show on all devices for now - can hide later if needed */
          }
        }
      `}</style>
    </>
  );
}
