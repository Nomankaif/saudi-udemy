# CCNA lab simulation integration

## Start here

1. Install Python 3.12+ alongside the existing Node backend. No pip packages,
   FastAPI service, AWS account or Cisco images are needed for this integration.
2. `python --version` (Windows) or `python3 --version` (Linux) must work for the
   account running the backend. If needed set `NETSIM_PYTHON` to the executable's
   absolute path in backend/.env. Restart the backend after changing it.
3. Start the existing application with `pnpm dev`.
4. Admin → Labs → **Add simulation templates** adds three **drafts**: VLANs and
   trunks, static routing, and single-area OSPF. Imports are idempotent. Existing
   labs, published content and student attempts are never overwritten.
5. Open a draft. Review Details, Devices & topology, and Tasks & grading.
   **Verify solutions** saves the draft and executes reference solutions on a
   private topology. **Save and preview** opens a practice attempt. Publish only
   after reviewing both the passing and failing configurations.

New labs default to `netsim-v1`. Classic labs retain their original engine.
There is deliberately no automatic conversion: inferred links and textual
checks in old labs are not equivalent to explicit cables and structured rules.

## Authoring

- Up to 12 routers, switches or PCs. PCs have one `eth0` interface, IPv4/prefix
  and an optional gateway. A device can remain in the network with its student
  console disabled (for example a preconfigured destination PC).
- Physical links select exact endpoints. Reusing a port, referring to missing
  ports, invalid IPv4 addresses and invalid grading rules are rejected.
- Optional initial commands are separate from reference solutions. Include
  mode commands (`enable`, `configure terminal`); preview and publish reject
  unsupported initial commands. Do not preconfigure the answer accidentally.
- Each task has points and one or more rules. All rules in a task must pass for
  its points. Separate tasks allow partial credit across objectives.
- Checks: VLAN existence, access VLAN, trunk mode, link up, IPv4/prefix, exact
  static route plus next hop, route presence, OSPF-learned route, PC reachability
  or isolation, current configuration saved, exact canonical configuration
  line (global or scoped to a specific interface).
- Saved-configuration checks compare the last `write memory` / `copy run start`
  snapshot to the current configuration. Later changes require another save.
- For inferred/indirect state, use typed rules rather than an exact line.
  Exact-line checks match the simulator's canonical running-config output.

## Student experience

Tasks, physical topology, addressing and instructions appear beside per-device
consoles. Type one command and press Enter. `?`, Tab and command history are
available. PCs support `ipconfig`, `ip ADDRESS/PREFIX GATEWAY`, `ipconfig /renew`,
`ping ADDRESS` and `traceroute ADDRESS`. Use PCs for packet tests.

Practice allows task checks, solutions and reset. Assessment fixes the timer to
the author-defined duration, hides checks/solutions until submission and forbids
reset. The server enforces ownership, access, deadline and finality. Switching
devices is allowed; submitting ends the entire lab attempt, not just one device.
Reference solutions, initial command scripts and grading rules are not included
in active student responses. Initial addressing remains visible as lab context.

## Architecture and deployment

The MIT-licensed NetSim Python engine is pinned at
`fb07a807f86f2daa64822b54239e3fcb53850693`; attribution is in
backend/src/vendor/netsim/NOTICE.md and LICENSE. Upstream engine files remain
unchanged; the platform adapter adds VLAN configuration mode, startup-config
tracking and topology-aware OSPF adjacency, plus VLAN existence enforcement.

Express authenticates each operation, loads an immutable published snapshot and
the attempt's MongoDB command journal, then starts a private Python worker. The
worker reconstructs and replays only that attempt. No shared upstream workspace,
user shell commands, pickle deserialization, external tutor or public simulation
API is used. A backend restart does not lose accepted commands. Responses are
persisted using the existing revision guard, so concurrent tabs cannot silently
overwrite each other.

Limits: four workers per Node process, 12-second operation timeout, bounded
request/output, 2,000 commands per attempt, 100 initial commands per device,
50 tasks and 10 checks per task. Each task's grading uses a clean replay so a
connectivity check cannot alter a later task's saved/configuration result.
Expired attempts finalize on access and in the periodic server sweep. Engine
failure retains the journal for retry; it does not assign an artificial zero.

This is a restart-safe baseline, not a high-concurrency benchmark. Replay cost
grows with command count and task count. Load-test the intended deployment;
increase infrastructure or introduce versioned durable worker snapshots before
large simultaneous exam sessions. Never silently swap the pinned engine for
active attempts. Python must be installed in the backend container/host; static
frontend hosting alone cannot run this engine.

## Honest capability boundary

This is independent CCNA-style practice software, not Cisco IOS, Packet Tracer,
an official Cisco examination or a full CCNA protocol emulator. The validated
starter scenarios cover VLAN/access ports/trunks, IPv4 static routes, basic
single-area OSPF, host ICMP reachability and save-config behaviour.

Known limitations:

- Ping/traceroute originate on PCs, not routers or switches.
- Trunks carry all configured VLANs; allowed-VLAN lists are explicitly rejected.
- Interface ranges, realistic OSPF timers/election/convergence and complex
  multi-area behaviour are not assessed. OSPF costs use a simplified hop model.
- Upstream contains ACL, DHCP, NAT, IPv6, STP and wireless code, but presence of
  code is not full validation. Wireless devices, standalone servers and arbitrary
  Packet Tracer file import are not exposed by this integration.
- This does not implement mixed quiz/lab exams, remote proctoring, lockdown or
  Cisco's proprietary scoring and navigation rules.
- Browser content can be inspected by students; answers stay on the backend,
  but the application is not a cheating-proof exam delivery system.

Before offering another topic to students, author representative positive and
negative cases, test simulator behaviour and use Verify solutions. Do not label
all upstream-advertised features as production-ready.

## Verification

`pnpm --filter exam-platform-backend test` exercises legacy regressions and the
new engine: complete sample solutions, wrong-interface grading, missing return
routes, VLAN isolation, OSPF area mismatch/disconnected networks, dirty startup
config, restart replay, isolation, API ownership, hidden keys, locked consoles,
author-controlled timer, expiry and idempotent template imports.

Frontend: `pnpm typecheck`, `pnpm lint`, `pnpm build`.
