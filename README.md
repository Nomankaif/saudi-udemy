# Certify Exam Platform

English-first exam marketplace and administration system. The interface is intentionally simple and marketplace-oriented, with Arabic/RTL support planned as the next localization phase.

## Structure

- `frontend/` — Next.js frontend, student portal, and `/admin` console (TypeScript + Tailwind CSS)
- `backend/` — Express/Mongoose REST backend in JavaScript using MVC folders
- `storage/` — local media and import files when `STORAGE_BACKEND=local`; production can store both in MongoDB GridFS

The initial release intentionally excludes payments, Redis, BullMQ, AWS/S3, and Swagger/OpenAPI.

## Run locally

1. Copy `.env.example` to `.env` and replace both JWT secrets.
2. Set `MONGODB_URI` to your MongoDB connection string. For Atlas, set `STORAGE_BACKEND=mongo` so uploaded images and lab/drag-and-drop source files are stored in GridFS.
3. Run `pnpm install`.
4. Run `pnpm dev` to start the frontend on port 3000 and backend on port 4000.

Individual services can be started with `pnpm dev:frontend` and `pnpm dev:backend`.

For an existing installation, run `backend/src/scripts/migrate-to-atlas.js` with `SOURCE_MONGODB_URI` set to the current local database and `ATLAS_MIGRATION_URI` set to an empty Atlas database. The script copies all collections, media, and saved lab/import source files, preserves record IDs, and verifies counts and file checksums. It does not modify the source. After it succeeds, set `MONGODB_URI` to Atlas and `STORAGE_BACKEND=mongo` in the backend environment. A deployed frontend also needs `API_INTERNAL_URL` pointing to the deployed backend, and the backend needs `WEB_ORIGIN` set to the frontend origin.

### Backend request logs

The backend terminal prints JSON logs for every incoming HTTP request (including API calls, CORS preflight and uploads). Each request produces `http.request.received` immediately and `http.request.completed` with its HTTP status and duration in milliseconds. Interrupted connections produce `http.request.aborted` instead. The shared `requestId` is also returned as the `X-Request-Id` response header. Statuses 4xx/5xx are marked `warn`/`error`. Query strings, request/response bodies, headers and cookies are deliberately excluded to avoid exposing credentials or exam answers. Logging is enabled in development and production; no additional configuration is needed. Only requests that reach the Express backend can appear here.

## Admin access

Set `ADMIN_PASSWORD` to a unique password of at least 12 characters in `backend/.env` (or the root `.env`). Backend-specific settings take precedence. Restart the backend after changing it. No default admin password is provided; admin login stays disabled until it is configured.

Visit `/admin` to sign in. The server verifies the password, creates the administrator account on first successful login, and sets an HTTP-only session cookie valid for two hours. Changing `ADMIN_PASSWORD` invalidates existing admin sessions. Use Sign out to end a session. MongoDB must be running for login.

If the frontend and backend run on different hosts, set the frontend's server-only `API_INTERNAL_URL` to the backend API address. The password must never use a `NEXT_PUBLIC_` environment variable.

## Current access flow

Visitors can browse published exams. They register or log in before taking questions. Administrators mark individual questions free or premium; premium content stays locked until a learner submits an access request and an administrator approves it with a validity period. Payment integration can extend this flow later.

## Create and publish exams

1. Open `/admin/exams`, create an exam, and configure its timed-attempt size, duration, passing percentage, and access validity.
2. Use the question editor for two to eight answer options, a correct answer, and its explanation. Incomplete drafts can be saved; publishing requires valid questions.
3. Alternatively, open Import questions and choose the **PDF & documents** or **JSON file** tab. The first accepts `.xlsx`, `.csv`, `.docx`, and text-based `.pdf`; the second accepts a `.json` array or an object containing a `questions` array. Download the corresponding template to see the expected fields. Both tabs use the same preview: extracted question and answer-line counts, missing keys and explanations, duplicates, inconsistent source numbering, and prompts that may require an image/interaction or disagree with the answer key. For PDFs, each preview row links to its source page. Review and correct flagged rows, then import selected rows as drafts. New questions default to Free unless explicitly marked Premium. Scanned PDFs require OCR and are not supported in this release. Embedded document images and performance-based simulations are not imported; create those separately in the editor.
4. Mark questions free or premium, preview them, and publish. Draft edits do not change the published version until republished, and existing attempts retain their question snapshots.
5. Review premium requests under `/admin/access-requests`; approve with an expiry date, reject, or revoke access.

