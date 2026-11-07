import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(new URL("../package.json", import.meta.url));
const jsx = require("react/jsx-runtime");
const source = readFileSync(new URL("../components/home-final-cta.tsx", import.meta.url), "utf8");

function harness(initialStatus) {
  let status = initialStatus;
  let state = "checking";
  let effectStarted = false;
  const listeners = new Map();
  const react = {
    useState: () => [state, value => { state = value; }],
    useEffect(effect) { if (!effectStarted) { effectStarted = true; effect(); } },
  };
  const modules = { "react/jsx-runtime": jsx, react, "next/link": "a", "lucide-react": { ArrowRight: "svg" } };
  const context = {
    exports: {},
    require: name => { assert.ok(name in modules, name); return modules[name]; },
    fetch: async () => ({ ok: status === 200, status }),
    window: { addEventListener(name, listener) { listeners.set(name, listener); }, removeEventListener(name) { listeners.delete(name); } },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const render = () => {
    const section = context.exports.HomeFinalCta();
    const [copy, link] = section.props.children;
    return { heading: copy.props.children[1].props.children, href: link.props.href, label: link.props.children[0] };
  };
  return { render, changeStatus(value) { status = value; return listeners.get("auth-changed")?.(); } };
}

test("signed-in visitors get the exam action and guests get registration", async () => {
  const signedIn = harness(200);
  assert.equal(signedIn.render().href, "/exams");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signedIn.render().label, "Take your exam");
  assert.equal(signedIn.render().href, "/exams");

  const guest = harness(401);
  guest.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(guest.render().href, "/register");

  signedIn.changeStatus(401);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signedIn.render().href, "/register");
});
