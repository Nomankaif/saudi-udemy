import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(new URL("../package.json", import.meta.url));
const jsx = require("react/jsx-runtime");
function harness(file, globals = {}) {
  const states = []; let cursor = 0;
  const modules = { "react/jsx-runtime": jsx, "next/link": "a", "next/image": "img", "next/navigation": { useRouter: () => ({ push() {} }), usePathname: () => "/admin/exams" }, "lucide-react": new Proxy({}, { get: () => "svg" }), react: { useId: () => "filter-panel", useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; } } };
  const context = { exports: {}, URLSearchParams, ...globals, require: name => { assert.ok(name in modules, name); return modules[name]; } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  function render(name, props) { cursor = 0; const nodes = []; function visit(node) { if (Array.isArray(node)) return node.forEach(visit); if (!node?.props) return; nodes.push(node); visit(node.props.children); } visit(context.exports[name](props)); return nodes; }
  return { exports: context.exports, render };
}
const text = node => !node ? "" : Array.isArray(node) ? node.map(text).join("") : typeof node === "string" || typeof node === "number" ? String(node) : text(node.props?.children);

test("admin sidebar starts collapsed and can expand without losing navigation labels", () => {
  const h = harness("components/admin/shell.tsx");
  const render = () => h.render("Shell", { children: "Admin content" });
  let nodes = render();
  assert.match(nodes.find(node => node.type === "aside").props.className, /lg:w-20/);
  assert.ok(nodes.some(node => node.props.className?.includes("lg:pl-20")));
  const exams = nodes.find(node => node.props.href === "/admin/exams");
  assert.equal(exams.props["aria-label"], "Exams");
  assert.equal(exams.props["aria-current"], "page");
  nodes.find(node => node.props["aria-label"] === "Expand sidebar").props.onClick();
  nodes = render();
  assert.match(nodes.find(node => node.type === "aside").props.className, /lg:w-72/);
  assert.ok(nodes.some(node => node.props.className?.includes("lg:pl-72")));
  assert.ok(nodes.some(node => node.props["aria-label"] === "Collapse sidebar"));
});

test("homepage directory includes all 14 requested providers and preserves real category links", () => {
  const { providerCatalog } = harness("lib/certification-providers.ts").exports;
  const providers = providerCatalog(["CISCO", "CISCO", "COMPITIA ", "Palo Alto Networks"]);
  assert.equal(providers.length, 14);
  assert.equal(new Set(providers.map(p => p.name)).size, 14);
  assert.equal(providers.find(p => p.name === "Cisco").count, 2);
  assert.equal(new URLSearchParams(providers.find(p => p.name === "Cisco").href.split("?")[1]).get("category"), "CISCO");
  assert.equal(new URLSearchParams(providers.find(p => p.name === "CompTIA").href.split("?")[1]).get("category"), "COMPITIA ");
  assert.equal(providers.find(p => p.name === "Palo Alto").count, 1);
  assert.equal(providers.find(p => p.name === "Oracle").count, 0);
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/portal.css", import.meta.url), "utf8");
  assert.ok(home.indexOf('className="portal-hero"') < home.indexOf('id="certifications"'));
  assert.ok(home.indexOf('id="certifications"') < home.indexOf('className="portal-section portal-container portal-services"'));
  assert.match(home, /className="provider-card-logo"/);
  assert.match(home, /className="provider-card-name"/);
  assert.match(home, /className="provider-card-cta">View exams/);
  assert.match(styles, /\.provider-grid \{ display: grid; grid-template-columns: repeat\(7,minmax\(0,1fr\)\); gap: 12px/);
  assert.doesNotMatch(styles, /\.provider-card-top/);
});

test("homepage hero uses the course illustration and keeps the interactive preview below", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const artwork = readFileSync(new URL("../public/hero-learning.svg", import.meta.url), "utf8");
  assert.match(home, /className="portal-hero-visual"><Image src="\/hero-learning\.svg"/);
  assert.match(home, /className="portal-container portal-preview-section"/);
  assert.match(home, /<PracticePreview \/>/);
  assert.match(artwork, /<svg[^>]+viewBox="0 0 720 600"/);
  assert.match(artwork, /Networking fundamentals/);
  assert.match(artwork, /Cybersecurity essentials/);
  assert.match(artwork, /HANDS-ON LAB/);
});

