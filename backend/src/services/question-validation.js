import { normalizePbq, pbqErrors, pbqFields } from "./pbq.service.js";
import { dragDropErrors } from "./drag-drop.service.js";
import { ApiError } from "../utils/api-error.js";

export function normalizeQuestion(input = {}) {
  const string = (value) => (typeof value === "string" ? value.trim() : "");
  const pbq = input.type === "IMAGE_PBQ";
  const pbqData = pbq ? normalizePbq(input.pbq, input.pbqKey || []) : { pbq: null, pbqKey: [] };
  const drag = input.type === "DRAG_DROP";
  if (drag && (!Array.isArray(input.options) || input.options.length > 20 || !Array.isArray(input.dropTargets) || input.dropTargets.length > 10 || !Array.isArray(input.correctPlacements) || input.correctPlacements.length > 20))
    throw new ApiError(400, "Use up to 20 items, 10 groups and 20 answer placements");
  return {
    type: pbq ? "IMAGE_PBQ" : drag ? "DRAG_DROP" : input.type === "MULTIPLE_CHOICE" ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE",
    ...pbqData,
    text: string(input.text),
    options: pbq ? [] : drag ? input.options.map(i => ({ id: string(i?.id), text: string(i?.text) })) : ["A", "B", "C", "D"].map((id, i) => ({
      id,
      text: string(input.options?.[i]?.text),
    })),
    correctOptionIds: !pbq && !drag && Array.isArray(input.correctOptionIds)
      ? input.correctOptionIds.map(string)
      : [],
    dropTargets: drag ? input.dropTargets.map(t => ({ id: string(t?.id), label: string(t?.label), capacity: Number(t?.capacity ?? 1) })) : [],
    correctPlacements: drag ? input.correctPlacements.map(p => ({ itemId: string(p?.itemId), targetId: string(p?.targetId) })) : [],
    explanation: string(input.explanation),
    accessLevel: string(input.accessLevel) || "PREMIUM",
    topic: string(input.topic) || "General",
    difficulty: string(input.difficulty) || "MEDIUM",
    imageUrl: string(input.imageUrl),
    marks: pbq ? pbqFields(pbqData.pbq).reduce((sum, { field: a }) => sum + (Number.isInteger(a.points) && a.points >= 1 && a.points <= 100 ? a.points : 1), 0) || 1 : 1,
    negativeMarks: 0,
    displayOrder: Math.max(0, Number(input.displayOrder) || 0),
    isActive: true,
  };
}
export function questionErrors(question) {
  const errors = [];
  if (!question.text?.trim()) errors.push("Question text is required");
  if (question.text?.length > 20000)
    errors.push("Question exceeds 20,000 characters");
  if (question.type === "IMAGE_PBQ") errors.push(...pbqErrors(question));
  else if (question.type === "DRAG_DROP") errors.push(...dragDropErrors(question));
  else {
  if (
    question.options?.length !== 4 ||
    question.options.some((option) => !option.text?.trim())
  )
    errors.push("Four non-empty options are required");
  const keys = question.correctOptionIds;
  const multiple = question.type === "MULTIPLE_CHOICE";
  if (
    !Array.isArray(keys) ||
    (multiple ? keys.length < 2 || keys.length > 4 : keys.length !== 1) ||
    new Set(keys).size !== keys.length ||
    keys.some(id => !["A", "B", "C", "D"].includes(id))
  )
    errors.push(multiple ? "Select two to four different correct answers (A–D)" : "Select exactly one correct answer (A–D)");
  }
  if (!question.explanation?.trim())
    errors.push("Answer explanation is required");
  if (!["FREE", "PREMIUM"].includes(question.accessLevel))
    errors.push("Access must be FREE or PREMIUM");
  if (!["EASY", "MEDIUM", "HARD"].includes(question.difficulty))
    errors.push("Invalid difficulty");
  if (
    question.imageUrl &&
    !/^https?:\/\//i.test(question.imageUrl) &&
    !question.imageUrl.startsWith("/uploads/media/")
  )
    errors.push("Use an HTTP image URL or uploaded image");
  return errors;
}
export const duplicateKey = (text) =>
  text.trim().toLowerCase().replace(/\s+/g, " ");
