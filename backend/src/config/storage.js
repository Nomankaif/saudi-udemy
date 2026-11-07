import fs from "node:fs";
import path from "node:path";

export const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_PATH || "../storage");
export const importDirectory = path.join(storageRoot, "imports");
export const mediaDirectory = path.join(storageRoot, "media");
export const cloudStorage = process.env.STORAGE_BACKEND === "mongo";

if (!cloudStorage) {
  for (const directory of [storageRoot, importDirectory, mediaDirectory]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

export function safeFileName(originalName) {
  const extension = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, extension).replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 70);
  return `${Date.now()}-${baseName}${extension}`;
}