test("homepage preparation cards use original vector scenes and real platform destinations", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/portal.css", import.meta.url), "utf8");
  assert.ok(home.indexOf('className="portal-hero"') < home.indexOf('className="portal-section portal-container portal-services"'));
  assert.ok(home.indexOf('className="portal-section portal-container portal-services"') < home.indexOf("<HomeStats stats="));
  assert.match(home, /className="portal-section portal-container portal-services"><div className="portal-section-heading"><div><p className="portal-eyebrow">WHAT WE OFFER<\/p><h2>Services<\/h2>/);
  const illustrations = harness("components/service-artwork.tsx");
  for (const kind of ["paths", "exams", "labs", "progress"]) {
    const nodes = illustrations.render("ServiceArtwork", { kind });
    assert.equal(nodes[0].type, "svg");
    assert.ok(nodes.filter(node => node.type === "path" || node.type === "rect").length > 5);
    assert.match(home, new RegExp(`kind: "${kind}"`));
  }
  for (const href of ["#certifications", "/exams", "/labs", "/dashboard"]) assert.match(home, new RegExp(`href: "${href}"`));
  assert.match(styles, /\.portal-services-grid \{ display: grid; grid-template-columns: repeat\(4/);
  assert.doesNotMatch(home, /Accredited diplomas|Intensive bootcamps|Training courses/);
});

test("homepage statistics follow Services, use published totals, and respect reduced motion", async () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const stats = readFileSync(new URL("../components/home-stats.tsx", import.meta.url), "utf8");
  assert.ok(home.indexOf("<HomeStats stats=") > home.indexOf('className="portal-section portal-container portal-services"'));
  assert.ok(home.indexOf("<HomeStats stats=") < home.indexOf('className="portal-container portal-preview-section"'));
  assert.doesNotMatch(home, /portal-value-strip/);
  assert.match(home, /exams\.reduce\(\(sum, exam\) => sum \+ exam\.questionCount, 0\)/);
  assert.match(home, /value: labCount/);
  assert.match(stats, /IntersectionObserver/);
  assert.match(stats, /prefers-reduced-motion: reduce/);
  assert.match(stats, /aria-hidden="true"/);
  const count = harness("lib/labs.ts", { process: { env: {} }, fetch: async () => ({ ok: true, json: async () => [{ _id: "one" }, { _id: "two" }] }) }).exports.publicLabCount;
  assert.equal(await count(), 2);
});

test("hands-on lab feature shares the hero blue background", () => {
  const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/portal.css", import.meta.url), "utf8");
  assert.match(globals, /--site-hero-background: linear-gradient\(112deg,var\(--site-blue-700\) 0%,var\(--site-blue-800\) 45%,var\(--site-blue-900\) 100%\)/);
  assert.match(styles, /\.portal-hero \{[^}]*background: var\(--site-hero-background\)/);
  assert.match(styles, /\.portal-lab-feature \{[^}]*background: var\(--site-hero-background\)/);
});

