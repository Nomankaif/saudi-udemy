import test from "node:test";
import assert from "node:assert/strict";
import { CCNA_PDF_LABS } from "../simulation/ccna-pdf-labs.js";
import { validateLab, publicLab } from "../services/lab.service.js";
import { simulate } from "../services/netsim.service.js";

const solution = lab => lab.tasks.flatMap(t => t.hint.split("\n").filter(Boolean).map(command => ({ device: t.device, command })));
const commands = (device, text) => text.split("\n").map(command => ({ device, command }));
const getLab = n => validateLab(CCNA_PDF_LABS[n - 1].definition);
test("PDF collection contains every numbered item and no duplicated template IDs", () => {
  assert.deepEqual(CCNA_PDF_LABS.map(e => e.number), Array.from({ length: 27 }, (_, i) => i + 1));
  assert.equal(new Set(CCNA_PDF_LABS.map(e => e.templateId)).size, 27);
});
for (const entry of CCNA_PDF_LABS) test(`CCNA PDF item ${entry.number}: baseline, correct solution, incorrect answer, hidden answer data`, { timeout: 30000 }, async () => {
  const lab = validateLab(entry.definition);
  assert.equal(lab.category, "Cisco"); assert.equal(lab.subcategory, "CCNA");
  const initial = await simulate(lab, {}, "grade");
  assert.ok(initial.score < 100, "Lab must require student work");
  const report = await simulate(lab, {}, "validate");
  assert.deepEqual(report.errors, []); assert.equal(report.valid, true, JSON.stringify(report.tasks.filter(t => !t.passed)));
  const publicDefinition = publicLab(lab);
  assert.equal(publicDefinition.authorNotes, undefined);
  assert.ok(publicDefinition.tasks.every(t => !t.rules && !t.hint));
  assert.ok(publicDefinition.devices.every(d => !d.initialConfig));
  // Omit a substantive configuration task, while still saving configurations.
  // A router may legitimately auto-select its loopback ID without an explicit
  // router-id command. Remove a network task in those exercises instead.
  const first = [15, 25].includes(entry.number) ? lab.tasks[1] : lab.tasks.find(t => t.rules.some(r => !["saved", "interface_up"].includes(r.type)));
  const journal = solution({ tasks: lab.tasks.filter(t => t !== first) });
  const wrong = await simulate(lab, { journal }, "grade");
  assert.equal(wrong.tasks.find(t => t.id === first.id).passed, false, "Missing requested configuration must fail, even if saved");
});

test("CCNA semantic checks reject wrong VLAN names, extra allowed VLANs, passive/passive, IPv6 masks, discovery and OSPF settings", { timeout: 30000 }, async () => {
  const cases = [
    [3, "SW1", "configure terminal\nvlan 77\nname it_user_vlan\nend", "vlan_name"],
    [7, "SW1", "configure terminal\ninterface e0/0\nswitchport trunk allowed vlan add 99\nend", "allowed_vlans"],
    [19, "SW1", "configure terminal\ninterface range e0/0-1\nchannel-group 10 mode passive\nend", "channel_group"],
    [14, "R2", "configure terminal\ninterface e0/0\nipv6 address 2001:db8:12::1f/122\nend", "interface_ipv6"],
    [4, "R1", "configure terminal\ninterface e0/1\nipv6 address 2001:db8:12::d/125\nend", "interface_ipv6"],
    [12, "SW2", "configure terminal\ninterface e0/0\nno lldp transmit\nend", "lldp_neighbor"],
    [16, "R1", "configure terminal\ninterface e0/0\nip ospf priority 0\nend", "ospf_dr"],
    [16, "R1", "configure terminal\ninterface e0/0\nip ospf 30 area 1\nend", "ospf_interface"],
    [25, "R2", "configure terminal\nrouter ospf 10\nrouter-id 10.1.1.1\nend", "ospf_router_id"],
    [24, "SQL", "configure terminal\nip route 10.10.44.2 255.255.255.255 10.10.10.2 1\nend", "static_route"],
  ];
  for (const [number, device, text, type] of cases) {
    const lab = getLab(number), journal = [...solution(lab), ...commands(device, text)];
    const report = await simulate(lab, { journal }, "grade");
    const targets = lab.tasks.filter(t => t.rules.some(r => r.type === type));
    assert.ok(targets.some(t => !report.tasks.find(result => result.id === t.id).passed), `${number}: ${type} must fail`);
  }
  const lab = getLab(14), journal = solution(lab).map(e => ({ ...e, command: e.command.replace("2001:db8:12::3f/122", "2001:0db8:0012:0000:0000:0000:0000:003f/122") }));
  assert.equal((await simulate(lab, { journal }, "grade")).score, 100, "Equivalent IPv6 spelling must pass");
});

