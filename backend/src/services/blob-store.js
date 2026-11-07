import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import mongoose from "mongoose";
import { ApiError } from "../utils/api-error.js";
import { cloudStorage, importDirectory, mediaDirectory } from "../config/storage.js";

const sourcePrefix = "gridfs://imports/";
const safeName = value => typeof value === "string" && /^[A-Za-z0-9_.-]+$/.test(value) && !value.includes("..");
const bucket = name => {
  if (!mongoose.connection.db) throw new ApiError(503, "Storage database is unavailable");
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: name });
};

async function writeBlob(kind, filename, buffer, contentType) {
  if (!safeName(filename)) throw new ApiError(400, "Invalid file name");
  const stream = bucket(kind).openUploadStream(filename, { metadata: { contentType, size: buffer.length } });
  await pipeline(Readable.from(buffer), stream);
}

async function readBlob(kind, filename) {
  if (!safeName(filename)) throw new ApiError(400, "Invalid file name");
  const files = await bucket(kind).find({ filename }).sort({ uploadDate: -1 }).limit(1).toArray();
  if (!files.length) throw new ApiError(404, "File not found");
  const chunks = [];
  for await (const chunk of bucket(kind).openDownloadStream(files[0]._id)) chunks.push(chunk);
  return { buffer: Buffer.concat(chunks), contentType: files[0].metadata?.contentType || "application/octet-stream" };
}

export async function writeMedia(filename, buffer, contentType) {
  if (cloudStorage) return writeBlob("media", filename, buffer, contentType);
  await writeFile(path.join(mediaDirectory, filename), buffer, { flag: "wx" });
}

export async function readMedia(filename) {
  if (cloudStorage) return readBlob("media", filename);
  if (!safeName(filename)) throw new ApiError(400, "Invalid file name");
  const buffer = await readFile(path.join(mediaDirectory, filename)).catch(() => { throw new ApiError(404, "File not found"); });
  const extension = path.extname(filename).toLowerCase();
  return { buffer, contentType: { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" }[extension] || "application/octet-stream" };
}

export async function writeImportSource(buffer, extension) {
  const filename = `${randomUUID()}.${extension}`;
  if (cloudStorage) { await writeBlob("imports", filename, buffer, extension === "pdf" ? "application/pdf" : "application/json"); return sourcePrefix + filename; }
  const sourcePath = path.join(importDirectory, filename);
  await writeFile(sourcePath, buffer, { flag: "wx" });
  return sourcePath;
}

export async function readImportSource(sourcePath) {
  if (sourcePath.startsWith(sourcePrefix)) return (await readBlob("imports", sourcePath.slice(sourcePrefix.length))).buffer;
  return readFile(sourcePath);
}

export async function migrateLocalFile(kind, filename, filePath, contentType) {
  if (!safeName(filename)) throw new ApiError(400, "Invalid file name");
  const stream = bucket(kind).openUploadStream(filename, { metadata: { contentType } });
  await pipeline(createReadStream(filePath), stream);
}
