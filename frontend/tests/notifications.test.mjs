import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(new URL("../package.json", import.meta.url));
const jsx = require("react/jsx-runtime");
const source = readFileSync(new URL("../components/home-notifications.tsx", import.meta.url), "utf8");

function harness(storage = new Map()) {
  const states = []; let cursor = 0; let timer; let effectsEnabled = true;
  const react = {
    useState(initial) { const slot = cursor++; if (!(slot in states)) states[slot] = initial; return [states[slot], value => { states[slot] = value; }]; },
    useEffect(effect) { if (effectsEnabled) effect(); },
    useRef() { return { current: null }; },
  };
  const modules = { "react/jsx-runtime": jsx, react, "next/image": "img", "next/link": "a", "lucide-react": { ArrowRight: "svg", X: "svg" } };
  const context = {
    exports: {},
    require: name => { assert.ok(name in modules, name); return modules[name]; },
    window: { setTimeout(callback, delay) { timer = { callback, delay }; return 1; }, clearTimeout() {} },
    sessionStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); } },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return { exports: context.exports, render(notifications) { cursor = 0; return context.exports.HomeNotifications({ notifications }); }, get timer() { return timer; }, disableEffects() { effectsEnabled = false; }, storage };
}

test("landing notification opens after 1.5 seconds and closes for the session", () => {
  const notification = { _id: "notice-1", title: "New exam", type: "HERO", dismissible: true };
  const h = harness();
  assert.equal(h.render([notification]), null);
  assert.equal(h.timer.delay, 1500);
  h.timer.callback();
  const dialog = h.render([notification]);
  assert.equal(dialog.props.notification._id, "notice-1");
  dialog.props.onClose();
  assert.equal(h.render([notification]), null);
  assert.deepEqual(JSON.parse(h.storage.get("certify-dismissed-notifications")), ["notice-1"]);

  const nextVisit = harness(h.storage);
  nextVisit.render([notification]);
  nextVisit.timer.callback();
  assert.equal(nextVisit.render([notification]), null);
});

test("visitor notification has a close button for both text and image content", () => {
  const h = harness();
  h.disableEffects();
  for (const image of [undefined, "/uploads/media/cover-example.png"]) {
    const element = h.exports.NotificationDialog({ notification: { _id: "1", title: "Update", desktopImage: image }, onClose() {} });
    const children = element.props.children.props.children;
    const content = Array.isArray(children) ? children : [children];
    assert.ok(content.some(node => node?.type === "button" && node.props["aria-label"] === "Close notification"));
    assert.equal(content.some(node => node?.props?.className === "portal-notification-image"), Boolean(image));
  }
});
