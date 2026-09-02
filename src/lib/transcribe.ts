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
export type TranscribeOutcome = { text: string | null; error?: string };

/**
 * Transcribe a stored recording, reporting why it could not be done.
 *
 * The plain wrapper below returns null for every kind of failure, which made a
 * failed recovery indistinguishable from a recording that genuinely had nothing
 * in it — the score stayed where it was with nothing to explain it.
 */
export async function transcribeRecordingDetailed(
  videoUrl: string | null | undefined,
): Promise<TranscribeOutcome> {
  if (!videoUrl) return { text: null, error: "no recording saved for this answer" };

  const apiKey = getOpenAiApiKey();
  if (!apiKey) return { text: null, error: "transcription is not configured" };

  const loaded = await loadRecording(videoUrl);
  if (!loaded) return { text: null, error: "recording could not be read from storage" };
  if (loaded.buffer.length === 0) return { text: null, error: "recording file is empty" };
  if (loaded.buffer.length > MAX_TRANSCRIBE_BYTES) {
    const mb = Math.round((loaded.buffer.length / (1024 * 1024)) * 10) / 10;
    return { text: null, error: `recording is ${mb} MB, over the ${MAX_TRANSCRIBE_BYTES / (1024 * 1024)} MB limit` };
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
    const clean = text.trim();
    if (!clean) return { text: null, error: "no speech found in the recording" };
    return { text: clean };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[transcribe] transcription failed", message);
    return { text: null, error: `transcription failed: ${message}` };
  }
}

/** Backwards-compatible form used where the reason is not needed. */
export async function transcribeRecording(videoUrl: string | null | undefined): Promise<string | null> {
  const { text } = await transcribeRecordingDetailed(videoUrl);
  return text;
}
