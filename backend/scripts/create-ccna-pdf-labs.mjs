import "../src/config/env.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import Category from "../src/models/category.model.js";
import Lab from "../src/models/lab.model.js";
import { CCNA_PDF_LABS } from "../src/simulation/ccna-pdf-labs.js";
import { validateLab } from "../src/services/lab.service.js";
import { validateClassification } from "../src/services/category.service.js";
import { simulate } from "../src/services/netsim.service.js";

const validated = [];
for (const entry of CCNA_PDF_LABS) {
  const draft = validateLab(entry.definition);
  const report = await simulate(draft, {}, "validate");
  console.log(JSON.stringify({ number: entry.number, title: draft.title, valid: report.valid, score: report.score, errors: report.errors, failed: report.tasks.filter(t => !t.passed).map(t => t.text) }));
  if (report.valid) validated.push({ ...entry, draft });
}
if (validated.length !== 27) throw new Error(`Only ${validated.length}/27 solutions pass. No database changes made.`);
if (!process.argv.includes("--save")) {
  console.log("All 27 manually authored labs verified. Use --save to add unpublished drafts.");
} else {
  try {
    await connectDatabase();
    const parent = await Category.findOneAndUpdate({ key: "cisco" }, { $setOnInsert: { name: "Cisco", key: "cisco" } }, { upsert: true, new: true, runValidators: true });
    await Category.updateOne({ _id: parent._id, "subcategories.key": { $ne: "ccna" } }, { $push: { subcategories: { name: "CCNA", key: "ccna" } } }, { runValidators: true });
    const classification = await validateClassification(parent.name, "CCNA");
    for (const { templateId, draft } of validated) {
      const existing = await Lab.findOne({ $or: [{ templateId }, { title: draft.title }] });
      if (existing) {
        if (existing.title !== draft.title) throw new Error(`Template ID ${templateId} belongs to another lab. Existing data retained.`);
        console.log(JSON.stringify({ created: false, id: existing.id, title: existing.title, status: existing.status }));
        continue;
      }
      Object.assign(draft, classification);
      const lab = await Lab.create({ templateId, title: draft.title, ...classification, draft, status: "DRAFT" });
      console.log(JSON.stringify({ created: true, id: lab.id, title: lab.title, status: lab.status, adminPath: `/admin/labs/${lab.id}` }));
    }
  } finally { await mongoose.disconnect(); }
}
