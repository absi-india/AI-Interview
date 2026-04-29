import "server-only";

import path from "node:path";

export function getLocalResumePath(publicPath: string) {
  const publicRoot = path.resolve(process.cwd(), "public");
  const relativePath = publicPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(publicRoot, relativePath);

  if (!resolvedPath.startsWith(publicRoot + path.sep)) {
    return null;
  }

  return resolvedPath;
}