Word/text-PDF questions should use numbered headings such as `Question 1`, `Question 1:`, or `QUESTION NO: 1`, consecutively labeled options (`A.` through at most `H.`), and an answer line such as `Answer: A`, `ANSWER; B.`, or `Correct Answer: A,C`. `Explanation: ...`, `Access: PREMIUM`, `Topic: ...`, and `Difficulty: MEDIUM` are optional import fields; access defaults to Free. Missing explanations can be saved to a draft, but must be added before publishing. The importer does not invent missing answer keys, explanations, or diagram interactions. Irregular documents may need correction in the preview. Upload limits are 15 MB and 1,000 questions per import.

JSON questions use `text`, an `options` array of strings or `{ "id": "A", "text": "..." }` objects, and `correctOptionIds` such as `["A"]` or `["A", "C"]`. `type` may be `SINGLE_CHOICE` or `MULTIPLE_CHOICE` (inferred from answer count if omitted). `explanation`, `accessLevel`, `topic`, `difficulty`, `sourceNumber`, and `sourcePage` are optional. The JSON preview flags unsupported question types and malformed options; JSON does not independently prove the source answer key is correct.

## Simulator

### Drag and Drop question banks

Open `/admin/drag-drop` and create a bank with a title, category, cover image, and descriptions. Its workspace has **Questions**, **Import**, and **Settings** tabs. Add questions in the sidebar or import them into that bank using **PDF extraction** or **JSON file**. The JSON tab provides a downloadable template containing draggable items, destination groups, capacities, and correct placements. Valid JSON rows can be selected for draft import; malformed rows remain in the correction preview. Exhibit images can be uploaded separately in the question editor. Publish checks the complete bank and creates the student-facing question snapshot. Existing single-question Drag and Drop records open in the same workspace, with their question retained as the first bank item.

The PDF tab accepts scanned PDFs up to 50 MB and 300 pages. Local Tesseract OCR extracts numbered items, prompts, colored draggable boxes, and answer views in the background. The private source pages appear alongside each candidate for review. OCR cannot reliably infer every answer from a screenshot or watermark, so PDF candidates must be checked and saved before they can be imported. The review screen filters Ready, Doubtful, and Needs correction rows, and lets admins select the drafts to import. An optional exhibit crop can use a question page; detected answer pages are blocked from student images. No AI API key or network OCR service is required at runtime.

### Single- and multiple-answer MCQs

In the question editor, choose **Single choice** for one correct option or **Multiple answers** for two to four. Check every correct option and add an explanation. Switching between these two types preserves option text and the answer key; switching back to single choice requires choosing one answer before publishing. Student preview uses the same radio buttons / checkboxes as the exam runner.

Multiple-answer MCQs receive the full mark only when the selected set matches the answer key exactly, in any order. Missing or extra choices receive no credit; selecting nothing is unanswered. Students can deselect checkboxes, autosave and resume all their selections, and review every correct option after submission. Practice can reveal answers; timed mode keeps them private until submission. Existing single-choice questions and historical attempt snapshots are unchanged.

Import files support `A,C` in the `correct_answer` cell (quote this cell in CSV), or `Answers: A, C` in labeled Word/text-PDF question blocks. Optional `option_e` through `option_h` spreadsheet columns are supported. Multiple IDs automatically select the multiple-answer type. Duplicate or invalid answer IDs are reported for correction.

### Image-based performance questions (PBQs)

In the exam question editor, choose **Image-based PBQ**, upload a diagram, and add clickable areas over its devices. Admin numbers and dashed boxes are editor-only. Keep **Student marker → None** to make the device itself clickable, or select **Question mark (?)** for a labeling hotspot. If the image already contains a question mark, no extra marker is needed.

For a single label answer choose **Short text answer**. For several settings on one device choose **Configuration form (multiple fields)**. Add labeled fields, select text / multiline text area / dropdown / single choice / multiple selections / drag-and-place, and configure each field's private answer key and points. Optional tabs such as “Phase 1” and “Phase 2” group fields; use **Show in tab** to assign them. Forms support up to 20 fields and 8 tabs per element, with 40 elements and 200 answer fields per question. Each tab needs at least one field before publishing.

Text answers use exact accepted alternatives (up to 500 characters each), with configurable case sensitivity and trimmed leading/trailing whitespace. For multiline fields, enter each complete accepted response in its own box; internal line breaks matter. No AI grading or API key is used. Dropdown answers match option IDs, and multiple selections must match the full expected set. Partial credit is awarded independently per field.

Students click the device or marker to open its controls. Exam-runner answers autosave, stay intact across tabs and devices, and resume from the server. **Reset this element** clears only that element, including all its tabs. Existing single-answer PBQs remain supported. Save and republish after editing; previously started attempts keep their original definitions and private keys.

