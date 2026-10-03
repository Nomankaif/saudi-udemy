import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

// Deliberately omit query strings, bodies, headers and cookies. These may contain
// credentials, private exam answers or other user data.
export function createRequestLogger(write = entry => console.log(JSON.stringify(entry))) {
  return function requestLogger(request, response, next) {
    const started = performance.now();
    const requestId = randomUUID();
    const context = { requestId, method: request.method, path: request.path };
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);

    let completed = false;
    function finish(aborted) {
      if (completed) return;
      completed = true;
      const status = aborted ? null : response.statusCode;
      write({
        timestamp: new Date().toISOString(),
        level: aborted ? "warn" : status >= 500 ? "error" : status >= 400 ? "warn" : "info",
        event: aborted ? "http.request.aborted" : "http.request.completed",
        ...context,
        status,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
      });
    }
    // Register before CORS, body parsing and routes so early responses and errors
    // are included. Normal responses emit both finish and close; log only once.
    response.once("finish", () => finish(false));
    response.once("close", () => finish(!response.writableFinished));
    write({ timestamp: new Date().toISOString(), level: "info", event: "http.request.received", ...context });
    next();
  };
}
