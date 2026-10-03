import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import path from "node:path";
import ts from "typescript";
import { renderTopologySVG } from "../../backend/src/vendor/lab-ccna/topoRenderer.js";
import { CCNA_PDF_LABS } from "../../backend/src/simulation/ccna-pdf-labs.js";

const require = createRequire(new URL("../package.json", import.meta.url));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const jsx = require("react/jsx-runtime");
function load(file, imports = {}) {
  const source = readFileSync(new URL(`../components/labs/${file}.tsx`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const context = { exports: {}, require: name => { if (name === "react/jsx-runtime") return jsx; assert.ok(name in imports, name); return imports[name]; } };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const symbols = load("device-symbol");
const { NetworkTopology, deviceAnchor } = load("network-topology", { "./device-symbol": symbols });
const devices = [
  { name: "R1", type: "router", interfaces: {} },
  { name: "SW1", type: "switch", interfaces: {} },
  { name: "PC1", type: "host", interfaces: {} },
];
const links = [
  { fromDevice: "R1", fromInterface: "GigabitEthernet0/0", toDevice: "SW1", toInterface: "GigabitEthernet0/1" },
  { fromDevice: "SW1", fromInterface: "FastEthernet0/2", toDevice: "PC1", toInterface: "Ethernet0/0" },
];
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node?.props) return [];
  return [node, ...nodes(node.props.children)];
}

test("topology renders recognizable router, switch and PC artwork with names below", () => {
  const svg = renderToStaticMarkup(React.createElement(NetworkTopology, { devices, links, active: "SW1" }));
  for (const type of ["router", "switch", "pc"]) assert.ok(svg.includes(`data-device-symbol="${type}"`));
  for (const name of ["R1", "SW1", "PC1"]) assert.ok(svg.includes(`>${name}</text>`));
  assert.ok(svg.includes('stroke="#2563eb"'));
  assert.ok(!svg.includes("NaN"));
});

test("mouse and keyboard selection work, while preconfigured devices remain locked", () => {
  const selected = [];
  const tree = nodes(NetworkTopology({ devices: devices.map(d => ({ ...d, console: d.type !== "host" })), links, active: "R1", onSelect: name => selected.push(name) }));
  const router = tree.find(n => n.props["aria-label"] === "R1, Router, open console");
  assert.equal(router.props["aria-pressed"], true);
  assert.equal(router.props.tabIndex, 0);
  router.props.onClick();
  for (const key of ["Enter", " "]) {
    let prevented = false;
    router.props.onKeyDown({ key, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
  const pc = tree.find(n => n.props["aria-label"] === "PC1, PC, preconfigured");
  assert.equal(pc.props.role, "img");
  assert.equal(pc.props.tabIndex, undefined);
  pc.props.onClick();
  pc.props.onKeyDown({ key: "Enter" });
  assert.deepEqual(selected, ["R1", "R1", "R1"]);
});

test("cables stop at device edges; missing endpoints and single devices render safely", () => {
  for (const type of ["router", "switch", "host"]) {
    for (const to of [{ x: 300, y: 0 }, { x: 0, y: 300 }, { x: 100, y: 100 }]) {
      const anchor = deviceAnchor(type, { x: 0, y: 0 }, to);
      assert.ok(Number.isFinite(anchor.x) && Number.isFinite(anchor.y));
      assert.ok(Math.hypot(anchor.x, anchor.y) >= 17);
      assert.ok(Math.hypot(anchor.x, anchor.y) < 60);
    }
  }
  const tree = nodes(NetworkTopology({ devices: devices.slice(0, 1), links }));
  assert.ok(!tree.some(n => n.type === "line"));
  assert.ok(tree.some(n => n.props.transform === "translate(330,200)"));
});

test("classic diagrams keep device names escaped and include the new symbols", () => {
  const svg = renderTopologySVG({ devices: [{ name: "R1<script>", type: "router", interfaces: {} }, { name: "PC1", type: "pc", interfaces: {} }, devices[1]], topology: "" }, "light");
  assert.ok(svg.includes("R1&lt;script&gt;"));
  assert.ok(svg.includes('id="sym-router"'));
  assert.ok(svg.includes('id="sym-switch"'));
  assert.ok(svg.includes('id="sym-pc"'));
  assert.ok(!svg.includes("<script>"));
});

test("parallel EtherChannel links have distinct paths and visible port labels", () => {
  const lab = CCNA_PDF_LABS[6].definition;
  const tree = nodes(NetworkTopology({ devices: lab.devices, links: lab.links }));
  const paths = tree.filter(n => n.type === "path");
  assert.equal(paths.length, lab.links.length);
  assert.notEqual(paths[0].props.d, paths[1].props.d);
  assert.ok(tree.some(n => n.type === "text" && n.props.children === "Eth0/0"));
  assert.ok(tree.some(n => n.type === "text" && n.props.children === "Eth0/1"));
});

test("manual grading editor exposes the new CCNA checks and preserves administrative distance", () => {
  const { RuleEditor } = load("network-editor", { "./types": { field: "field", button: "button" }, "lucide-react": { Trash2: () => null } });
  const lab = CCNA_PDF_LABS[23].definition;
  const rule = lab.tasks[2].rules[0];
  const updates = [];
  const tree = nodes(RuleEditor({ device: lab.devices.find(d => d.name === "SQL"), rules: [rule], onChange: value => updates.push(value) }));
  const types = tree.filter(n => n.type === "option").map(n => n.props.value);
  for (const type of ["interface_ipv6", "voice_vlan", "channel_group", "ospf_dr", "lldp_neighbor", "vlan_name", "allowed_vlans"]) assert.ok(types.includes(type));
  const distance = tree.find(n => n.type === "input" && n.props.type === "number");
  assert.equal(distance.props.value, 10);
  distance.props.onChange({ target: { value: "20" } });
  assert.equal(updates[0][0].distance, 20);
  assert.equal(updates[0][0].nextHop, "10.10.10.2");
});

// Optional visual QA artifact generated from the actual component, not a mockup.
if (process.env.LAB_TOPOLOGY_PREVIEW_DIR) {
  const directory = path.resolve(process.env.LAB_TOPOLOGY_PREVIEW_DIR);
  mkdirSync(directory, { recursive: true });
  const sharp = createRequire(require.resolve("next/package.json"))("sharp");
  const svg = renderToStaticMarkup(React.createElement(NetworkTopology, { devices, links, active: "R1" })).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="990" height="660" ');
  await sharp(Buffer.from(svg)).flatten({ background: "white" }).png().toFile(path.join(directory, "devices.png"));
  const lab = CCNA_PDF_LABS[6].definition;
  const bundleSvg = renderToStaticMarkup(React.createElement(NetworkTopology, { devices: lab.devices, links: lab.links, active: "SW1" })).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="990" height="660" ');
  await sharp(Buffer.from(bundleSvg)).flatten({ background: "white" }).png().toFile(path.join(directory, "ccna-07.png"));
}