Practice supports explanation reveal, topic selection, and no timer. Timed attempts hide answers until submission and use a server-enforced deadline. Answers autosave; learners can resume through their dashboard. Results include correct, incorrect, skipped, topic performance, and paginated explanations. Question content loads in batches rather than downloading the entire bank or answer key.

Run one backend process for this release: attempt-write locks are in-process. A database-backed sweep finalizes expired attempts after disconnects and server restarts; Redis and job queues remain deferred.

## Verification

Run `pnpm --filter exam-platform-backend test` with local MongoDB running. Exam-flow tests create and drop their own uniquely named test database, including a 900-question access and pagination scenario. Run `pnpm lint` and `pnpm build` for frontend checks.

## Backend MVC

Routes live in `backend/src/routes`, request handlers in `backend/src/controllers`, database schemas in `backend/src/models`, reusable business rules in `backend/src/services`, and authorization/error handling in `backend/src/middleware`.

## Networking labs

Lab import follows the same three-step layout as Create lab: enter details, upload a PDF or JSON file, then review tasks and grading. A single imported lab uses the entered title. For a multi-lab file, that title prefixes each numbered source title; cover image, access, duration, linked exam, and shared instructions apply to each draft.

Open `/admin/labs` → **Import PDF or JSON** for the lab import workflow. Download the version 2 JSON template. For each complete source exercise, give the lab a unique `sourceId`, devices, links, tasks with executable reference solutions in `hint`, and an `importReview` declaration. The simulator executes the reference commands and compares each task's configuration changes with the student's final configuration. Optional `rules` check outcomes that configuration alone cannot prove, such as connectivity, OSPF neighbors, EtherChannel negotiation, or saved state. A reference solution that makes no configuration change needs an outcome rule. List required capabilities using IDs from `_guide.capabilityCatalog`; put uncertain facts in `assumptions` and new or unsupported behavior in `unresolvedRequirements`. Set `sourceInventory.totalExercises` to the number of source exercises and list exercises you could not model in `sourceInventory.excluded`, each with an ID and reason. The importer checks that the inventory accounts for every exercise, validates the simulator definition, checks that an untouched attempt does not pass, and runs the reference solution. It reports supported and excluded exercises with reasons; the report can be downloaded as JSON. Correct excluded rows or the source file, compare supported rows with the original source, and import selected reviewed labs as drafts. JSON files support up to 100 modeled labs and default to Free access. The `_guide` object is documentation and is ignored by the importer. The included `CCNA-LABS 18-8` PDF maps to 27 prepared simulator definitions that still require source review and capability declarations. Other PDFs use local text extraction and OCR; they produce review rows rather than invented device configurations. Imported drafts must be published in the lab studio. Simulator verification requires the configured Python lab engine; when it is unavailable, labs remain excluded.

Open `/admin/labs` and choose **Import CCNA templates** to import the 27 upstream labs as drafts. Importing again does not overwrite existing templates. Review device addressing, instructions, reference solutions and command checks before publication. Save and preview opens a private administrator-owned practice attempt. Save and publish creates the version used by new student sessions; existing attempts retain their snapshot. Unpublishing/archiving removes catalogue visibility without deleting attempts.

Students browse `/labs`, sign in, and choose practice or a timed assessment (1–1440 minutes). The console supports the upstream command parser, Tab completion and `?` help. Commands and grading execute on the backend, with MongoDB persistence, ownership checks and optimistic concurrency. Practice supports checks, solution reveal and reset; exam mode reveals results only after submission or deadline expiry. A deadline is enforced on every session request; disconnected lab sessions are finalized when next opened. Lab history is under `/labs/history` and the profile menu.

Premium labs must be linked to a published exam and inherit its administrator-approved access window. There is no payment, AWS, Redis, virtual-machine or AI-provider dependency. Public catalogue responses do not include task content, answers or configurations.

The engine and SVG topology renderer are adapted from Z-eq/lab-ccna at revision `c118060c0ac4fb5ecc805787fad1be17bc9d81a6`, included based on the project owner's confirmation of permission. See `backend/src/vendor/lab-ccna/NOTICE.md`. Upstream copyright is retained. The hard-coded browser admin gate, browser-only grading/storage and optional AI generator are not used.

Limitations: this is guided configuration simulation, not full Cisco IOS or actual network emulation. Ping/routing outputs and inferred topology are approximate. Upstream task checks are command-pattern based; token-boundary matching prevents partial-IP matches but does not prove end-to-end connectivity or every equivalent valid configuration. Imported multi-device tasks should be split into separately checked tasks. Grading uses equal-weight task completion. Commands are single-line, device state is bounded, and the console retains the latest 200 transcript entries. Automated tests cover the integration and representative commands, not every command in all 27 labs.
