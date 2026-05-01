const LEGACY_MINIO_PREFIX = "resume_file::";
const RESUME_MINIO_PREFIX = "resume_minio::";
const RESUME_LOCAL_PREFIX = "resume_local::";
const RESUME_DB_PREFIX = "resume_db::";

type ResumeProvider = "minio" | "local" | "db";

function decodeFileName(encodedName: string) {
  let fileName = "resume";
  try {
    fileName = decodeURIComponent(encodedName) || "resume";
  } catch {
    fileName = "resume";
  }
  return fileName;
}

export function createResumeMinioRef(fileName: string, objectKey: string) {
  return `${RESUME_MINIO_PREFIX}${encodeURIComponent(fileName)}::${objectKey}`;
}

export function createResumeLocalRef(fileName: string, publicPath: string) {
  return `${RESUME_LOCAL_PREFIX}${encodeURIComponent(fileName)}::${publicPath}`;
}

export function createResumeDbRef(fileName: string, fileId: string) {
  return `${RESUME_DB_PREFIX}${encodeURIComponent(fileName)}::${fileId}`;
}

function parseWithPrefix(value: string, prefix: string, provider: ResumeProvider) {
  if (!value.startsWith(prefix)) return null;

  const rest = value.slice(prefix.length);
  const separatorIndex = rest.indexOf("::");
  if (separatorIndex === -1) return null;

  const encodedName = rest.slice(0, separatorIndex);
  const objectKey = rest.slice(separatorIndex + 2);
  if (!objectKey) return null;

  return {
    provider,
    fileName: decodeFileName(encodedName),
    objectKey,
  };
}

export function parseResumeFileRef(value: string | null | undefined) {
  if (!value) return null;

  return (
    parseWithPrefix(value, RESUME_MINIO_PREFIX, "minio") ??
    parseWithPrefix(value, RESUME_LOCAL_PREFIX, "local") ??
    parseWithPrefix(value, RESUME_DB_PREFIX, "db") ??
    parseWithPrefix(value, LEGACY_MINIO_PREFIX, "minio")
  );
}

export function isHttpUrl(value: string | null | undefined) {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}