test("public site uses global blue and gold tokens with a white exam detail background", () => {
  const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/portal.css", import.meta.url), "utf8");
  assert.match(globals, /--site-blue-700: #0d537f/);
  assert.match(globals, /--site-blue-900: #0b3157/);
  assert.match(globals, /--site-gold-500: #f0c75e/);
  assert.match(styles, /--color-violet-600: var\(--site-blue-700\)/);
  assert.match(styles, /\.portal-service-art \{[^}]*background: var\(--site-blue-700\)/);
  assert.match(styles, /\.portal-final-cta \.portal-button \{[^}]*background: var\(--site-gold-500\)/);
  assert.match(styles, /\.portal-detail-hero \{[^}]*background: var\(--site-surface\)/);
  assert.doesNotMatch(styles, /#f7f8f5|--portal-blue|--portal-gold/);
  assert.doesNotMatch(styles, /#245fce|#194ca9/);
});

test("interactive preview checks correct and incorrect answers and clears stale feedback", () => {
  const h = harness("components/practice-preview.tsx");
  const render = () => h.render("PracticePreview");
  const check = () => render().find(n => n.type === "button" && text(n).includes("Check answer"));
  assert.equal(check().props.disabled, true);
  render().find(n => n.type === "input" && n.props.value === "Switch").props.onChange();
  assert.equal(check().props.disabled, false); check().props.onClick();
  assert.match(text(render().find(n => n.props.role === "status")), /Not quite/);
  render().find(n => n.type === "input" && n.props.value === "Router").props.onChange();
  assert.equal(render().some(n => n.props.role === "status"), false);
  check().props.onClick();
  assert.match(text(render().find(n => n.props.role === "status")), /That’s right/);
});

test("preview tabs support keyboard switching and link the lab preview to the real catalog", () => {
  const h = harness("components/practice-preview.tsx"); const render = () => h.render("PracticePreview"); let focused = "", prevented = false;
  render().find(n => n.props.role === "tablist").props.onKeyDown({ key: "ArrowRight", preventDefault() { prevented = true; }, currentTarget: { querySelector(selector) { return { focus() { focused = selector; } }; } } });
  assert.equal(prevented, true); assert.equal(focused, "#lab-preview-tab");
  assert.equal(render().find(n => n.props.id === "lab-preview-tab").props.tabIndex, 0);
  assert.ok(render().some(n => n.type === "a" && n.props.href === "/labs"));
  render().find(n => n.props.id === "question-preview-tab").props.onClick();
  assert.equal(render().find(n => n.props.id === "question-preview-tab").props["aria-selected"], true);
});

test("exam and lab cards share a layout and retain real destinations and actions", () => {
  const exam = harness("components/exam-card.tsx").render("ExamCard", { exam: { id: "1", slug: "ccna", title: "CCNA", category: "Cisco", questionCount: 1, freeQuestionCount: 1, durationMinutes: 30, rating: 0, reviewCount: 0 } });
  const labs = harness("components/labs/lab-card.tsx"); let opened;
  const lab = { _id: "2", title: "Routing", category: "Cisco", durationMinutes: 30, taskCount: 1, deviceCount: 2, access: "FREE" };
  const nodes = labs.render("LabCard", { lab, busy: false, onOpen: value => { opened = value; } });
  assert.equal(exam[0].props.className, nodes[0].props.className);
  assert.ok(exam.some(n => n.type === "a" && n.props.href === "/exams/ccna"));
  assert.ok(!text(exam).includes("0 reviews"));
  nodes.find(n => n.type === "button" && text(n).includes("Open lab")).props.onClick();
  assert.equal(opened, lab);
  assert.ok(labs.render("LabCard", { lab, busy: true, onOpen() {} }).filter(n => n.type === "button").every(n => n.props.disabled));
});

test("catalog headings expose accurate navigation and theme excludes admin routes", () => {
  for (const kind of ["exams", "labs"]) {
    const nodes = harness("components/catalog-heading.tsx").render("CatalogHeading", { kind });
    assert.equal(nodes.filter(n => n.props["aria-current"] === "page").length, 1);
    assert.equal(nodes.find(n => n.props["aria-current"] === "page").props.href, `/${kind}`);
  }
  const frame = readFileSync(new URL("../components/site-frame.tsx", import.meta.url), "utf8");
  assert.match(frame, /if \(pathname\.startsWith\("\/admin"\)\) return <Shell>/);
  const css = readFileSync(new URL("../app/portal.css", import.meta.url), "utf8");
  assert.match(css, /portal-catalog-layout > aside \{ position: static;/);
});

test("mobile filter disclosure retains its form and exposes expanded state", () => {
  const h = harness("components/catalog-filters.tsx");
  const render = () => h.render("CatalogFilters", { kind: "labs", children: jsx.jsx("form", { children: "Filters" }) });
  let button = render().find(n => n.type === "button");
  assert.equal(button.props["aria-expanded"], false);
  assert.ok(render().some(n => n.type === "form"));
  button.props.onClick();
  button = render().find(n => n.type === "button");
  assert.equal(button.props["aria-expanded"], true);
  assert.equal(button.props["aria-controls"], "filter-panel");
  assert.equal(render().find(n => n.props.id === "filter-panel").props["data-open"], true);
});

test("login shows password on demand, prevents duplicate requests and distinguishes errors", async () => {
  let release, requests = 0;
  const h = harness("components/auth-form.tsx", {
    FormData: class { *[Symbol.iterator]() { yield ["email", "learner@example.com"]; yield ["password", "test-only-password"]; } },
    fetch: async () => { requests++; await new Promise(resolve => { release = resolve; }); return { ok: false, json: async () => ({ message: "Invalid credentials" }) }; },
  });
  const render = () => h.render("AuthForm", { mode: "login" });
  render().find(n => n.props["aria-label"] === "Show password").props.onClick();
  assert.equal(render().find(n => n.props.name === "password").props.type, "text");
  const submission = render().find(n => n.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: {} });
  assert.equal(render().find(n => n.props.type === "submit").props.disabled, true);
  await render().find(n => n.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: {} });
  assert.equal(requests, 1);
  release(); await submission;
  assert.equal(render().find(n => n.props.type === "submit").props.disabled, false);
  assert.match(text(render().find(n => n.props.role === "alert")), /Invalid credentials/);
});
