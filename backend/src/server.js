import "./config/env.js";
import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { finalizeExpired } from "./services/attempt.service.js";
import { finalizeExpiredLabs } from "./controllers/lab.controller.js";
import { resumeDragDropImports } from "./services/drag-drop-import.service.js";
import { syncExistingDragDropExams } from "./services/drag-drop-exam.service.js";
import { resumeLabImports } from "./services/lab-import.service.js";

const port = Number(process.env.PORT) || 4000;

try {
  await connectDatabase();
  await syncExistingDragDropExams();
  await resumeDragDropImports();
  await resumeLabImports();
  let sweeping = false;
  const sweep = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await finalizeExpired();
      await finalizeExpiredLabs();
    } catch (error) {
      console.error("Attempt finalization failed", error.message);
    } finally {
      sweeping = false;
    }
  };
  void sweep();
  setInterval(sweep, 15000).unref();
  app.listen(port, () =>
    console.log(`API listening on http://localhost:${port}`),
  );
} catch (error) {
  console.error("Unable to start API", error);
  process.exit(1);
}
