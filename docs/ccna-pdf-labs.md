# CCNA lab collection: manual authoring and review

Source: `CCNA-LABS 18-8.pdf`, 64 pages, 27 numbered items. Every numbered item is retained, including repeated exercises. The source was read visually, not imported. No AI API, OCR pipeline, PDF upload or extracted diagram feature is included.

## Review in the application

Open **Admin → Labs**, search **CCNA**, and open any numbered draft. All drafts belong to **Cisco → CCNA**. Review **Author review notes**, **Devices & topology**, and **Tasks & grading**. Use **Verify solutions**, then **Save and preview**. Publishing remains an explicit administrator action. Existing labs and student attempts are not replaced.

Each lab has explicit wired connections, initial device configurations, student tasks, reference commands, server-side state checks, and a final save requirement. Fixed peer routers and PCs are locked where they are not student tasks. Author notes, initial commands, grading rules and solutions are excluded from active student assessment responses.

## Item coverage

| Item | PDF pages | Manually authored exercise |
|---|---|---|
| 01 | 1–4 | Allowed/native VLANs; SW-3/SW-4 LACP 34, active/passive |
| 02 | 5–6 | R2 OSPF 30, router ID, exact networks, neighbors, DR preference |
| 03 | 7–9 | IT/HR data and voice VLAN assignments; LLDP |
| 04 | 10–11 | IPv4 /29 and IPv6 /126 on E0/1 |
| 05 | 12–13 | IPv4 /28 and IPv6 /125 |
| 06 | 14–15 | OPS 15 / ENGINEERING 66 access ports and LLDP |
| 07 | 16–17 | Restricted trunks; active/active LACP 10; four PCs |
| 08 | 18–19 | Four-switch trunks, VLAN restrictions, LACP 12 |
| 09 | 20–21 | SALES 35 / MARKETING 39; disable LLDP toward PC1 |
| 10 | 22–23 | IPv4 /29 and IPv6 /126 on E0/1 |
| 11 | 24–26 | Engineering data, voice VLAN 11, LLDP, CDP suppression |
| 12 | 27–28 | Data 77 / voice 177 on E0/1–3; LLDP |
| 13 | 29–30 | IPv4 /30 and IPv6 /126 |
| 14 | 31–32 | IPv4 /27 and IPv6 /122 |
| 15 | 33–35 | R2 OSPF 122 and DR preference |
| 16 | 36–38 | R1 interface-level OSPF 30 and DR preference |
| 17 | 39–40 | Native 99, allowed 99/110, LACP 20 |
| 18 | 41–42 | Engineering 100 / voice 102; LLDP and CDP controls |
| 19 | 43–44 | Allowed 10/11/30; active/passive LACP 10 |
| 20 | 45–46 | Sales 201 / voice 202 and LLDP |
| 21 | 47–48 | IPv4 /30 and IPv6 /126 |
| 22 | 49–50 | Three-switch topology, native 35, active/passive LACP 12 |
| 23 | 51–53 | OPS / ENGINEERING variant, retained separately |
| 24 | 54–58 | Internet default route, primary host route, floating backup |
| 25 | 59–60 | R2 OSPF 10 and DR preference |
| 26 | 61–62 | DC / HQ / Branch static routes and shortest-path default |
| 27 | 63–64 | Repeated DC / HQ / Branch item, retained separately |

## Source corrections and authored assumptions

- **04 and 10:** diagrams label E0/1 while answers configure E0/0. The lab consistently uses the diagram's E0/1.
- **06 and 23:** LLDP is configured on the actual inter-switch link. Some source answers instead configure router-facing E0/2. End-user addresses without masks are assigned /24.
- **08:** the answer omits trunk mode on SW-1 E0/2; the task and solution here require it.
- **14:** the last address of `2001:db8:12::/122` is `2001:db8:12::3f`, not the source answer's `::1f`.
- **17:** the task requires VLANs 99 and 110; the answer permits only 110. Both are required here.
- **24:** server `209.165.202.129/27` cannot use the supplied `209.165.202.1/27` gateway. Its gateway and the ISP server-facing interface are corrected to `209.165.202.130/27`.
- **OSPF:** diagrams give transit prefixes without every host address. Chosen addresses are listed in topology notes. Existing peer OSPF configurations are supplied. Automatic selection of the correct loopback router ID is accepted as an equivalent result.
- **Static routing:** unspecified baseline addressing and return routes are supplied so the exercise can be completed and tested independently.
- **LLDP:** global `lldp run` is explicitly included even where source answers omit it. Neighbor checks require a connected, enabled link, global LLDP on both endpoints, local receive and remote transmit.

## Simulator boundaries

These labs cover the PDF's **configuration tasks**, not every behavior of real Cisco IOS. They do not run virtual appliances.

- VLAN sets affect simulated packet forwarding. EtherChannel checks require compatible peers and negotiation; passive/passive fails. Parallel diagram links are drawn separately.
- IPv6 addresses are compared semantically, including prefix length. Expanded and compressed forms are equivalent. The dual-stack exercises grade configuration, not full IPv6 router-originated packet behavior.
- OSPF neighbors require real modeled links, matching area/subnet and distinct router IDs. DR/BDR is a deterministic priority/router-ID calculation, not a timed, non-preemptive protocol election. Route metrics remain simplified hop counts.
- Voice VLANs are configured and graded, but telephone registration, calls and SIP are not simulated. In item 11, PC1's cable represents the phone's data pass-through. No dedicated phone appliance is claimed.
- Router uplinks in the access/voice tasks are preconfigured segment representations; router-on-a-stick subinterface configuration is not part of those graded tasks.
- Static route distance is stored and graded. The forwarding lookup chooses the viable route with longest prefix then lowest distance; item 24 tests primary-link shutdown and backup activation.
- `write memory` / `copy running-config startup-config` save the latest configuration; later edits invalidate the save check.

## Reproducible validation and installation

From `backend`:

```powershell
node scripts/create-ccna-pdf-labs.mjs
node --test src/tests/ccna-pdf-labs.test.js
```

After validation, create **unpublished** drafts:

```powershell
node scripts/create-ccna-pdf-labs.mjs --save
```

The script validates all 27 solutions before writing. Template IDs -201 through -227 are reserved for this collection. Reruns preserve existing drafts, published versions, edits and attempts. They do not update or reset existing labs. The editor's review notes remain editable and private.
