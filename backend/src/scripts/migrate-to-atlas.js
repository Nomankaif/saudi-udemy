import "../config/env.js";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { importDirectory, mediaDirectory } from "../config/storage.js";
import { migrateLocalFile } from "../services/blob-store.js";

const databaseName = "exam-platform";
const sourceUri = process.env.SOURCE_MONGODB_URI || process.env.MONGODB_URI;
const targetUri = process.env.ATLAS_MIGRATION_URI;
if (!sourceUri || !targetUri || sourceUri === targetUri) {
  throw new Error("Set distinct MONGODB_URI and ATLAS_MIGRATION_URI values before migrating");
}

function contentType(filename) {
  return {
    ".pdf": "application/pdf",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  }[path.extname(filename).toLowerCase()] || "application/octet-stream";
}

async function localFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name !== ".gitkeep").map(entry => ({
    name: entry.name,
    path: path.join(directory, entry.name),
  }));
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyFiles(db, kind, files) {
  const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: kind });
  for (const file of files) {
    const records = await db.collection(`${kind}.files`).find({ filename: file.name }).toArray();
    if (records.length !== 1) throw new Error(`${kind}/${file.name}: expected one uploaded file`);
    const hash = createHash("sha256");
    for await (const chunk of bucket.openDownloadStream(records[0]._id)) hash.update(chunk);
    if (hash.digest("hex") !== await hashFile(file.path)) throw new Error(`${kind}/${file.name}: checksum mismatch`);
  }
}

let source;
try {
  source = await mongoose.createConnection(sourceUri, { dbName: databaseName }).asPromise();
  await mongoose.connect(targetUri, { dbName: databaseName });
  const target = mongoose.connection;
  const sourceCollections = (await source.db.listCollections().toArray()).filter(item => item.type === "collection" && !item.name.startsWith("system."));
  const existing = await target.db.listCollections().toArray();
  if (existing.length) throw new Error("Atlas target is not empty; migration stopped without changing it");

  const mediaFiles = await localFiles(mediaDirectory);
  const importFiles = await localFiles(importDirectory);
  const importNames = new Set(importFiles.map(file => file.name));
  for (const name of ["labimports", "dragdropimports"]) {
    const jobs = await source.db.collection(name).find({}, { projection: { sourcePath: 1 } }).toArray();
    for (const job of jobs) {
      if (!job.sourcePath || !importNames.has(path.basename(job.sourcePath))) {
        throw new Error(`A saved ${name} source file is missing for ${job._id}`);
      }
    }
  }
  for (const file of [...mediaFiles, ...importFiles]) await stat(file.path);
  console.log(`Copying ${sourceCollections.length} collections, ${mediaFiles.length} images, and ${importFiles.length} import files`);

  for (const sourceCollection of sourceCollections) {
    const name = sourceCollection.name;
    await target.db.createCollection(name);
    const cursor = source.db.collection(name).find({});
    let batch = [];
    for await (const document of cursor) {
      const copy = name === "labimports" || name === "dragdropimports"
        ? { ...document, sourcePath: `gridfs://imports/${path.basename(document.sourcePath)}` }
        : document;
      batch.push(copy);
      if (batch.length === 250) {
        await target.db.collection(name).insertMany(batch, { ordered: true });
        batch = [];
      }
    }
    if (batch.length) await target.db.collection(name).insertMany(batch, { ordered: true });

    const indexes = await source.db.collection(name).listIndexes().toArray();
    for (const index of indexes.filter(item => item.name !== "_id_")) {
      const options = { name: index.name };
      for (const key of ["unique", "sparse", "expireAfterSeconds", "partialFilterExpression", "collation", "weights", "default_language", "language_override", "textIndexVersion", "2dsphereIndexVersion", "hidden"]) {
        if (index[key] !== undefined) options[key] = index[key];
      }
      await target.db.collection(name).createIndex(index.key, options);
    }
    const sourceCount = await source.db.collection(name).countDocuments();
    const targetCount = await target.db.collection(name).countDocuments();
    if (sourceCount !== targetCount) throw new Error(`${name}: record count mismatch`);
    console.log(`${name}: ${targetCount} records`);
  }

  for (const file of mediaFiles) await migrateLocalFile("media", file.name, file.path, contentType(file.name));
  for (const file of importFiles) await migrateLocalFile("imports", file.name, file.path, contentType(file.name));
  await verifyFiles(target.db, "media", mediaFiles);
  await verifyFiles(target.db, "imports", importFiles);
  console.log(`Verified ${mediaFiles.length} image checksums and ${importFiles.length} import file checksums`);
  console.log("Atlas migration complete; local data has not been changed");
} finally {
  await source?.close();
  await mongoose.disconnect();
}
