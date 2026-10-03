import "../src/config/env.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import Category from "../src/models/category.model.js";
import Lab from "../src/models/lab.model.js";
import { CCNA_CAPSTONE } from "../src/simulation/ccna-capstone.js";
import { validateLab } from "../src/services/lab.service.js";
import { validateClassification } from "../src/services/category.service.js";
import { simulate } from "../src/services/netsim.service.js";

// No content is changed unless --save is explicitly supplied. Never overwrites
// an existing lab, publishes it, or changes student attempts.
const templateId = -104;
const draft = validateLab(CCNA_CAPSTONE);
const report = await simulate(draft, {}, "validate");
if (!report.valid) throw new Error(`Reference solution failed: ${JSON.stringify(report.errors)}`);
console.log(JSON.stringify({ title: draft.title, devices: draft.devices.length, tasks: draft.tasks.length, solutionScore: report.score }));
if (process.argv.includes("--save")) {
  try {
    await connectDatabase();
    const existing = await Lab.findOne({ $or: [{ templateId }, { title: draft.title }] });
    if (existing) {
      if (existing.title !== draft.title) throw new Error("Template ID is already assigned to a different lab; nothing changed.");
      console.log(JSON.stringify({ created: false, id: existing.id, title: existing.title, status: existing.status, message: "Existing lab retained without changes." }));
    } else {
      const parent = await Category.findOneAndUpdate({ key: "cisco" }, { $setOnInsert: { name: "Cisco", key: "cisco" } }, { upsert: true, new: true, runValidators: true });
      await Category.updateOne({ _id: parent._id, "subcategories.key": { $ne: "ccna" } }, { $push: { subcategories: { name: "CCNA", key: "ccna" } } }, { runValidators: true });
      Object.assign(draft, await validateClassification(parent.name, "CCNA"));
      const lab = await Lab.create({ templateId, title: draft.title, category: draft.category, subcategory: draft.subcategory, draft, status: "DRAFT" });
      console.log(JSON.stringify({ created: true, id: lab.id, title: lab.title, category: lab.category, subcategory: lab.subcategory, status: lab.status, adminPath: `/admin/labs/${lab.id}` }));
    }
  } finally {
    await mongoose.disconnect();
  }
} else {
  console.log("Validation only. Run with --save to create the Cisco / CCNA draft.");
}
