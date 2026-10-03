import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { mediaDirectory } from "../config/storage.js";
import ExcelJS from "exceljs";
import { Document, Paragraph, Packer } from "docx";
import app from "../app.js";
import Attempt from "../models/attempt.model.js";
import Question from "../models/question.model.js";
import Result from "../models/result.model.js";
import { finalizeExpired } from "../services/attempt.service.js";
import {
  templateHeaders,
  templateRow,
  extractQuestions,
  previewQuestions,
} from "../services/import.service.js";
import {
  normalizeQuestion,
  questionErrors,
} from "../services/question-validation.js";
import { scoreQuestions } from "../services/scoring.service.js";

function pdfFixture(lines) {
  const stream = `BT /F1 10 Tf 30 780 Td ${lines.map((line, i) => `${i ? "0 -20 Td " : ""}(${line.replace(/[()\\]/g, "\\$&")}) Tj`).join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(body);
}
test("import parsers and grading", async () => {
  const lines = [
    `Question 1: ${templateRow[0]}`,
    ...templateRow
      .slice(1, 5)
      .map((text, i) => `${String.fromCharCode(65 + i)}. ${text}`),
    "Answer: A",
    `Explanation: ${templateRow[6]}`,
    "Access: FREE",
    "Topic: Security fundamentals",
    "Difficulty: EASY",
  ];
  const word = await Packer.toBuffer(
    new Document({
      sections: [{ children: lines.map((text) => new Paragraph(text)) }],
    }),
  );
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Questions");
  sheet.addRow(templateHeaders);
  sheet.addRow(templateRow);
  for (const [buffer, format] of [
    [word, ".docx"],
    [await workbook.xlsx.writeBuffer(), ".xlsx"],
    [await workbook.csv.writeBuffer(), ".csv"],
    [pdfFixture(lines), ".pdf"],
  ]) {
    const questions = await extractQuestions(buffer, format);
    assert.equal(questions.length, 1, format);
    assert.equal(questions[0].correctOptionIds[0], "A", format);
    assert.deepEqual(questionErrors(questions[0]), [], format);
  }
  const q = normalizeQuestion({
    text: "Test",
    options: ["A", "B", "C", "D"].map((text) => ({ text })),
    correctOptionIds: ["A"],
    explanation: "Because",
    accessLevel: "FREE",
  });
  assert.equal(previewQuestions([q, q])[1].duplicate, true);
  assert.ok(questionErrors({ ...q, correctOptionIds: [] }).length);
  const score = scoreQuestions(
    [
      { ...q, _id: "1", marks: 1 },
      { ...q, _id: "2", marks: 1 },
      { ...q, _id: "3", marks: 1 },
    ],
    [
      { attemptQuestionId: "1", selectedOptionIds: ["A"] },
      { attemptQuestionId: "2", selectedOptionIds: ["B"] },
    ],
  );
  assert.equal(score.correctCount, 1);
  assert.equal(score.incorrectCount, 1);
  assert.equal(score.unansweredCount, 1);
  assert.equal(score.percentage, 33.33);
});

test(
  "real MongoDB: publish, 900-question pagination, approvals, snapshots and expiry",
  { timeout: 120000 },
  async () => {
    const dbName = `exam_flow_test_${randomUUID().replaceAll("-", "")}`;
    const password = "test-admin-password-only";
    process.env.ADMIN_PASSWORD = password;
    await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`, {
      serverSelectionTimeoutMS: 5000,
    });
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function call(
      path,
      method = "GET",
      body,
      cookie = "",
      expected = 200,
    ) {
      const response = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      assert.equal(
        response.status,
        expected,
        `${method} ${path}: ${JSON.stringify(data).slice(0, 500)}`,
      );
      return {
        data,
        cookie: response.headers
          .getSetCookie()
          .map((item) => item.split(";")[0])
          .join("; "),
      };
    }
    try {
      const admin = (await call("/auth/admin/login", "POST", { password }))
        .cookie;
      const userData = {
        firstName: "Exam",
        lastName: "Tester",
        email: "student@test.invalid",
        password: "Student-test-password",
      };
      await call("/auth/register", "POST", userData, "", 201);
      const student = (await call("/auth/login", "POST", userData)).cookie;
      await call("/exams/admin/all", "GET", undefined, student, 403);
      const imageForm = new FormData();
      imageForm.append("file", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=", "base64")], {type:"image/png"}), "cover.png");
      const uploaded = await fetch(`${base}/media/covers`, {method:"POST",headers:{Cookie:admin},body:imageForm});
      assert.equal(uploaded.status,201);
      const imageData = await uploaded.json();
      assert.match(imageData.url, /^\/uploads\/media\/cover-[a-f0-9-]+\.png$/);
      try { const served = await fetch(`${base.replace(/\/api$/, "")}${imageData.url}`); assert.equal(served.status,200); assert.match(served.headers.get("content-type"), /image\/png/); }
      finally { await unlink(path.join(mediaDirectory, path.basename(imageData.url))); }
      const invalidImage = new FormData(); invalidImage.append("file",new Blob(["not an image"],{type:"image/png"}),"fake.png");
      assert.equal((await fetch(`${base}/media/covers`,{method:"POST",headers:{Cookie:admin},body:invalidImage})).status,400);
      assert.equal((await fetch(`${base}/media/covers`,{method:"POST",headers:{Cookie:student},body:imageForm})).status,403);
      const exam = (
        await call(
          "/exams",
          "POST",
          {
            title: "Test certification",
            slug: "test-certification",
            category: "Testing",
            shortDescription: "Integration fixture",
            durationMinutes: 1,
            attemptSize: 3,
          },
          admin,
          201,
        )
      ).data;
      assert.ok(exam.slug && exam.slug !== "test-certification");
      await call(`/exams/${exam.slug}`, "GET", undefined, "", 404);
      await call(`/exams/${exam._id}/publish`, "POST", {}, admin, 400);
      const q = {
        text: "Which option is correct?",
        options: ["First", "Second", "Third", "Fourth"].map((text, i) => ({
          id: String.fromCharCode(65 + i),
          text,
        })),
        correctOptionIds: ["A"],
        explanation: "The first option is correct.",
        accessLevel: "FREE",
        topic: "Basics",
        difficulty: "EASY",
      };
      const saved = (
        await call(`/exams/${exam._id}/questions`, "POST", q, admin, 201)
      ).data;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Questions");
      sheet.addRow(templateHeaders);
      sheet.addRow(templateRow);
      const form = new FormData();
      form.set(
        "file",
        new Blob([await workbook.xlsx.writeBuffer()]),
        "questions.xlsx",
      );
      const preview = await fetch(`${base}/exams/${exam._id}/import/preview`, {
        method: "POST",
        headers: { Cookie: admin },
        body: form,
      });
      assert.equal(preview.status, 200);
      assert.equal((await preview.json()).questions.length, 1);
      assert.equal(await Question.countDocuments({ examId: exam._id }), 1);
      await call(
        `/exams/${exam._id}/import/commit`,
        "POST",
        { questions: [{ ...q, correctOptionIds: [] }] },
        admin,
        400,
      );
      await call(
        `/exams/${exam._id}/import/commit`,
        "POST",
        { questions: [q] },
        admin,
        409,
      );
      const imported = Array.from({ length: 899 }, (_, i) => ({
        ...q,
        text: `Unique question ${i + 2}`,
        accessLevel: i < 39 ? "FREE" : "PREMIUM",
      }));
      await call(
        `/exams/${exam._id}/import/commit`,
        "POST",
        { questions: imported },
        admin,
      );
      const published = (
        await call(`/exams/${exam._id}/publish`, "POST", {}, admin)
      ).data;
      assert.equal(published.questionCount, 900);
      const lastDraftPage = (await call(`/exams/${exam._id}/admin/questions?page=36`, "GET", undefined, admin)).data;
      const lastDraft = lastDraftPage.questions.at(-1);
      const focusedDraft = (await call(`/exams/${exam._id}/admin/questions?focus=${lastDraft._id}`, "GET", undefined, admin)).data;
      assert.equal(focusedDraft.page, 36);
      assert.ok(focusedDraft.questions.some(question => question._id === lastDraft._id));
      assert.equal(published.freeQuestionCount, 40);
      await call(
        "/attempts",
        "POST",
        { examId: exam._id, mode: "PRACTICE" },
        "",
        401,
      );
      const practice = (
        await call(
          "/attempts",
          "POST",
          { examId: exam._id, mode: "PRACTICE", count: 1 },
          student,
          201,
        )
      ).data;
      assert.equal(practice.questionCount, 40);
      assert.equal(practice.lockedQuestions.length, 860);
      assert.deepEqual(Object.keys(practice.lockedQuestions[0]).sort(), ["number", "topic"]);
      assert.equal(practice.lockedQuestions[0].number, 41);
      const batch = (
        await call(
          `/attempts/${practice._id}/questions`,
          "GET",
          undefined,
          student,
        )
      ).data;
      assert.equal(batch.questions.length, 25);
      assert.equal(batch.progress.length, 40);
      assert.equal(batch.progress[0].number, 1);
      assert.equal(batch.progress[0].premium, false);
      assert.ok(batch.questions.every(question => question.accessLevel === "FREE"));
      assert.ok(!("correctOptionIds" in batch.questions[0]));
      assert.ok(!("explanation" in batch.questions[0]));
      const first = batch.questions[0];
      await call(
        `/attempts/${practice._id}/answers/${first._id}`,
        "PUT",
        { selectedOptionIds: ["Z"] },
        student,
        400,
      );
      await call(
        `/attempts/${practice._id}/answers/${first._id}`,
        "PUT",
        { selectedOptionIds: ["A"], markedForReview: true },
        student,
      );
      await call(
        `/exams/${exam._id}/questions/${saved._id}`,
        "PATCH",
        { ...q, correctOptionIds: ["B"], explanation: "Edited explanation" },
        admin,
      );
      const explanation = (
        await call(
          `/attempts/${practice._id}/explanation/${first._id}`,
          "GET",
          undefined,
          student,
        )
      ).data;
      assert.deepEqual(explanation.correctOptionIds, ["A"]);
      const result = (
        await call(`/attempts/${practice._id}/submit`, "POST", {}, student)
      ).data;
      assert.equal(result.correctCount, 1);
      assert.equal(result.unansweredCount, 39);
      await call(`/attempts/${practice._id}/submit`, "POST", {}, student);
      assert.equal(await Result.countDocuments({ attemptId: practice._id }), 1);
      const access = (
        await call(
          "/access-requests",
          "POST",
          { examId: exam._id, userMessage: "Please approve" },
          student,
          201,
        )
      ).data;
      await call(
        "/access-requests",
        "POST",
        { examId: exam._id },
        student,
        409,
      );
      await call(
        `/access-requests/${access._id}/review`,
        "PATCH",
        { status: "APPROVED" },
        student,
        403,
      );
      await call(
        `/access-requests/${access._id}/review`,
        "PATCH",
        { status: "APPROVED", accessExpiresAt: "2020-01-01" },
        admin,
        400,
      );
      await call(
        `/access-requests/${access._id}/review`,
        "PATCH",
        { status: "APPROVED" },
        admin,
      );
      const full = (
        await call(
          "/attempts",
          "POST",
          { examId: exam._id, mode: "PRACTICE", count: 900 },
          student,
          201,
        )
      ).data;
      assert.equal(full.questionCount, 900);
      assert.equal(full.lockedQuestions.length, 0);
      const last = (
        await call(
          `/attempts/${full._id}/questions?page=36`,
          "GET",
          undefined,
          student,
        )
      ).data;
      assert.equal(last.questions.length, 25);
      assert.equal(last.questions[24].displayOrder, 900);
      assert.equal(last.questions[24].accessLevel, "PREMIUM");
      assert.equal(last.progress[899].premium, true);
      const timed = (
        await call(
          "/attempts",
          "POST",
          { examId: exam._id, mode: "TIMED", durationMinutes: 125 },
          student,
          201,
        )
      ).data;
      assert.equal(timed.questionCount, 900);
      assert.equal(new Date(timed.expiresAt) - new Date(timed.startedAt), 125 * 60000);
      await call("/attempts", "POST", { examId: exam._id, mode: "TIMED", durationMinutes: 0 }, student, 400);
      await call("/attempts", "POST", { examId: exam._id, mode: "TIMED", durationMinutes: 1441 }, student, 400);
      await call("/attempts", "POST", { examId: exam._id, mode: "TIMED", durationMinutes: 1.5 }, student, 400);
      const tq = (
        await call(
          `/attempts/${timed._id}/questions`,
          "GET",
          undefined,
          student,
        )
      ).data.questions[0];
      await call(
        `/attempts/${timed._id}/explanation/${tq._id}`,
        "GET",
        undefined,
        student,
        403,
      );
      await Attempt.updateOne(
        { _id: timed._id },
        { expiresAt: new Date(Date.now() - 1000) },
      );
      await call(
        `/attempts/${timed._id}/answers/${tq._id}`,
        "PUT",
        { selectedOptionIds: ["A"] },
        student,
        409,
      );
      const expired = (
        await call(`/attempts/${timed._id}/result`, "GET", undefined, student)
      ).data;
      assert.equal(expired.result.unansweredCount, 900);
      const offline = (
        await call(
          "/attempts",
          "POST",
          { examId: exam._id, mode: "TIMED" },
          student,
          201,
        )
      ).data;
      await Attempt.updateOne(
        { _id: offline._id },
        { expiresAt: new Date(Date.now() - 1000) },
      );
      await finalizeExpired();
      assert.ok(await Result.exists({ attemptId: offline._id }));
      await call(
        `/access-requests/${access._id}/review`,
        "PATCH",
        { status: "REVOKED" },
        admin,
      );
      await call(
        `/attempts/${full._id}/questions`,
        "GET",
        undefined,
        student,
        403,
      );
      const feedbackUrl = `/exams/${exam._id}/feedback`;
      await call("/auth/me", "PATCH", { firstName:"Updated", lastName:"Learner", mobile:"", role:"ADMIN" }, "", 401);
      const updatedProfile = (await call("/auth/me", "PATCH", { firstName:"Updated", lastName:"Learner", mobile:"", role:"ADMIN" }, student)).data;
      assert.equal(updatedProfile.firstName,"Updated");
      assert.equal(updatedProfile.role,"STUDENT");
      assert.ok(!updatedProfile.passwordHash);
      await call("/auth/me", "PATCH", { firstName:"", lastName:"Learner", mobile:"" }, student, 400);
      await call("/categories", "POST", {name:"Cloud Services"}, student, 403);
      await call("/categories", "POST", {name:"Cloud Services"}, admin, 201);
      await call("/categories", "POST", {name:"cloud services"}, admin, 409);
      await call("/categories", "POST", {name:" "}, admin, 400);
      const categories = (await call("/categories", "GET", undefined, admin)).data;
      assert.ok(categories.some(item => item.name === "Cloud Services"));
      await call("/reports/analytics", "GET", undefined, student, 403);
      const analytics = (await call("/reports/analytics", "GET", undefined, admin)).data;
      assert.equal(analytics.activity.length, 14);
      assert.equal(analytics.activeLearners, 1);
      assert.ok(analytics.popular.some(item => item._id === exam._id && item.count > 0));
      assert.ok(analytics.activity.reduce((sum, day) => sum + day.count, 0) > 0);
      await call(`${feedbackUrl}/mine`, "PUT", { rating: 5, comment: "Great explanations" }, "", 401);
      await call(`${feedbackUrl}/mine`, "PUT", { rating: 6, comment: "Invalid" }, student, 400);
      await call(`${feedbackUrl}/mine`, "PUT", { rating: 5, comment: "Great explanations", liked: true }, student);
      await call(`${feedbackUrl}/mine`, "PUT", { liked: true }, student);
      let feedback = (await call(feedbackUrl, "GET", undefined, "")).data;
      assert.equal(feedback.count, 1);
      assert.equal(feedback.likes, 1);
      assert.equal(feedback.rating, 5);
      assert.equal(feedback.reviews[0].comment, "Great explanations");
      assert.ok(!JSON.stringify(feedback).includes("passwordHash"));
      await call(`${feedbackUrl}/mine`, "PUT", { rating: 4, comment: "Updated review", liked: false }, student);
      feedback = (await call(feedbackUrl, "GET", undefined, "")).data;
      assert.equal(feedback.count, 1);
      assert.equal(feedback.likes, 0);
      assert.equal(feedback.rating, 4);
      await call(`/exams/${exam._id}/unpublish`, "POST", {}, admin);
      await call(feedbackUrl, "GET", undefined, "", 404);
      await call(`/exams/${exam._id}`, "DELETE", undefined, student, 403);
      await call(`/exams/${exam._id}`, "DELETE", undefined, admin);
      const remainingExams = (await call("/exams/admin/all", "GET", undefined, admin)).data;
      assert.ok(!remainingExams.some(item => item._id === exam._id));
      assert.ok(await Result.exists({ attemptId: practice._id }));
      await call(`/exams/${exam.slug}`, "GET", undefined, "", 404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      assert.equal(mongoose.connection.name, dbName);
      assert.ok(dbName.startsWith("exam_flow_test_"));
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  },
);
