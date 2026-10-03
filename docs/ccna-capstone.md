# CCNA campus and branch capstone

Original simulator practice content, not an official Cisco exam question.

- Category: Cisco → CCNA
- Title: CCNA · Campus and Branch Network Capstone
- Access: Free
- Assessment duration: 90 minutes
- Devices: R1/R2 routers, SW1/SW2 switches, PC1–PC4 hosts
- PC3 is a locked isolation-test endpoint; the other seven consoles are editable.
- 24 tasks, 140 weighted points, displayed as a percentage
- Saved as a draft; use Admin → Labs to preview, review solutions and publish.

## Coverage

The lab exercises every currently supported grading-rule type: interface address,
interface up, VLAN existence, access VLAN, trunk, static route, route availability,
OSPF-learned route, exact configuration line, successful/blocked ping and saved
configuration. It also provides topology notes, physical links, reference commands,
PC addressing and gateway exercises, and optional traceroute inspection.

The engine's existing practice/timed modes, help, completion, command history,
saved progress, reset, solution view and final results work with this definition.
These are platform functions, not additional graded tasks. VLAN labels are
recommended names; VLAN existence and port assignment are graded, not label text.
PC gateways are verified indirectly by off-subnet connectivity tasks.

This is not a claim to cover all CCNA technologies. The integrated lab authoring
interface supports routers, switches and PCs, not additional device types. This
exercise does not include wireless, dedicated firewalls, IPv6, NAT or DHCP tasks.

## Network

The campus uses VLAN 10 / 192.168.10.0/24 across a two-switch trunk. R1 is its
gateway. R1 and R2 connect on 10.0.12.0/30; R2 serves the branch LAN
192.168.20.0/24. Basic single-area OSPF exchanges these LAN routes.

R2's preconfigured 203.0.113.1/32 loopback is a service endpoint. R1 requires a
separate static host route to it. PC3 deliberately shares the campus IP subnet
while using isolated access VLAN 20: it must not communicate with VLAN 10.
This demonstrates that matching IP subnets alone do not bridge VLAN separation.

## Reproduce and verify

From the workspace root:

```powershell
node --test backend/src/tests/ccna-capstone.test.js
node backend/scripts/create-ccna-capstone.mjs
node backend/scripts/create-ccna-capstone.mjs --save
```

The first script invocation only validates the reference solution. `--save` uses
the backend's configured database and creates a draft only if the title/template
is absent. It reuses Cisco / CCNA (creating them if absent), never overwrites an
existing lab, and never publishes or changes attempts. Template ID is `-104`.

Checks verify 0% before configuration, a 100% reference solution, failed VLAN
isolation after assigning PC3 to VLAN 10, failed OSPF/connectivity after an area
mismatch, and invalidated save checks after a later configuration change.