test("CCNA definitions validate new checks and retain route distance and private author notes", () => {
  for (const [type, value] of [["allowed_vlans", "0,5000"], ["vlan_name", "4095|Bad"], ["channel_group", "9999 active"], ["lldp_transmit", "maybe"], ["interface_ipv6", "2001:db8::1/129"]]) {
    const lab = structuredClone(CCNA_PDF_LABS[6].definition);
    lab.tasks[0].rules = [{ type, value, interface: portName() }];
    assert.throws(() => validateLab(lab), { statusCode: 400 });
  }
  assert.equal(getLab(24).tasks[2].rules[0].distance, 10);
  assert.match(getLab(14).authorNotes, /::3f/);
});
function portName() { return "Ethernet0/0"; }

test("CCNA packet behavior: allowed VLANs, failed negotiation and floating-route failover", { timeout: 30000 }, async () => {
  const lab = getLab(7), journal = solution(lab);
  const ping = async (definition, entries, device, destination) => (await simulate(definition, { journal: entries }, "command", { device, command: `ping ${destination}` })).output;
  assert.match(await ping(lab, journal, "PC1", "10.2.2.20"), /100 percent/);
  const restricted = [...journal, ...commands("SW1", "configure terminal\ninterface range e0/0-1\nswitchport trunk allowed vlan 30\nend"), ...commands("SW2", "configure terminal\ninterface range e0/0-1\nswitchport trunk allowed vlan 30\nend")];
  assert.match(await ping(lab, restricted, "PC1", "10.2.2.20"), /0 percent/);
  assert.match(await ping(lab, restricted, "PC3", "10.3.3.20"), /100 percent/);
  const passive = [...journal, ...["SW1", "SW2"].flatMap(name => commands(name, "configure terminal\ninterface range e0/0-1\nchannel-group 10 mode passive\nend"))];
  assert.match(await ping(lab, passive, "PC1", "10.2.2.20"), /0 percent/);
  const floating = getLab(24), solved = solution(floating);
  const show = async entries => (await simulate(floating, { journal: entries }, "command", { device: "SQL", command: "show ip route" })).output;
  assert.match(await show(solved), /10\.10\.44\.2\/32 \[1\/0\] via 10\.10\.54\.2/);
  assert.doesNotMatch(await show(solved), /10\.10\.44\.2\/32 \[10\/0\]/);
  assert.match(await ping(floating, solved, "SQL", "10.10.44.2"), /100 percent/);
  const down = [...solved, ...commands("SQL", "configure terminal\ninterface e0/1\nshutdown\nend")];
  assert.match(await show(down), /10\.10\.44\.2\/32 \[10\/0\] via 10\.10\.10\.2/);
  assert.match(await ping(floating, down, "SQL", "10.10.44.2"), /100 percent/);
  const bothDown = [...down, ...commands("SQL", "configure terminal\ninterface e0/2\nshutdown\nend")];
  assert.doesNotMatch(await show(bothDown), /10\.10\.44\.2\/32/);
});
