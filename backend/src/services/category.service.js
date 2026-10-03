import Category from "../models/category.model.js";
import Exam from "../models/exam.model.js";
import Lab from "../models/lab.model.js";
import { ApiError } from "../utils/api-error.js";

export const categoryName = value => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

export async function categoryCatalog() {
  const [saved, exams, labs] = await Promise.all([
    Category.find().lean(),
    Exam.distinct("category", { status: { $ne: "ARCHIVED" } }),
    Lab.distinct("category", { status: { $ne: "ARCHIVED" } }),
  ]);
  const categories = new Map(saved.map(item => [item.key, {
    name: item.name,
    subcategories: (item.subcategories || []).map(s => ({ name: s.name })).sort((a, b) => a.name.localeCompare(b.name)),
  }]));
  for (const value of [...exams, ...labs]) {
    const name = categoryName(value), key = name.toLowerCase();
    if (name && !categories.has(key)) categories.set(key, { name, subcategories: [] });
  }
  return [...categories.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function validateClassification(category, subcategory = "", { allowUnassigned = false } = {}) {
  if (typeof category !== "string" || !categoryName(category) || categoryName(category).length > 100)
    throw new ApiError(400, "Select a category with a name of 1–100 characters.");
  if (typeof subcategory !== "string" || categoryName(subcategory).length > 100)
    throw new ApiError(400, "Select a valid subcategory.");
  const name = categoryName(category), childName = categoryName(subcategory);
  const parent = await Category.findOne({ key: name.toLowerCase() }).lean();
  const children = parent?.subcategories || [];
  if (!childName) {
    if (children.length && !allowUnassigned) throw new ApiError(400, `Select a subcategory under “${parent.name}”.`);
    return { category: parent?.name || name, subcategory: "" };
  }
  const child = children.find(item => item.key === childName.toLowerCase());
  if (!child) throw new ApiError(400, `“${childName}” is not a subcategory of “${parent?.name || name}”. Select one from this category.`);
  return { category: parent.name, subcategory: child.name };
}
