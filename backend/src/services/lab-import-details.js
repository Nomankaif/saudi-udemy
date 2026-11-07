import { ApiError } from "../utils/api-error.js";

export function validateImportDetails(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "Enter the lab details before uploading");
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const instructions = typeof value.instructions === "string" ? value.instructions.trim() : "";
  const imageUrl = typeof value.imageUrl === "string" ? value.imageUrl.trim() : "";
  const access = value.access || "FREE";
  const durationMinutes = Number(value.durationMinutes);
  const examId = typeof value.examId === "string" ? value.examId.trim() : "";
  if (!title || title.length > 150) throw new ApiError(400, "Lab title must be 1–150 characters");
  if (instructions.length > 20000) throw new ApiError(400, "Instructions must be 20,000 characters or fewer");
  if (imageUrl && !/^\/uploads\/media\/[A-Za-z0-9._-]+$/.test(imageUrl)) throw new ApiError(400, "Select an uploaded lab cover image");
  if (!["FREE", "PREMIUM"].includes(access)) throw new ApiError(400, "Select a lab access level");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) throw new ApiError(400, "Duration must be 1–1440 minutes");
  if (access === "PREMIUM" && !examId) throw new ApiError(400, "Link a published exam for premium labs");
  return { title, instructions, imageUrl, access, durationMinutes, examId };
}

export function applyImportDetails(rows, details) {
  if (!details) return rows;
  const many = rows.length > 1;
  return rows.map(row => {
    const sourceTitle = String(row.definition.title || `Lab ${row.sourceNumber}`).trim();
    const title = many ? `${details.title.slice(0, 80)}: ${row.sourceNumber} · ${sourceTitle}`.slice(0, 150) : details.title;
    const originalInstructions = String(row.definition.instructions || "").trim();
    // A file with several labs already contains per-lab tasks. Shared details
    // must not turn every source exercise into the same unrelated scenario.
    const instructions = many && originalInstructions ? originalInstructions : details.instructions || originalInstructions;
    const definition = { ...row.definition, title, instructions, imageUrl: details.imageUrl || row.definition.imageUrl || "", access: details.access, durationMinutes: details.durationMinutes, examId: details.examId || null };
    return { ...row, title, definition, reviewed: false, verification: undefined };
  });
}

export function removeLegacySharedInstructions(row, details, totalRows) {
  if (totalRows < 2 || !details?.instructions) return row;
  const prefix = `${details.instructions}\n\n`;
  const current = row.definition?.instructions;
  if (typeof current !== "string" || !current.startsWith(prefix) || !current.slice(prefix.length).trim()) return row;
  return { ...row, definition: { ...row.definition, instructions: current.slice(prefix.length) } };
}
