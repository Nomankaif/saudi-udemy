import Category from "../models/category.model.js";
import { ApiError } from "../utils/api-error.js";
import { categoryCatalog, categoryName } from "../services/category.service.js";
import Exam from "../models/exam.model.js";
import Lab from "../models/lab.model.js";

export async function listPublicCategories(req, res) {
  // Only public taxonomy and published content; never infer names from drafts.
  const [saved, exams, labs] = await Promise.all([
    Category.find().select("name subcategories.name").lean(),
    Exam.find({ status: "PUBLISHED" }).select("category subcategory").lean(),
    Lab.find({ status: "PUBLISHED" }).select("published.category published.subcategory").lean(),
  ]);
  const categories = new Map();
  const add = (value, child = "") => {
    const name = categoryName(value);
    if (!name) return;
    const key = name.toLowerCase();
    if (!categories.has(key)) categories.set(key, { name, children: new Map() });
    const subcategory = categoryName(child);
    if (subcategory && !categories.get(key).children.has(subcategory.toLowerCase())) categories.get(key).children.set(subcategory.toLowerCase(), subcategory);
  };
  saved.forEach(c => { add(c.name); (c.subcategories || []).forEach(s => add(c.name, s.name)); });
  exams.forEach(e => add(e.category, e.subcategory));
  labs.forEach(l => add(l.published?.category, l.published?.subcategory));
  res.json([...categories.values()].sort((a, b) => a.name.localeCompare(b.name)).map(c => ({ name: c.name, subcategories: [...c.children.values()].sort((a, b) => a.localeCompare(b)).map(name => ({ name })) })));
}
export async function listCategories(req, res) {
  res.json(await categoryCatalog());
}
export async function addCategory(req, res) {
  const name = categoryName(req.body.name);
  if (!name || name.length > 100) throw new ApiError(400, "Enter a category name between 1 and 100 characters");
  const key = name.toLowerCase();
  if ((await categoryCatalog()).some(item => item.name.toLowerCase() === key)) throw new ApiError(409, "This category already exists");
  try { res.status(201).json(await Category.create({name,key})); }
  catch (error) { if (error.code === 11000) throw new ApiError(409, "This category already exists"); throw error; }
}

