import test from "node:test";
import assert from "node:assert/strict";
import { CCNA_DRAG_DROP_EXAM as exam, CCNA_DRAG_DROP_QUESTIONS as questions } from "../simulation/ccna-drag-drop-exam.js";
import { questionErrors } from "../services/question-validation.js";
import { validatePlacements } from "../services/drag-drop.service.js";
import { scoreQuestions } from "../services/scoring.service.js";

test("CCNA sample contains five publish-ready free drag-and-drop questions in a draft exam", () => {
  assert.equal(exam.status, "DRAFT");
  assert.equal(exam.category, "Cisco");
  assert.equal(exam.subcategory, "CCNA");
  assert.equal(questions.length, exam.attemptSize);
  questions.forEach((question, index) => {
    assert.equal(question.type, "DRAG_DROP");
    assert.equal(question.accessLevel, "FREE");
    assert.equal(question.displayOrder, index + 1);
    assert.deepEqual(questionErrors(question), []);
    assert.deepEqual(validatePlacements(question, question.correctPlacements), question.correctPlacements);
  });
});

test("answer keys score 100%, incomplete answers fail, and the distractor is not required", () => {
  const snapshots = questions.map((question, index) => ({ ...question, _id: String(index) }));
  const answers = snapshots.map(question => ({ attemptQuestionId: question._id, placements: [...question.correctPlacements].reverse() }));
  assert.equal(scoreQuestions(snapshots, answers).percentage, 100);
  assert.equal(scoreQuestions(snapshots, []).unansweredCount, 5);
  answers[0].placements.pop();
  assert.equal(scoreQuestions(snapshots, answers).percentage, 80);
  const grouping = questions[3];
  assert.equal(grouping.options.length - grouping.correctPlacements.length, 1);
  assert.ok(!grouping.correctPlacements.some(p => p.itemId === "unused"));
  assert.equal(scoreQuestions([{ ...grouping, _id: "group" }], [{ attemptQuestionId: "group", placements: grouping.correctPlacements.map((p, i) => i === 0 ? { ...p, itemId: "unused" } : p) }]).percentage, 0);
});
