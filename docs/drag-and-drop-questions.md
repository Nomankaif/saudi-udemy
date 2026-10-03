# Drag-and-drop questions

## Create a question

1. Admin → Exams → open the question studio → New question.
2. Select **Drag and drop** in Question type. Changing types clears the old
   answer options and key after confirmation; the question text is retained.
3. Enter the question and instructions, including whether some items are unused.
4. Add destination groups and set the number of slots in each group.
5. Add draggable items. Select each item's correct destination, or choose
   **Unused distractor** if it should remain in the item bank.
6. Add an explanation, topic and access level. Save the draft.
7. Use **Student preview** to try the interaction; expand **View answer key**
   to inspect the mapping. Publish the exam to release the updated question.

The editor supports 2–20 text items and 1–10 groups with 1–20 slots per group.
Every slot must have an answer in the key before publication. Drafts may be
incomplete; the checklist identifies what still needs attention. Duplicate
questions retain their items, groups and mapping.

Use a one-slot destination for one-to-one matching. For sequence exercises,
create labeled destinations such as Step 1, Step 2 and Step 3. Multiple slots
in a group support classification exercises; ordering **within** a group is
not assessed. This version does not support image hotspots, image items or
reusing the same item in multiple groups.

## Student controls

- Drag an item to a group using a mouse, or select an item then select its
  destination button. The select/place method also supports touch and keyboard
  (Tab to focus, Enter/Space to activate, Escape to cancel selection).
- Move an item between groups, use its return button, or clear all placements.
- Full groups reject additional items; remove or move one first.
- Each change is saved to the server. Editing/navigation/submission are blocked
  while saving. On a save failure, the local answer stays visible and **Retry
  saving** resends it. Do not refresh or close the page with unsaved work.
- Partial placements are resumable and count as an answered question in the
  navigator. Leaving all items unused counts as unanswered.
- Practice mode can reveal the answer mapping and explanation. Timed mode
  exposes them only after submission or expiry.

## Grading and compatibility

A question earns its existing one point only when all item-to-group mappings
match the key and distractors remain unused. Group ordering and drag sequence
do not matter. Partial or wrong mappings receive zero; there is no partial
credit per item. The review shows each item's submitted and correct destination.

The server validates item IDs, destination IDs, unique item usage and capacity
against the saved attempt snapshot. Answer keys are excluded from active
question responses. Publishing or editing a question does not change existing
attempts. Existing single-choice questions and classic import formats are
unchanged. Author drag-and-drop questions in the editor; spreadsheet/Word/PDF
import templates remain single-choice in this release.

## Checks

`pnpm --filter exam-platform-backend test` includes definition validation,
order-independent grading, distractors, partial/empty answers, admin editing,
publication, snapshots, hidden keys, ownership, resume, review and expiry.

`pnpm typecheck`, `pnpm lint`, and `pnpm build` verify the frontend integration.
Live browser interaction testing was not completed in this environment because
the isolated frontend test-server launch was blocked.
