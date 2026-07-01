import "server-only";
import OpenAI, { toFile } from "openai";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { parseRecordingRef } from "@/lib/recording";
import { getRecordingBuffer } from "@/lib/minio";
import { getLocalResumePath } from "@/lib/resumeFile";
import { ensureStoredFileTable } from "@/lib/storedFile";

// whisper-1 is $0.006/min and accepts webm/mp4 containers directly.
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "whisper-1";
const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024; // OpenAI transcription file-size limit

function getOpenAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (key.includes("...")) return null;
  if (key.toLowerCase().includes("your-")) return null;
  if (key.toLowerCase().includes("replace")) return null;
  return key;
}

async function loadRecording(
  videoUrl: string,
): Promise<{ buffer: Buffer; extension: "mp4" | "webm" } | null> {
  const ref = parseRecordingRef(videoUrl);
  if (!ref) return null;

  try {
    if (ref.provider === "local") {
      const localPath = getLocalResumePath(ref.objectKey);
      if (!localPath) return null;
      const buffer = await readFile(localPath);
      return { buffer, extension: ref.objectKey.endsWith(".mp4") ? "mp4" : "webm" };
    }

    if (ref.provider === "db") {
      await ensureStoredFileTable();
      const stored = await prisma.storedFile.findUnique({ where: { id: ref.objectKey } });
      if (!stored || stored.kind !== "recording") return null;
      return {
        buffer: Buffer.from(stored.data),
        extension: stored.contentType.includes("mp4") ? "mp4" : "webm",
      };
    }

    // minio
    const buffer = await getRecordingBuffer(ref.objectKey);
    return { buffer, extension: ref.objectKey.endsWith(".mp4") ? "mp4" : "webm" };
  } catch (err) {
    console.warn("[transcribe] could not load recording", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Transcribe a stored interview recording server-side. Used as a fallback when
 * the browser's live speech-to-text produced no transcript (it silently stops
 * on tab changes / network blips) even though the video + audio recorded fine.
 * Returns the transcript text, or null if unavailable/failed.
 */
export async function transcribeRecording(videoUrl: string | null | undefined): Promise<string | null> {
  if (!videoUrl) return null;

  const apiKey = getOpenAiApiKey();
  if (!apiKey) return null;

  const loaded = await loadRecording(videoUrl);
  if (!loaded || loaded.buffer.length === 0) return null;
  if (loaded.buffer.length > MAX_TRANSCRIBE_BYTES) {
    console.warn("[transcribe] recording too large to transcribe", loaded.buffer.length);
    return null;
  }

  const client = new OpenAI({ apiKey, timeout: 90_000 });
  try {
    const file = await toFile(loaded.buffer, `recording.${loaded.extension}`, {
      type: loaded.extension === "mp4" ? "video/mp4" : "video/webm",
    });
    const result = await client.audio.transcriptions.create({
      file,
      model: TRANSCRIBE_MODEL,
      response_format: "text",
    });
    const text = typeof result === "string" ? result : (result as { text?: string }).text ?? "";
    return text.trim() || null;
  } catch (err) {
    console.warn("[transcribe] transcription failed", err instanceof Error ? err.message : err);
    return null;
  }
}
