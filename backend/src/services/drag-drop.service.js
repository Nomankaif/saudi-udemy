import { ApiError } from "../utils/api-error.js";

const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
export function dragDropErrors(q) {
  const errors = [];
  const items = q.options || [], targets = q.dropTargets || [], placements = q.correctPlacements || [];
  if (items.length < 2 || items.length > 20) errors.push("Use 2–20 draggable items");
  items.forEach((item, index) => {
    if (!item.text?.trim()) errors.push(`Item ${index + 1}: enter the item text.`);
    if (item.text?.length > 1000) errors.push(`Item ${index + 1}: shorten the text to 1,000 characters or fewer.`);
    if (!validId(item.id) || items.findIndex(i => i.id === item.id) !== index)
      errors.push(`Item ${index + 1}: its identifier is invalid or duplicated. Remove this item and add it again.`);
  });
  if (!targets.length || targets.length > 10) errors.push("Use 1–10 destination groups");
  targets.forEach((target, index) => {
    const name = target.label?.trim() ? `Group “${target.label.slice(0, 80)}”` : `Group ${index + 1}`;
    if (!target.label?.trim()) errors.push(`${name}: enter a group name.`);
    if (target.label?.length > 200) errors.push(`${name}: shorten the name to 200 characters or fewer.`);
    if (!validId(target.id) || targets.findIndex(t => t.id === target.id) !== index)
      errors.push(`${name}: its identifier is invalid or duplicated. Remove this group and add it again.`);
    if (!Number.isInteger(target.capacity) || target.capacity < 1 || target.capacity > 20) {
      errors.push(`${name}: set Slots to a whole number between 1 and 20.`);
      return;
    }
    const assigned = new Set(placements.filter(p => p.targetId === target.id && items.some(i => i.id === p.itemId)).map(p => p.itemId)).size;
    if (assigned !== target.capacity) {
      const difference = Math.abs(target.capacity - assigned);
      const action = assigned < target.capacity ? `Assign ${difference} more item${difference === 1 ? "" : "s"} using Correct destination` : `Remove ${difference} item assignment${difference === 1 ? "" : "s"}`;
      errors.push(`${name} has ${target.capacity} slot${target.capacity === 1 ? "" : "s"} but ${assigned} item${assigned === 1 ? "" : "s"} assigned. ${action}${assigned > 0 && assigned <= 20 ? ` or change Slots to ${assigned}` : ""}.`);
    }
  });
  placements.forEach((placement, index) => {
    const item = items.find(i => i.id === placement.itemId);
    const name = item ? `Item “${item.text.slice(0, 80)}”` : `Answer placement ${index + 1}`;
    if (!item) errors.push(`${name}: the item no longer exists. Remove this answer placement.`);
    if (!targets.some(t => t.id === placement.targetId)) errors.push(`${name}: select an existing group under Correct destination.`);
    if (placements.findIndex(p => p.itemId === placement.itemId) !== index) errors.push(`${name}: assigned more than once. Keep only one correct destination.`);
  });
  if (q.correctOptionIds?.length) errors.push("Drag-and-drop questions use placements, not a choice answer key");
  return errors;
}

// Partial answers are valid saves. IDs and capacities come from the immutable
// attempt snapshot, never from client-supplied question metadata.
export function validatePlacements(question, input) {
  if (!Array.isArray(input) || input.length > question.options.length) throw new ApiError(400, "Invalid drag-and-drop answer");
  const seen = new Set(), counts = new Map();
  return input.map(p => {
    if (!p || typeof p !== "object" || !question.options.some(i => i.id === p.itemId) || seen.has(p.itemId)) throw new ApiError(400, "Each item can be placed only once");
    const target = question.dropTargets.find(t => t.id === p.targetId);
    if (!target) throw new ApiError(400, "Choose a valid destination");
    seen.add(p.itemId);
    const count = (counts.get(p.targetId) || 0) + 1;
    if (count > target.capacity) throw new ApiError(400, "This destination has no remaining slots");
    counts.set(p.targetId, count);
    return { itemId: p.itemId, targetId: p.targetId };
  });
}

export const placementKeys = placements => (placements || []).map(p => `${p.itemId}:${p.targetId}`).sort();
