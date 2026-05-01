import { prisma } from "@/lib/prisma";

let ensured = false;

export async function ensureStoredFileTable() {
  if (ensured) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StoredFile" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "kind" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "contentType" TEXT NOT NULL,
      "data" BLOB NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  ensured = true;
}
