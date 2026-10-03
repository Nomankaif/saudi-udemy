// Original practice content, not official Cisco exam questions.
import { normalizeQuestion } from "../services/question-validation.js";

export const CCNA_DRAG_DROP_EXAM = {
  title: "CCNA 200-301 · Drag-and-Drop Practice",
  slug: "ccna-200-301-drag-and-drop-practice-sample",
  category: "Cisco",
  subcategory: "CCNA",
  shortDescription: "Five interactive networking questions: match, group and sequence items.",
  description: "Original CCNA-style practice covering device roles, service ports, DHCP, private IPv4 addressing and subnet masks. Drag each item into its correct destination, or select an item and then its destination. Read each question carefully: some items may be unused. Each question earns one point only when all placements are correct. This is an independent practice exam, not an official Cisco examination.",
  durationMinutes: 15,
  attemptSize: 5,
  passingPercentage: 80,
  status: "DRAFT",
  hasUnpublishedChanges: true,
};

function question(text, topic, items, targets, explanation, index) {
  return normalizeQuestion({
    type: "DRAG_DROP", text, topic, explanation, displayOrder: index,
    difficulty: "EASY", accessLevel: "FREE",
    options: items.map(([id, label]) => ({ id, text: label })),
    dropTargets: targets.map(([id, label, capacity = 1]) => ({ id, label, capacity })),
    correctPlacements: items.filter(([, , target]) => target).map(([itemId, , targetId]) => ({ itemId, targetId })),
  });
}

export const CCNA_DRAG_DROP_QUESTIONS = [
  question(
    "Match each device to its primary role in this network. Use every item once.",
    "Network fundamentals",
    [["switch", "Layer 2 switch", "lan"], ["pc", "PC", "endpoint"], ["router", "Router", "routing"], ["ap", "Wireless access point", "wireless"]],
    [["routing", "Forwards IP packets between different networks"], ["lan", "Forwards Ethernet frames within a LAN using MAC addresses"], ["wireless", "Connects wireless clients to the wired LAN"], ["endpoint", "Runs end-user applications and sends or receives data"]],
    "A router forwards packets between IP networks. A Layer 2 switch forwards Ethernet frames using MAC addresses. An access point connects wireless clients to a LAN. A PC is an end-user device that runs applications.", 1,
  ),
  question(
    "Match each service to its default server port number. Use every item once. Match the port number, not the transport protocol.",
    "IP services",
    [["https", "HTTPS", "p443"], ["dns", "DNS", "p53"], ["ssh", "SSH", "p22"], ["http", "HTTP", "p80"]],
    [["p22", "22"], ["p53", "53"], ["p80", "80"], ["p443", "443"]],
    "SSH uses port 22, DNS uses port 53, HTTP uses port 80 and HTTPS uses port 443 by default. DNS supports both UDP and TCP on port 53. Administrators can configure non-default ports.", 2,
  ),
  question(
    "A new DHCPv4 client has no saved lease. Arrange the normal four-message exchange used to obtain its first address. Use every item once.",
    "IP services",
    [["request", "DHCPREQUEST", "step3"], ["ack", "DHCPACK", "step4"], ["discover", "DHCPDISCOVER", "step1"], ["offer", "DHCPOFFER", "step2"]],
    [["step1", "Step 1"], ["step2", "Step 2"], ["step3", "Step 3"], ["step4", "Step 4"]],
    "The initial exchange is Discover, Offer, Request, Acknowledgment (DORA). The client discovers servers, a server offers an address, the client requests an offered lease, and the server acknowledges it. This question concerns initial allocation, not lease renewal.", 3,
  ),
  question(
    "Place each private IPv4 address in its RFC 1918 range. Each group has two slots. One address is not RFC 1918 private space and must remain unused. Order within a group does not matter.",
    "IPv4 addressing",
    [["ip1", "192.168.20.10", "r192"], ["ip2", "10.12.1.5", "r10"], ["ip3", "172.31.8.9", "r172"], ["unused", "172.32.1.10", null], ["ip4", "192.168.200.5", "r192"], ["ip5", "172.16.4.10", "r172"], ["ip6", "10.200.3.8", "r10"]],
    [["r10", "10.0.0.0/8", 2], ["r172", "172.16.0.0/12", 2], ["r192", "192.168.0.0/16", 2]],
    "RFC 1918 reserves 10.0.0.0–10.255.255.255, 172.16.0.0–172.31.255.255 and 192.168.0.0–192.168.255.255. The address 172.32.1.10 is outside those ranges and must stay in the item bank.", 4,
  ),
  question(
    "Match each IPv4 prefix length to its dotted-decimal subnet mask. Use every item once.",
    "IPv4 subnetting",
    [["prefix30", "/30", "mask30"], ["prefix24", "/24", "mask24"], ["prefix26", "/26", "mask26"], ["prefix25", "/25", "mask25"]],
    [["mask24", "255.255.255.0"], ["mask25", "255.255.255.128"], ["mask26", "255.255.255.192"], ["mask30", "255.255.255.252"]],
    "The prefix length counts consecutive network bits. /24 uses 24 one-bits: 255.255.255.0. Adding one, two or six network bits in the final octet produces /25 = 255.255.255.128, /26 = 255.255.255.192 and /30 = 255.255.255.252.", 5,
  ),
];
