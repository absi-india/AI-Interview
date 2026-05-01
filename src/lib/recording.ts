const RECORDING_MINIO_PREFIX = "recording_minio::";
const RECORDING_LOCAL_PREFIX = "recording_local::";
const RECORDING_DB_PREFIX = "recording_db::";

type RecordingProvider = "minio" | "local" | "db";

export function createRecordingMinioRef(objectKey: string) {
  return `${RECORDING_MINIO_PREFIX}${objectKey}`;
}

export function createRecordingLocalRef(publicPath: string) {
  return `${RECORDING_LOCAL_PREFIX}${publicPath}`;
}

export function createRecordingDbRef(fileId: string) {
  return `${RECORDING_DB_PREFIX}${fileId}`;
}

export function parseRecordingRef(value: string | null | undefined) {
  if (!value) return null;

  if (value.startsWith(RECORDING_MINIO_PREFIX)) {
    const objectKey = value.slice(RECORDING_MINIO_PREFIX.length);
    return objectKey ? { provider: "minio" as RecordingProvider, objectKey } : null;
  }

  if (value.startsWith(RECORDING_LOCAL_PREFIX)) {
    const objectKey = value.slice(RECORDING_LOCAL_PREFIX.length);
    return objectKey ? { provider: "local" as RecordingProvider, objectKey } : null;
  }

  if (value.startsWith(RECORDING_DB_PREFIX)) {
    const objectKey = value.slice(RECORDING_DB_PREFIX.length);
    return objectKey ? { provider: "db" as RecordingProvider, objectKey } : null;
  }

  return { provider: "minio" as RecordingProvider, objectKey: value };
}

export function getRecordingPlaybackPath(questionId: string, value: string | null | undefined) {
  const ref = parseRecordingRef(value);
  if (!ref) return null;
  if (ref.provider === "local") return ref.objectKey;
  return `/api/questions/${questionId}/video`;
}
