import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import app from "../app.js";
import { createRequestLogger } from "../middleware/request-logger.middleware.js";

function responseStub() {
  const response = new EventEmitter();
  response.statusCode = 200;
  response.writableFinished = false;
  response.headers = {};
  response.setHeader = (key, value) => {response.headers[key] = value;};
  return response;
}

test("request logging is immediate, correlates completion, and does not duplicate finish/close", () => {
  const entries = [], request = {method: "GET", path: "/api/health"}, response = responseStub();
  let called = false;
  createRequestLogger(entry => entries.push(entry))(request, response, () => {called = true;});
  assert.equal(called, true);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event, "http.request.received");
  assert.equal(entries[0].requestId, request.requestId);
  assert.equal(response.headers["X-Request-Id"], request.requestId);
  assert.match(request.requestId, /^[a-f0-9-]{36}$/);
  response.writableFinished = true;
  response.emit("finish");
  response.emit("close");
  assert.equal(entries.length, 2);
  assert.equal(entries[1].event, "http.request.completed");
  assert.equal(entries[1].status, 200);
  assert.equal(entries[1].requestId, entries[0].requestId);
  assert.ok(Number.isFinite(entries[1].durationMs) && entries[1].durationMs >= 0);
});

test("aborted connections and HTTP failures are distinguished from successful completion", () => {
  for (const status of [200, 401, 404, 500]) {
    const entries = [], response = responseStub();
    createRequestLogger(entry => entries.push(entry))({method: "POST", path: "/api/test"}, response, () => {});
    response.statusCode = status;
    response.writableFinished = true;
    response.emit("finish");
    assert.equal(entries[1].status, status);
    assert.equal(entries[1].level, status >= 500 ? "error" : status >= 400 ? "warn" : "info");
  }
  const entries = [], response = responseStub();
  createRequestLogger(entry => entries.push(entry))({method: "GET", path: "/api/slow"}, response, () => {});
  response.emit("close");
  response.emit("finish");
  assert.equal(entries.length, 2);
  assert.equal(entries[1].event, "http.request.aborted");
  assert.equal(entries[1].status, null); // Do not report a successful status for an unfinished response.
  assert.equal(entries[1].level, "warn");
});

test("real API logs health, preflight, auth rejection, malformed JSON and 404 without sensitive data", async t => {
  const lines = [];
  t.mock.method(console, "log", line => {lines.push(line);});
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => {server.close(resolve);server.closeAllConnections();}));
  const base = "http://127.0.0.1:" + server.address().port;
  const cases = [
    {method: "GET", path: "/api/health", status: 200},
    {method: "HEAD", path: "/api/health", status: 200},
    {method: "OPTIONS", path: "/api/auth/login", status: 204, headers: {Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST"}},
    {method: "GET", path: "/api/auth/me", status: 401},
    {method: "GET", path: "/api/not-a-route?token=private-query-token", status: 404, headers: {Authorization: "Bearer private-header-token", Cookie: "private-cookie-value"}},
    {method: "POST", path: "/api/auth/login", status: 400, headers: {"Content-Type": "application/json"}, body: '{"password":"private-password",'},
  ];
  for (const c of cases) {
    const response = await fetch(base + c.path, {method: c.method, headers: c.headers, body: c.body});
    await response.text();
    assert.equal(response.status, c.status);
    const requestId = response.headers.get("X-Request-Id");
    const entries = lines.map(line => JSON.parse(line)).filter(entry => entry.requestId === requestId);
    assert.equal(entries.length, 2, c.method + " " + c.path);
    assert.equal(entries[0].event, "http.request.received");
    assert.equal(entries[1].event, "http.request.completed");
    assert.equal(entries[1].method, c.method);
    assert.equal(entries[1].path, c.path.split("?")[0]);
    assert.equal(entries[1].status, c.status);
    assert.ok(entries[1].durationMs >= 0);
  }
  assert.equal(new Set(lines.map(line => JSON.parse(line).requestId)).size, cases.length);
  for (const secret of ["private-query-token", "private-header-token", "private-cookie-value", "private-password"])
    assert.ok(!lines.join("\n").includes(secret), secret + " must not be logged");
});
