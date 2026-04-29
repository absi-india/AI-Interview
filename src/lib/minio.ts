import { Client } from "minio";

let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    const port = parseInt(process.env.MINIO_PORT ?? "9000", 10);
    const useSSL =
      (process.env.MINIO_USE_SSL ?? "").toLowerCase() === "true" || port === 443;

    _client = new Client({
      endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
      port,
      useSSL,
      accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
    });
  }
  return _client;
}

const BUCKET_RECORDINGS = process.env.MINIO_BUCKET_RECORDINGS ?? "recordings";
const BUCKET_RESUMES = process.env.MINIO_BUCKET_RESUMES ?? "resumes";

async function ensureBucket(bucket: string) {
  const client = getClient();
  const exists = await client.bucketExists(bucket);
  if (!exists) await client.makeBucket(bucket);
}

export async function uploadFile(
  bucket: string,
  objectName: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  await ensureBucket(bucket);
  await getClient().putObject(bucket, objectName, buffer, buffer.length, {
    "Content-Type": contentType,
  });
}

export async function getPresignedUrl(
  bucket: string,
  objectName: string,
  expirySeconds = 3600
): Promise<string> {
  return getClient().presignedGetObject(bucket, objectName, expirySeconds);
}

export async function uploadRecording(
  testId: string,
  questionId: string,
  buffer: Buffer
): Promise<string> {
  const key = `${testId}/${questionId}.webm`;
  await uploadFile(BUCKET_RECORDINGS, key, buffer, "video/webm");
  return key;
}

export async function uploadResume(
  candidateId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const key = `${candidateId}/${filename}`;
  await uploadFile(BUCKET_RESUMES, key, buffer, contentType);
  return key;
}

export async function getRecordingUrl(testId: string, questionId: string): Promise<string> {
  return getPresignedUrl(BUCKET_RECORDINGS, `${testId}/${questionId}.webm`);
}

export { BUCKET_RECORDINGS, BUCKET_RESUMES };
