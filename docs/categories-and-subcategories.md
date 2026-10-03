# Categories and subcategories

The admin Categories page manages a shared two-level directory for exams and labs.

1. Add a category, for example **Cisco**.
2. Select it as the parent and add a subcategory, for example **CCNA**.
3. In exam settings or the lab Details tab, select the category and its subcategory.
4. Save the exam or lab. Lab changes remain in the draft until published.

Changing a category clears the subcategory selection. Only children of the selected
category appear in the dropdown. When a category has subcategories, new records
must select one. Categories without children can still be used.

Existing records without subcategories remain editable without a migration.
Categories inferred from older exams and labs appear in the directory and can
receive new subcategories. Nothing is automatically recategorized. Existing lab
attempts retain the category and subcategory in their published snapshot.

Names are trimmed and duplicate checks are case-insensitive. A subcategory name
can appear under different parents, but only once within each parent.

## API

- `GET /api/categories/public`: public names and subcategories for navigation;
  includes the saved directory and categories from published content only.
- `GET /api/categories`: admin directory with `{ name, subcategories: [{ name }] }`.
- `POST /api/categories`: `{ name }` creates a category.
- `POST /api/categories/subcategories`: `{ category, name }` adds a child.
- `PATCH /api/categories`: `{ category, name }` renames a category.
- `PATCH /api/categories/subcategories`: `{ category, subcategory, name }` renames a child.
- `DELETE /api/categories`: `{ category }` removes an unused, empty category.
- `DELETE /api/categories/subcategories`: `{ category, subcategory }` removes an unused child.
- Exam and lab save payloads accept `category` and `subcategory`.

Existing admin permissions apply. Category changes and child assignments are
validated on the server as well as in the forms. Mutations require `exams.edit`.

## Editing and deleting

The directory starts with categories collapsed. Click a category name or its
chevron to show the subcategories below it; click again to collapse. Opening
another category closes the previous one. Edit and Delete remain separate
controls. The open row is kept in place during an edit or delete confirmation.

Use **Edit** beside a category or subcategory in the directory, then **Save
changes**. Renames update matching exam classifications and each matching lab
version (current metadata, draft, and published). Drafts using a different
classification are left alone. Historical attempt snapshots do not change.

**Delete** opens an inline confirmation, never deletes on the first click, and
does not remove exams or labs. Remove children before deleting a parent. If an
item is assigned to content, the server reports the number of exams and labs
using it; reassign them before trying again. Archived records and published lab
versions also count. Deleting an unused directory entry is permanent.

Failed edits preserve the entered name and display the server's explanation in
the editor. Cancel (or Escape) closes the editor without saving.

## Public navigation

The user navbar has a **Categories** dropdown built with shadcn's Base UI menu.
Choose **Exams** or **Labs**, then hover over a category with children to open
its side menu. Click or tap also opens the menu; keyboard navigation and Escape
are supported. Categories without children link directly to their catalogue.

Selecting a child opens a shareable catalogue URL with both `category` and
`subcategory` filters. The catalogue's subcategory selector follows the selected
parent; changing the parent clears the child. Saved categories without published
content remain visible, with an empty result message in the catalogue.

## Verification

Run `pnpm --filter exam-platform-backend test`, `pnpm typecheck`, `pnpm lint`,
`node --test frontend/tests/*.test.mjs`, and `pnpm build`.
Frontend category tests cover save, error/retry, and delete confirmation handlers.
The category integration test uses a uniquely named temporary
MongoDB database and removes that database after the test.
