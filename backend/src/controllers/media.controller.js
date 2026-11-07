import { ApiError } from "../utils/api-error.js";
import { randomUUID } from "node:crypto";
import { writeMedia } from "../services/blob-store.js";

export async function uploadCover(request, response) {
  const buffer = request.file?.buffer;
  if (!buffer) throw new ApiError(400, "Select a JPG, PNG, or WebP image");
  const extension = buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png" : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 ? "jpg" : buffer.toString("ascii",0,4) === "RIFF" && buffer.toString("ascii",8,12) === "WEBP" ? "webp" : null;
  if (!extension) throw new ApiError(400, "Invalid image. Upload a JPG, PNG, or WebP file");
  const filename = `cover-${randomUUID()}.${extension}`;
  await writeMedia(filename, buffer, `image/${extension === "jpg" ? "jpeg" : extension}`);
  response.status(201).json({ url: `/uploads/media/${filename}` });
}

export async function uploadImage(request, response) {
  if (!request.file)
    throw new ApiError(400, "A JPG, PNG, WebP, or GIF image is required");
  if (request.file.buffer) await writeMedia(request.file.filename, request.file.buffer, request.file.mimetype);
  response
    .status(201)
    .json({
      url: `/uploads/media/${request.file.filename}`,
      filename: request.file.filename,
      size: request.file.size,
    });
}
