import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import app from "../app.js";
import Category from "../models/category.model.js";
import Exam from "../models/exam.model.js";
import Lab from "../models/lab.model.js";
import { LABS } from "../vendor/lab-ccna/labData.js";

test("category hierarchy: duplicates, legacy records, exam/lab assignment, publishing and access", { timeout: 60000 }, async () => {
  const dbName = `categories_test_${randomUUID().replaceAll("-", "")}`;
  process.env.ADMIN_PASSWORD = "category-test-admin-password";
  await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`, { serverSelectionTimeoutMS: 5000 });
  await Category.init();
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(path, method = "GET", body, cookie = "", expected = 200) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data).slice(0, 500)}`);
    return { data, cookie: response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ") };
  }
  try {
    const admin = (await call("/auth/admin/login", "POST", { password: process.env.ADMIN_PASSWORD })).cookie;
    await call("/categories/subcategories", "POST", { category: "Cisco", name: "CCNA" }, "", 401);
    const studentBody = { firstName: "Category", lastName: "Tester", email: "category@test.invalid", password: "category-test-student-password" };
    await call("/auth/register", "POST", studentBody, "", 201);
    const student = (await call("/auth/login", "POST", studentBody)).cookie;
    await call("/categories/subcategories", "POST", { category: "Cisco", name: "CCNA" }, student, 403);
    await call("/categories", "POST", { name: " Cisco " }, admin, 201);
    await call("/categories", "POST", { name: "cisco" }, admin, 409);
    await call("/categories/subcategories", "POST", { category: "Missing", name: "CCNA" }, admin, 400);
    await call("/categories/subcategories", "POST", { category: "Cisco", name: " " }, admin, 400);
    const examBody = { title: "CCNA exam", shortDescription: "Category test", category: "Cisco" };
    const legacyExam = (await call("/exams", "POST", examBody, admin, 201)).data;
    const labBody = { ...LABS[0], category: "Cisco", access: "FREE", durationMinutes: 60 };
    const legacyLab = (await call("/labs/admin", "POST", labBody, admin)).data;
    await call("/categories/subcategories", "POST", { category: "cisco", name: " CCNA " }, admin, 201);
    await call("/categories/subcategories", "POST", { category: "Cisco", name: "ccna" }, admin, 409);
    await call("/categories", "POST", { name: "CompTIA" }, admin, 201);
    await call("/categories/subcategories", "POST", { category: "CompTIA", name: "Network+" }, admin, 201);
    // Same child label is allowed under different parents; concurrent duplicates are rejected.
    const duplicates = await Promise.all([1, 2].map(() => fetch(base + "/categories/subcategories", { method: "POST", headers: { "Content-Type": "application/json", Cookie: admin }, body: JSON.stringify({ category: "CompTIA", name: "CCNA" }) })));
    assert.deepEqual(duplicates.map(r => r.status).sort(), [201, 409]);
    await call("/exams", "POST", examBody, admin, 400);
    await call("/labs/admin", "POST", labBody, admin, 400);
    await call(`/exams/${legacyExam._id}`, "PATCH", { title: "Legacy exam preserved" }, admin);
    await call(`/labs/admin/${legacyLab._id}`, "PUT", labBody, admin);
    const exam = (await call("/exams", "POST", { ...examBody, category: "cisco", subcategory: "ccna" }, admin, 201)).data;
    assert.equal(exam.category, "Cisco"); assert.equal(exam.subcategory, "CCNA");
    await call(`/exams/${exam._id}`, "PATCH", { subcategory: "Network+" }, admin, 400);
    assert.equal((await call(`/exams/admin/${exam._id}`, "GET", undefined, admin)).data.subcategory, "CCNA");
    await call(`/exams/${exam._id}`, "PATCH", { category: "CompTIA" }, admin, 400);
    const updatedExam = (await call(`/exams/${exam._id}`, "PATCH", { category: "CompTIA", subcategory: "Network+" }, admin)).data;
    assert.equal(updatedExam.subcategory, "Network+");
    const question = { text: "Choose A", options: ["A", "B", "C", "D"].map(id => ({ id, text: id })), correctOptionIds: ["A"], explanation: "A is correct.", accessLevel: "FREE" };
    await call(`/exams/${exam._id}/questions`, "POST", question, admin, 201);
    await call(`/exams/${exam._id}/publish`, "POST", {}, admin);
    assert.equal((await call(`/exams/${exam.slug}`)).data.subcategory, "Network+");
    const lab = (await call("/labs/admin", "POST", { ...labBody, subcategory: "CCNA" }, admin)).data;
    assert.equal(lab.subcategory, "CCNA"); assert.equal(lab.draft.subcategory, "CCNA");
    await call(`/labs/admin/${lab._id}`, "PUT", { ...labBody, subcategory: "Network+" }, admin, 400);
    await call(`/labs/admin/${lab._id}/publish`, "POST", {}, admin);
    assert.equal((await call("/labs")).data.find(l => l._id === lab._id).subcategory, "CCNA");
    const attempt = (await call(`/labs/${lab._id}/start`, "POST", { mode: "PRACTICE" }, student, 201)).data;
    assert.equal(attempt.lab.subcategory, "CCNA");
    await call(`/labs/admin/${lab._id}`, "PUT", { ...labBody, category: "CompTIA", subcategory: "Network+" }, admin);
    assert.equal((await call("/labs")).data.find(l => l._id === lab._id).subcategory, "CCNA", "Draft changes must not change the published lab");
    await call(`/labs/admin/${lab._id}/publish`, "POST", {}, admin);
    assert.equal((await call(`/labs/attempts/${attempt._id}`, "GET", undefined, student)).data.lab.subcategory, "CCNA", "Active sessions retain their snapshot");
    // Categories existing only on older labs or exams can receive children without a migration.
    await Exam.create({ title: "Old exam", slug: randomUUID(), category: "Old exams", shortDescription: "Legacy" });
    await Lab.create({ title: "Old lab", category: "Old labs", draft: { ...labBody, category: "Old labs" } });
    await call("/categories/subcategories", "POST", { category: "Old labs", name: "Basics" }, admin, 201);
    await call("/categories/subcategories", "POST", { category: "Old exams", name: "Advanced" }, admin, 201);
    const categories = (await call("/categories", "GET", undefined, admin)).data;
    assert.deepEqual(categories.find(c => c.name === "Cisco").subcategories, [{ name: "CCNA" }]);
    assert.deepEqual(categories.find(c => c.name === "Old labs").subcategories, [{ name: "Basics" }]);
    assert.deepEqual(categories.find(c => c.name === "Old exams").subcategories, [{ name: "Advanced" }]);
    // Public navigation exposes the shared directory, not draft-only content or admin fields.
    await Exam.create({ title: "Private draft", slug: randomUUID(), category: "Draft only", shortDescription: "Private" });
    await Lab.create({ title: "Published lab with edits", category: "Unpublished lab category", draft: { ...labBody, category: "Unpublished lab category" }, published: { ...labBody, category: "Published lab category", subcategory: "Published topic" }, status: "PUBLISHED" });
    const publicCategories = (await call("/categories/public")).data;
    assert.deepEqual(publicCategories.find(c => c.name === "Cisco"), { name: "Cisco", subcategories: [{ name: "CCNA" }] });
    assert.deepEqual(publicCategories.find(c => c.name === "Published lab category"), { name: "Published lab category", subcategories: [{ name: "Published topic" }] });
    assert.ok(!publicCategories.some(c => ["Draft only", "Unpublished lab category"].includes(c.name)));
    assert.ok(publicCategories.every(c => Object.keys(c).sort().join(",") === "name,subcategories"));
    await call("/categories", "GET", undefined, "", 401);
    // Edit/delete access control and actionable errors.
    for (const method of ["PATCH", "DELETE"]) {
      for (const path of ["/categories", "/categories/subcategories"]) {
        await call(path, method, { category: "Cisco", subcategory: "CCNA", name: "Renamed" }, "", 401);
        await call(path, method, { category: "Cisco", subcategory: "CCNA", name: "Renamed" }, student, 403);
      }
    }
    await call("/categories", "PATCH", { category: "Missing", name: "Renamed" }, admin, 404);
    await call("/categories", "PATCH", { category: "Cisco", name: " " }, admin, 400);
    await call("/categories", "PATCH", { category: "Cisco", name: "comptia" }, admin, 409);
    await call("/categories/subcategories", "PATCH", { category: "CompTIA", subcategory: "CCNA", name: "Network+" }, admin, 409);
    const parentBlocked = await call("/categories", "DELETE", { category: "Cisco" }, admin, 409);
    assert.match(parentBlocked.data.message, /subcategor/);
    // Archived exams and published lab versions still protect their labels.
    const archived = await Exam.create({ title: "Archived example", slug: randomUUID(), shortDescription: "Archived", category: "CompTIA", subcategory: "Network+", status: "ARCHIVED" });
    const childBlocked = await call("/categories/subcategories", "DELETE", { category: "CompTIA", subcategory: "Network+" }, admin, 409);
    assert.match(childBlocked.data.message, /Reassign/);
    assert.ok(childBlocked.data.details.exams >= 2);
    // A draft classification can differ from the published lab. Rename only matching paths.
    await call(`/labs/admin/${lab._id}`, "PUT", { ...labBody, category: "Cisco", subcategory: "CCNA" }, admin);
    await call("/categories/subcategories", "PATCH", { category: "CompTIA", subcategory: "Network+", name: " Network Plus " }, admin);
    assert.equal((await Exam.findById(exam._id)).subcategory, "Network Plus");
    assert.equal((await Exam.findById(archived._id)).subcategory, "Network Plus");
    let renamedLab = await Lab.findById(lab._id);
    assert.equal(renamedLab.subcategory, "CCNA");
    assert.equal(renamedLab.draft.subcategory, "CCNA");
    assert.equal(renamedLab.published.subcategory, "Network Plus");
    await call("/categories", "PATCH", { category: "comptia", name: "CompTIA Certifications" }, admin);
    assert.equal((await Exam.findById(exam._id)).category, "CompTIA Certifications");
    renamedLab = await Lab.findById(lab._id);
    assert.equal(renamedLab.category, "Cisco");
    assert.equal(renamedLab.draft.category, "Cisco");
    assert.equal(renamedLab.published.category, "CompTIA Certifications");
    assert.equal((await call(`/labs/attempts/${attempt._id}`, "GET", undefined, student)).data.lab.subcategory, "CCNA");
    const renamedDirectory = (await call("/categories/public")).data;
    assert.ok(!renamedDirectory.some(c => c.name === "CompTIA"));
    assert.ok(renamedDirectory.find(c => c.name === "CompTIA Certifications").subcategories.some(c => c.name === "Network Plus"));
    // Case-only edits, duplicate children under different parents, and unused deletions.
    await call("/categories/subcategories", "PATCH", { category: "Cisco", subcategory: "CCNA", name: "ccna" }, admin);
    assert.equal((await Lab.findById(lab._id)).draft.subcategory, "ccna");
    assert.equal((await Category.findOne({ key: "comptia certifications" })).subcategories.find(s => s.key === "ccna").name, "CCNA");
    await call("/categories", "POST", { name: "Temporary category" }, admin, 201);
    await call("/categories/subcategories", "POST", { category: "Temporary category", name: "Basics" }, admin, 201);
    await call("/categories/subcategories", "DELETE", { category: "Temporary category", subcategory: "Basics" }, admin);
    await call("/categories", "DELETE", { category: "Temporary category" }, admin);
    assert.ok(!(await call("/categories/public")).data.some(c => c.name === "Temporary category"));
    await call("/categories", "DELETE", { category: "Temporary category" }, admin, 404);
    // Legacy inferred names can be edited, but in-use parents cannot be deleted.
    const legacy = await Exam.create({ title: "Legacy label", slug: randomUUID(), shortDescription: "Legacy", category: "Legacy [A]+" });
    const unrelated = await Exam.create({ title: "Unrelated label", slug: randomUUID(), shortDescription: "Legacy", category: "Legacy A" });
    await call("/categories", "PATCH", { category: "Legacy [A]+", name: "Legacy renamed" }, admin);
    assert.equal((await Exam.findById(legacy._id)).category, "Legacy renamed");
    assert.equal((await Exam.findById(unrelated._id)).category, "Legacy A");
    const usedParent = await call("/categories", "DELETE", { category: "Legacy renamed" }, admin, 409);
    assert.match(usedParent.data.message, /1 exam/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, dbName);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