export async function addSubcategory(req, res) {
  const category = categoryName(req.body.category), name = categoryName(req.body.name);
  if (!name || name.length > 100) throw new ApiError(400, "Enter a subcategory name between 1 and 100 characters.");
  const parent = (await categoryCatalog()).find(item => item.name.toLowerCase() === category.toLowerCase());
  if (!parent) throw new ApiError(400, "Select an existing parent category.");
  const key = parent.name.toLowerCase(), childKey = name.toLowerCase();
  // Materialize older categories inferred from exams or labs without changing their records.
  try { await Category.updateOne({ key }, { $setOnInsert: { key, name: parent.name } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const updated = await Category.findOneAndUpdate(
    { key, "subcategories.key": { $ne: childKey } },
    { $push: { subcategories: { name, key: childKey } } },
    { new: true, runValidators: true },
  );
  if (!updated) throw new ApiError(409, `“${name}” already exists under “${parent.name}”.`);
  res.status(201).json({ category: parent.name, name });
}

const exactName = name => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

function validName(value) {
  const name = categoryName(value);
  if (!name || name.length > 100) throw new ApiError(400, "Enter a name between 1 and 100 characters.");
  return name;
}

async function findParent(value) {
  const name = validName(value);
  const parent = (await categoryCatalog()).find(item => item.name.toLowerCase() === name.toLowerCase());
  if (!parent) throw new ApiError(404, "This category no longer exists. Refresh the category directory.");
  return parent;
}

function classificationFilter(category, subcategory, prefix = "") {
  return { [`${prefix}category`]: exactName(category), ...(subcategory === undefined ? {} : { [`${prefix}subcategory`]: exactName(subcategory) }) };
}

async function assertUnused(category, subcategory) {
  // Include archived content and both lab versions so restoring/publishing stays safe.
  const [exams, labs] = await Promise.all([
    Exam.countDocuments(classificationFilter(category, subcategory)),
    Lab.countDocuments({ $or: ["", "draft.", "published."].map(prefix => classificationFilter(category, subcategory, prefix)) }),
  ]);
  if (exams || labs) {
    const label = subcategory || category;
    throw new ApiError(409, `Cannot delete “${label}”: used by ${exams} exam${exams === 1 ? "" : "s"} and ${labs} lab${labs === 1 ? "" : "s"}. Reassign these items first, including archived items and published lab versions.`, { exams, labs });
  }
}

async function renameAssignments(category, name, subcategory) {
  const field = subcategory === undefined ? "category" : "subcategory";
  await Exam.updateMany(classificationFilter(category, subcategory), { $set: { [field]: name } });
  // Match each version independently: a draft may use a different classification.
  for (const prefix of ["", "draft.", "published."]) {
    await Lab.updateMany(classificationFilter(category, subcategory, prefix), { $set: { [`${prefix}${field}`]: name } });
  }
  // Attempt snapshots are historical records and deliberately remain unchanged.
}

export async function updateCategory(req, res) {
  const parent = await findParent(req.body.category), name = validName(req.body.name);
  const key = parent.name.toLowerCase(), nextKey = name.toLowerCase();
  if (nextKey !== key && (await categoryCatalog()).some(item => item.name.toLowerCase() === nextKey)) throw new ApiError(409, `Category “${name}” already exists. Choose a different name.`);
  // Legacy categories may exist only on exams/labs; materialize them before renaming.
  try { await Category.updateOne({ key }, { $setOnInsert: { name: parent.name, key } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  try {
    const updated = await Category.findOneAndUpdate({ key }, { $set: { name, key: nextKey } }, { new: true, runValidators: true });
    if (!updated) throw new ApiError(409, "This category changed while you were editing. Refresh and try again.");
    await renameAssignments(parent.name, name);
    res.json({ name });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, `Category “${name}” already exists. Choose a different name.`);
    throw error;
  }
}

export async function updateSubcategory(req, res) {
  const parent = await findParent(req.body.category), original = validName(req.body.subcategory), name = validName(req.body.name);
  const child = parent.subcategories.find(item => item.name.toLowerCase() === original.toLowerCase());
  if (!child) throw new ApiError(404, "This subcategory no longer exists. Refresh the category directory.");
  const key = child.name.toLowerCase(), nextKey = name.toLowerCase();
  const filter = { key: parent.name.toLowerCase(), "subcategories.key": key };
  if (nextKey !== key) filter.subcategories = { $not: { $elemMatch: { key: nextKey } } };
  const updated = await Category.findOneAndUpdate(filter, { $set: { "subcategories.$.name": name, "subcategories.$.key": nextKey } }, { new: true, runValidators: true });
  if (!updated) throw new ApiError(409, `Subcategory “${name}” already exists, or this item has changed. Refresh and choose a different name.`);
  await renameAssignments(parent.name, name, child.name);
  res.json({ category: parent.name, name });
}

export async function deleteCategory(req, res) {
  const parent = await findParent(req.body.category);
  if (parent.subcategories.length) throw new ApiError(409, `Cannot delete “${parent.name}”: it contains ${parent.subcategories.length} subcategor${parent.subcategories.length === 1 ? "y" : "ies"}. Remove its subcategories first.`);
  await assertUnused(parent.name);
  const removed = await Category.findOneAndDelete({ key: parent.name.toLowerCase(), subcategories: { $size: 0 } });
  if (!removed) throw new ApiError(409, "This category changed while you were deleting it. Refresh and try again.");
  res.json({ name: parent.name, deleted: true });
}

export async function deleteSubcategory(req, res) {
  const parent = await findParent(req.body.category), original = validName(req.body.subcategory);
  const child = parent.subcategories.find(item => item.name.toLowerCase() === original.toLowerCase());
  if (!child) throw new ApiError(404, "This subcategory no longer exists. Refresh the category directory.");
  await assertUnused(parent.name, child.name);
  const updated = await Category.updateOne({ key: parent.name.toLowerCase(), "subcategories.key": child.name.toLowerCase() }, { $pull: { subcategories: { key: child.name.toLowerCase() } } });
  if (!updated.modifiedCount) throw new ApiError(409, "This subcategory changed while you were deleting it. Refresh and try again.");
  res.json({ category: parent.name, name: child.name, deleted: true });
}
