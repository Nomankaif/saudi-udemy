import test from "node:test";
import assert from "node:assert/strict";
import { bulkImportIssues } from "../services/import-review.js";

test("bulk confirmation accepts unreviewed valid rows without opening each editor", () => {
  const rows = [{ sourceNumber: 1, reviewed: false }, { sourceNumber: 2, reviewed: true }];
  assert.deepEqual(bulkImportIssues(rows, "Question", true, () => []), []);
  assert.deepEqual(bulkImportIssues(rows, "Lab", false, () => []), [
    "Lab 1: confirm bulk source review or review and save it first",
  ]);
});

test("bulk confirmation does not bypass structural or simulator errors", () => {
  const rows = [{ sourceNumber: 3, reviewed: false, errors: ["Invalid interface status", "Reference solution failed"] }];
  assert.deepEqual(bulkImportIssues(rows, "Lab", true, row => row.errors), [
    "Lab 3: Invalid interface status",
    "Lab 3: Reference solution failed",
  ]);
});
