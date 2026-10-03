// iosCmdTree.js — IOS command tree for ? and Tab completion

function leaf(d) { return { _desc: d, _eol: true }; }
function node(d, c) { return { _desc: d, _eol: false, ...c }; }
function both(d, c) { return { _desc: d, _eol: true, ...c }; }

// ─── shared subtrees ──────────────────────────────────────────────────────────
const STD_SRC = {
  any:  leaf("Any source host"),
  host: node("A single source host", { _arg: leaf("<ip>  Source host IP address") }),
  _arg: both("<A.B.C.D>  Source address", { _arg: leaf("<A.B.C.D>  Source wildcard bits") }),
};

const EXT_PROTO = {
  ip:   node("Any Internet Protocol", { any: node("Any src", { any: both("Any dst",{}), _arg: both("<A.B.C.D>  Dst",{ _arg: leaf("<wc>") }) }), host: node("Host src", { _arg: node("<src>", { any: both("Any dst",{}), host: node("Host dst",{ _arg: leaf("<dst>") }), _arg: both("<A.B.C.D>  Dst",{ _arg: leaf("<wc>") }) }) }), _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: both("Any dst",{}), host: node("Host dst",{ _arg: leaf("<dst>") }), _arg: both("<A.B.C.D>  Dst",{ _arg: leaf("<wc>") }) }) }) }),
  tcp:  node("Transmission Control Protocol", { any: node("Any src", { any: both("Any dst",{ eq: node("Match port",{ _arg: leaf("<0-65535>  Port") }), range: node("Port range",{ _arg: node("<start>",{ _arg: leaf("<end>") }) }) }), host: node("Host dst",{ _arg: both("<dst>",{ eq: node("Match port",{ _arg: leaf("<0-65535>") }) }) }), _arg: both("<A.B.C.D>  Dst",{ _arg: both("<wc>",{ eq: node("Match port",{ _arg: leaf("<0-65535>") }) }) }), eq: node("Match src port",{ _arg: leaf("<0-65535>") }) }), _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: both("Any dst",{ eq: node("Match port",{ _arg: leaf("<0-65535>") }), range: node("Port range",{ _arg: node("<start>",{ _arg: leaf("<end>") }) }) }), host: node("Host dst",{ _arg: both("<dst>",{ eq: node("Match port",{ _arg: leaf("<0-65535>") }) }) }), _arg: both("<A.B.C.D>  Dst",{ _arg: both("<wc>",{ eq: node("Match port",{ _arg: leaf("<0-65535>") }) }) }), eq: node("Match src port",{ _arg: leaf("<0-65535>") }) }) }) }),
  udp:  node("User Datagram Protocol", { any: node("Any src", { any: both("Any dst",{ range: node("Port range",{ _arg: node("<start>",{ _arg: leaf("<end>") }) }), eq: node("Match port",{ _arg: leaf("<0-65535>") }) }), _arg: both("<A.B.C.D>  Dst",{ _arg: both("<wc>",{ range: node("Port range",{ _arg: node("<start>",{ _arg: leaf("<end>") }) }) }) }) }), _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: both("Any dst",{ range: node("Port range",{ _arg: node("<start>",{ _arg: leaf("<end>") }) }), eq: node("Match port",{ _arg: leaf("<0-65535>") }) }), _arg: both("<A.B.C.D>  Dst",{ _arg: both("<wc>",{ range: node("Port range",{ _arg: node("<start>",{ _arg: leaf("<end>") }) }) }) }) }) }) }),
  icmp: node("Internet Control Message Protocol", { any: node("Any src", { any: both("Any dst",{}), _arg: both("<A.B.C.D>  Dst",{ _arg: leaf("<wc>") }) }), host: node("Host src", { _arg: node("<src>", { any: both("Any dst",{}), host: node("Host dst",{ _arg: leaf("<dst>") }) }) }), _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: both("Any dst",{}), _arg: both("<A.B.C.D>  Dst",{ _arg: leaf("<wc>") }) }) }) }),
  ospf: node("OSPF routing protocol", { any: node("Any src", { any: both("Any dst",{}) }), _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: both("Any dst",{}) }) }) }),
  eigrp:node("EIGRP routing protocol", { _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: both("Any dst",{}) }) }) }),
  gre:  node("GRE tunnels", { _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: both("Any dst",{}) }) }) }),
  ahp:  node("Authentication Header Protocol", { _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: both("Any dst",{}) }) }) }),
  esp:  node("Encapsulation Security Payload", { _arg: both("<A.B.C.D>  Src", { _arg: node("<wc>", { any: both("Any dst",{}) }) }) }),
};

// do-commands available in all config sub-modes
const DO_CMDS = node("Execute an EXEC-level command", {
  show: node("Show running system information", {
    "running-config": leaf("Current operating configuration"),
    "startup-config": leaf("Startup configuration"),
    ip: node("IP information", {
      interface:     both("IP interface status", { brief: leaf("Brief summary") }),
      route:         both("IP routing table", { connected: leaf("Connected"), static: leaf("Static"), ospf: leaf("OSPF") }),
      ospf:          both("OSPF information", { neighbor: leaf("Neighbors"), interface: leaf("Interfaces"), database: leaf("Database") }),
      "access-lists": leaf("List IP access lists"),
      nat:           both("NAT information", { translations: leaf("Translations"), statistics: leaf("Statistics") }),
      dhcp:          both("DHCP information", { snooping: leaf("Snooping info"), binding: leaf("Bindings"), pool: leaf("Pools") }),
      ssh:           leaf("SSH information"),
      protocols:     leaf("IP routing protocol info"),
    }),
    interfaces:    both("Interface status and configuration", { trunk: leaf("Trunk interfaces"), switchport: leaf("Switchport info"), status: leaf("Status"), description: leaf("Interface description") }),
    vlan:          both("VTP VLAN status", { brief: leaf("Brief") }),
    etherchannel:  both("EtherChannel information", { summary: leaf("Summary"), detail: leaf("Detail") }),
    "spanning-tree": both("Spanning tree topology", { _arg: leaf("<vlan-id>"), summary: leaf("Summary"), detail: leaf("Detail") }),
    cdp:           both("CDP information", { neighbors: both("Neighbor entries", { detail: leaf("Detailed") }) }),
    lldp:          both("LLDP information", { neighbors: both("Neighbor entries", { detail: leaf("Detailed") }) }),
    "port-security": both("Port security information", { interface: leaf("Interface info") }),
    mac:           node("MAC information", { "address-table": both("MAC table", { dynamic: leaf("Dynamic entries") }) }),
    arp:           leaf("ARP table"),
    version:       leaf("System version"),
    clock:         leaf("System clock"),
    users:         leaf("Terminal lines"),
    logging:       leaf("Logging buffer"),
    ntp:           both("NTP information", { status: leaf("NTP status"), associations: leaf("NTP associations") }),
    vtp:           both("VTP status", { status: leaf("VTP status"), counters: leaf("VTP counters") }),
    "standby":     both("HSRP information", { _arg: leaf("<group>  Group number") }),
  }),
  ping:       both("Send echo messages", { _arg: leaf("<A.B.C.D>  Destination") }),
  traceroute: both("Trace route to destination", { _arg: leaf("<A.B.C.D>  Destination") }),
  write:      both("Write running configuration", { memory: leaf("Write to NV memory") }),
  clear:      node("Reset functions", {
    ip:  node("IP functions", { ospf: node("OSPF", { process: leaf("Reset OSPF process") }), arp: leaf("Clear ARP cache") }),
    arp: leaf("Clear ARP cache"),
    "spanning-tree": leaf("Reset spanning-tree counters"),
  }),
});

const IFACE_NUMS = {
  "0/0": leaf("Interface 0/0"), "0/1": leaf("Interface 0/1"),
  "0/2": leaf("Interface 0/2"), "0/3": leaf("Interface 0/3"),
  "0/4": leaf("Interface 0/4"), "0/5": leaf("Interface 0/5"),
  "0/6": leaf("Interface 0/6"), "0/7": leaf("Interface 0/7"),
  "0/8": leaf("Interface 0/8"), "0/9": leaf("Interface 0/9"),
  "0/10": leaf("Interface 0/10"), "0/11": leaf("Interface 0/11"),
  "0/12": leaf("Interface 0/12"),
  _arg: leaf("<slot/port>  Interface number"),
};

export const CMD_TREE = {

  // ── USER EXEC ────────────────────────────────────────────────────────────
  user: {
    connect:    both("Open a terminal connection", { _arg: leaf("<host>  Remote host name or IP") }),
    disable:    leaf("Turn off privileged commands"),
    disconnect: both("Disconnect an existing telnet session", { _arg: leaf("<session>  Session number") }),
    enable:     leaf("Turn on privileged commands"),
    exit:       leaf("Exit from the EXEC"),
    logout:     leaf("Exit from the EXEC"),
    ping:       both("Send echo messages", { _arg: leaf("<A.B.C.D>  Ping destination address") }),
    show: node("Show running system information", {
      arp:           leaf("ARP table"),
      cdp:           both("CDP information", { neighbors: both("CDP neighbor entries", { detail: leaf("Detailed information") }) }),
      clock:         leaf("Display the system clock"),
      etherchannel:  both("EtherChannel information", { summary: leaf("Summary") }),
      history:       leaf("Display the session command history"),
      interfaces:    both("Interface status and configuration", {
        _arg:        both("<interface>  Interface name", {}),
        description: leaf("Interface description"),
        status:      leaf("Interface line status"),
        switchport:  leaf("Show switchport information"),
        trunk:       leaf("Show trunk interface information"),
      }),
      ip: node("IP information", {
        interface:    both("IP interface status", { brief: leaf("Brief summary of IP status") }),
        route:        both("IP routing table", { _arg: leaf("<A.B.C.D>  Network to display") }),
      }),
      lldp:          both("LLDP information", { neighbors: both("LLDP neighbor entries", { detail: leaf("Detailed information") }) }),
      logging:       leaf("Contents of logging buffers"),
      mac:           node("MAC information", { "address-table": both("MAC forwarding table", { dynamic: leaf("Dynamic entries") }) }),
      "port-security": both("Port security information", {}),
      "spanning-tree": both("Spanning tree topology", { _arg: leaf("<vlan-id>"), summary: leaf("Port state summary") }),
      users:         leaf("Display information about terminal lines"),
      version:       leaf("System hardware and software status"),
      vlan:          both("VTP VLAN status", { brief: leaf("Brief VTP VLAN status") }),
      vtp:           both("VTP information", { status: leaf("VTP status") }),
    }),
    ssh:        both("Open a SSH connection", { "-l": node("Specify login name", { _arg: node("<username>", { _arg: leaf("<A.B.C.D>  Remote host IP") }) }) }),
    telnet:     both("Open a telnet connection", { _arg: leaf("<A.B.C.D>  IP address or hostname") }),
    traceroute: both("Trace route to destination", { _arg: leaf("<A.B.C.D>  Trace route to destination") }),
  },

  // ── PRIVILEGED EXEC ──────────────────────────────────────────────────────
  privileged: {
    clear: node("Reset functions", {
      arp:             leaf("Clear the entire ARP cache"),
      counters:        both("Clear counters on one or all interfaces", { _arg: leaf("<interface>  Interface name") }),
      ip:              node("IP functions", {
        arp:           leaf("Clear ARP cache"),
        dhcp:          node("DHCP functions", { binding: both("DHCP address bindings", { "*": leaf("Clear all bindings"), _arg: leaf("<A.B.C.D>  IP address") }) }),
        nat:           node("NAT functions", { translation: both("NAT translations", { "*": leaf("Delete all entries") }) }),
        ospf:          node("OSPF functions", { process: leaf("Reset OSPF process") }),
      }),
      line:            node("Reset a terminal line", { _arg: leaf("<0-16>  Line number") }),
      mac:             node("MAC functions", { "address-table": both("MAC address table", { dynamic: leaf("Dynamic entries only"), interface: leaf("By interface") }) }),
      "spanning-tree": both("Reset spanning-tree counters", { detected: leaf("Detected protocols"), interface: leaf("By interface") }),
      "vlan":          node("Reset VLAN counters", { counters: leaf("VLAN counters") }),
    }),
    clock: node("Manage the system clock", {
      set: node("Set the time and date", {
        _arg: node("<hh:mm:ss>  Current time", {
          _arg: node("<1-31>  Day of month", {
            January: node("January", { _arg: leaf("<1993-2035>  Year") }),
            February: node("February", { _arg: leaf("<1993-2035>  Year") }),
            March:    node("March", { _arg: leaf("<1993-2035>  Year") }),
            April:    node("April", { _arg: leaf("<1993-2035>  Year") }),
            May:      node("May", { _arg: leaf("<1993-2035>  Year") }),
            June:     node("June", { _arg: leaf("<1993-2035>  Year") }),
            July:     node("July", { _arg: leaf("<1993-2035>  Year") }),
            August:   node("August", { _arg: leaf("<1993-2035>  Year") }),
            September:node("September", { _arg: leaf("<1993-2035>  Year") }),
            October:  node("October", { _arg: leaf("<1993-2035>  Year") }),
            November: node("November", { _arg: leaf("<1993-2035>  Year") }),
            December: node("December", { _arg: leaf("<1993-2035>  Year") }),
          }),
        }),
      }),
    }),
    configure:   node("Enter configuration mode", { terminal: leaf("Configure from the terminal"), network: leaf("Configure from a TFTP network host") }),
    connect:     both("Open a terminal connection", { _arg: leaf("<host>  Remote host name or IP") }),
    copy:        node("Copy from one file to another", {
      "running-config":  node("Copy running config", { "startup-config": leaf("Copy to startup config"), tftp: leaf("Copy to TFTP server"), flash: leaf("Copy to flash") }),
      "startup-config":  node("Copy startup config", { "running-config": leaf("Copy to running config"), tftp: leaf("Copy to TFTP server") }),
      tftp:              node("Copy from TFTP server", { "running-config": leaf("Copy to running config"), "startup-config": leaf("Copy to startup config") }),
      flash:             node("Copy from flash", { "running-config": leaf("Copy to running config") }),
    }),
    crypto:      node("Encryption module", { key: node("Key configuration", {
      generate: node("Generate new keys", { rsa: both("Generate RSA keys", { general: leaf("General keys"), usage: leaf("Usage keys"), modulus: leaf("Specify modulus size") }) }),
      zeroize:  node("Remove keys", { rsa: leaf("Remove RSA keys") }),
      export:   node("Export keys", { rsa: leaf("Export RSA keys") }),
    }) }),
    debug:       node("Debugging functions", {
      all:            leaf("Enable all debugging"),
      ip:             node("IP information", {
        ospf:         both("OSPF information", { adj: leaf("Adjacency events"), events: leaf("OSPF events"), flood: leaf("Flooding"), lsa: leaf("LSA generation") }),
        nat:          leaf("NAT events"),
        rip:          leaf("RIP information"),
        icmp:         leaf("ICMP transactions"),
        routing:      leaf("Routing table events"),
        tcp:          both("TCP transactions", { transactions: leaf("TCP transactions") }),
      }),
      "spanning-tree":  both("Spanning tree information", { events: leaf("STP events"), bpdu: leaf("BPDUs") }),
      cdp:              leaf("CDP information"),
      lldp:             leaf("LLDP information"),
      "dhcp":           leaf("DHCP events"),
      eigrp:            both("EIGRP information", { packets: leaf("EIGRP packets"), neighbors: leaf("EIGRP neighbor events") }),
      vtp:              leaf("VTP information"),
      "arp":            leaf("ARP protocol"),
    }),
    delete:      both("Delete a file", { _arg: leaf("<filename>  Filename to delete") }),
    dir:         both("List files on a filesystem", { "flash:": leaf("Flash filesystem"), "nvram:": leaf("NVRAM filesystem"), _arg: leaf("<filesystem>  Filesystem") }),
    disable:     leaf("Turn off privileged commands"),
    disconnect:  both("Disconnect an existing telnet session", { _arg: leaf("<session>  Session number") }),
    erase:       node("Erase a filesystem", { "startup-config": leaf("Erase contents of startup configuration"), "nvram:": leaf("Erase NVRAM contents") }),
    exit:        leaf("Exit from the EXEC"),
    logout:      leaf("Exit from the EXEC"),
    more:        both("Display the contents of a file", { "flash:": leaf("Display file in flash"), "nvram:": leaf("Display NVRAM") }),
    ping:        both("Send echo messages", { _arg: leaf("<A.B.C.D>  Ping destination address or hostname") }),
    reload:      both("Halt and perform a cold restart", { in: leaf("Reload after a time delay"), at: leaf("Reload at a specific time"), cancel: leaf("Cancel pending reload") }),
    rename:      both("Rename a file", { _arg: leaf("<source>  Source filename") }),
    show: node("Show running system information", {
      arp:             leaf("ARP table"),
      cdp:             both("CDP information", {
        neighbors:     both("CDP neighbor entries", { detail: leaf("Detailed information") }),
        interface:     leaf("CDP interface status and configuration"),
        entry:         both("Information for specific neighbor", { "*": leaf("All CDP neighbors"), _arg: leaf("<device-id>  Device ID") }),
      }),
      clock:           leaf("Display the system clock"),
      controllers:     both("Interface controller status", { _arg: leaf("<interface>  Interface name") }),
      etherchannel:    both("EtherChannel information", { summary: leaf("One-line-per-channel-group summary"), detail: leaf("Detailed EtherChannel info"), "port-channel": leaf("Port-channel info") }),
      "flash:":        leaf("Flash filesystem information"),
      history:         leaf("Display the session command history"),
      hosts:           leaf("Host name/address mapping table"),
      interfaces:      both("Interface status and configuration", {
        _arg:          both("<interface>  Interface name", { switchport: leaf("Switchport info"), counters: leaf("Interface counters") }),
        description:   leaf("Interface description"),
        status:        leaf("Interface line status"),
        switchport:    leaf("Show switchport information for all interfaces"),
        trunk:         leaf("Show trunk interface information"),
        counters:      leaf("Interface counters"),
      }),
      inventory:       leaf("Show the physical inventory"),
      ip: node("IP information", {
        "access-lists":  both("List IP access lists", { _arg: leaf("<n>  Access list name/number") }),
        arp:             both("ARP table", { _arg: leaf("<A.B.C.D>  IP address") }),
        "arp-inspection":both("Dynamic ARP Inspection", { statistics: leaf("DAI statistics"), vlan: leaf("DAI VLAN info") }),
        dhcp:            both("DHCP information", {
          binding:       leaf("DHCP address bindings"),
          conflict:      leaf("DHCP address conflicts"),
          pool:          leaf("DHCP pools information"),
          snooping:      both("DHCP snooping information", { binding: leaf("Snooping bindings"), database: leaf("Agent database"), statistics: leaf("Statistics") }),
        }),
        eigrp:           both("EIGRP information", { neighbors: leaf("EIGRP neighbors"), interfaces: leaf("EIGRP interfaces"), topology: leaf("EIGRP topology") }),
        interface:       both("IP interface status and configuration", { brief: leaf("Brief summary of IP status and configuration"), _arg: leaf("<interface>") }),
        nat:             both("NAT information", { translations: both("Address translations", { verbose: leaf("Verbose output") }), statistics: leaf("Statistics") }),
        ospf:            both("OSPF information", {
          database:      both("OSPF database summary", { router: leaf("Router LSAs"), network: leaf("Network LSAs"), summary: leaf("Summary LSAs") }),
          interface:     both("OSPF interface information", { _arg: leaf("<interface>") }),
          neighbor:      both("OSPF neighbor information", { detail: leaf("Detailed info"), _arg: leaf("<interface>") }),
        }),
        protocols:       leaf("IP routing protocol process and summary information"),
        route:           both("IP routing table", { connected: leaf("Connected routes"), ospf: leaf("OSPF routes"), static: leaf("Static routes"), eigrp: leaf("EIGRP routes"), summary: leaf("Route summary"), _arg: leaf("<A.B.C.D>  Network to display") }),
        ssh:             leaf("Information on SSH"),
      }),
      ipv6: node("IPv6 information", {
        interface:       both("IPv6 interface status and configuration", { brief: leaf("Brief summary"), _arg: leaf("<interface>") }),
        neighbors:       leaf("IPv6 neighbors (NDP table)"),
        route:           both("IPv6 routing table", { connected: leaf("Connected"), static: leaf("Static"), _arg: leaf("<X:X:X:X::X/n>  IPv6 prefix") }),
        ospf:            both("OSPFv3 information", { neighbor: leaf("Neighbors"), interface: leaf("Interfaces") }),
      }),
      lldp:            both("LLDP information", {
        neighbors:       both("LLDP neighbor entries", { detail: leaf("Detailed information") }),
        interface:       leaf("LLDP interface status and configuration"),
        traffic:         leaf("LLDP traffic statistics"),
      }),
      logging:         leaf("Show the contents of logging buffers"),
      mac:             node("MAC information", { "address-table": both("MAC forwarding table", { dynamic: leaf("Dynamic entries only"), static: leaf("Static entries"), vlan: leaf("By VLAN"), interface: leaf("By interface"), aging: leaf("Aging time") }) }),
      ntp:             both("NTP information", { status: leaf("NTP clock status"), associations: both("NTP associations", { detail: leaf("Detailed info") }) }),
      "port-security": both("Port security information", { interface: both("Interface info", { _arg: leaf("<interface>") }), address: leaf("Secure MAC addresses") }),
      processes:       both("Active process statistics", { memory: leaf("Process memory information"), cpu: leaf("CPU utilization") }),
      "running-config":both("Current operating configuration", { interface: leaf("Interface configuration"), "all": leaf("All configuration"), view: leaf("View configuration") }),
      "spanning-tree": both("Spanning tree topology", { _arg: leaf("<vlan-id>  VLAN number"), detail: leaf("Detailed spanning tree information"), summary: leaf("Summary of port states"), blockedports: leaf("Blocked ports"), inconsistentports: leaf("Inconsistent ports") }),
      "startup-config":leaf("Contents of startup configuration"),
      tcp:             both("TCP information", { tcb: leaf("TCP control block information") }),
      users:           leaf("Display information about terminal lines"),
      version:         leaf("System hardware and software status"),
      vlan:            both("VTP VLAN status", { brief: leaf("Brief VTP VLAN status"), _arg: leaf("<1-4094>  VLAN ID"), id: leaf("VLAN ID information"), name: leaf("VLAN name") }),
      vtp:             both("VTP information", { status: leaf("VTP status"), counters: leaf("VTP counters"), password: leaf("VTP password") }),
      standby:         both("HSRP information", { _arg: leaf("<0-255>  Group number"), brief: leaf("Brief status"), all: leaf("All groups") }),
    }),
    ssh:         both("Open a secure shell client connection", { "-l": node("Specify login name", { _arg: node("<username>", { _arg: leaf("<A.B.C.D>  Remote host IP") }) }) }),
    telnet:      both("Open a telnet connection", { _arg: leaf("<A.B.C.D>  IP address or hostname") }),
    terminal:    node("Set terminal line parameters", { length: leaf("<0-512>  Number of lines (0=no pause)"), width: leaf("<0-512>  Terminal width"), monitor: leaf("Copy debug output to terminal") }),
    traceroute:  both("Trace route to destination", { _arg: leaf("<A.B.C.D>  Destination") }),
    undebug:     both("Disable debugging functions", { all: leaf("Turn off all debugging") }),
    write:       both("Write running configuration to memory, network, or terminal", { memory: leaf("Write to NV memory"), terminal: leaf("Write to terminal"), erase: leaf("Erase NV memory") }),
  },

  // ── GLOBAL CONFIG ────────────────────────────────────────────────────────
  config: {
    aaa: node("Authentication Authorization and Accounting", {
      "new-model":     leaf("Enable AAA access control model"),
      authentication:  node("Authentication configurations", {
        login:         node("Set authentication lists for logins", {
          default:     node("The default authentication list", {
            local:     leaf("Use local username authentication"),
            enable:    leaf("Use enable password for authentication"),
            none:      leaf("No authentication"),
          }),
          _arg:        node("<list-name>  Authentication list name", {
            local:     leaf("Use local username authentication"),
          }),
        }),
        enable:        node("Set authentication list for enable", {
          default:     node("The default authentication list", { enable: leaf("Use enable password") }),
        }),
      }),
      authorization:   node("Authorization configurations", {
        exec:          node("Set parameters for exec authorization", {
          default:     node("The default authorization list", { local: leaf("Use local database") }),
        }),
      }),
    }),
    "access-list": node("Add an access list entry", {
      _arg: node("<1-2699>  ACL number", {
        permit:  node("Specify packets to forward", { ...STD_SRC }),
        deny:    node("Specify packets to reject", { ...STD_SRC }),
        remark:  both("Access list entry comment", { _arg: leaf("<text>  Comment") }),
      }),
    }),
    banner: node("Define a login banner", {
      motd:            leaf("Set Message of the Day banner"),
      login:           leaf("Set login banner"),
      exec:            leaf("Set EXEC process creation banner"),
    }),
    "boot":            node("Modify system boot parameters", {
      system:          node("Specify a system image", {
        flash:         both("Boot from flash", { _arg: leaf("<filename>  Image filename") }),
        tftp:          leaf("Boot from TFTP server"),
      }),
    }),
    cdp:               both("Configure CDP", { run: leaf("Enable CDP"), "advertise-v2": leaf("Enable CDP version 2"), "holdtime": leaf("<10-255>  Specify hold time"), "timer": leaf("<5-254>  Specify timer") }),
    crypto:            node("Encryption module", { key: node("Key configuration", {
      generate: node("Generate new keys", { rsa: both("Generate RSA keys", { modulus: leaf("Specify modulus size"), "general-keys": leaf("Generate general purpose keys"), "usage-keys": leaf("Generate usage keys") }) }),
      zeroize:  node("Remove keys", { rsa: leaf("Remove RSA keys") }),
    }) }),
    enable:            node("Modify enable password parameters", {
      password:        both("Assign the privileged level password", { _arg: leaf("<password>  The enable password") }),
      secret:          both("Assign the privileged level secret", {
        _arg:          leaf("<secret>  The enable secret"),
        "0":           leaf("Unencrypted password"),
        "5":           leaf("MD5 hashed secret"),
      }),
    }),
    errdisable:        node("ErrDisable", {
      recovery:        node("Recovery", {
        cause:         node("Enable error disable recovery for a cause", {
          all:         leaf("Enable recovery for all causes"),
          bpduguard:   leaf("Enable recovery from BPDU guard error"),
          portchannel:  leaf("Enable recovery from port-channel error"),
          psecure:     leaf("Enable recovery from port security violation"),
          "link-flap": leaf("Enable recovery from link flap"),
        }),
        interval:      leaf("<30-86400>  Timer interval for autorecovery"),
      }),
      "detect":        node("Error disable detection", { cause: leaf("<cause>  Cause for err-disable") }),
    }),
    hostname:          both("Set system's network name", { _arg: leaf("<word>  This system's network name") }),
    interface:         node("Select an interface to configure", {
      ethernet:        node("Ethernet IEEE 802.3", { ...IFACE_NUMS }),
      fastethernet:    node("FastEthernet IEEE 802.3", { "0/1": leaf("FastEthernet0/1"), "0/2": leaf("FastEthernet0/2"), "0/3": leaf("FastEthernet0/3"), "0/4": leaf("FastEthernet0/4"), _arg: leaf("<slot/port>") }),
      gigabitethernet: node("GigabitEthernet IEEE 802.3z", { "0/0": leaf("GigabitEthernet0/0"), "0/1": leaf("GigabitEthernet0/1"), "0/2": leaf("GigabitEthernet0/2"), "0/3": leaf("GigabitEthernet0/3"), "1/0": leaf("GigabitEthernet1/0"), "1/1": leaf("GigabitEthernet1/1"), "2/0": leaf("GigabitEthernet2/0"), _arg: leaf("<slot/port>") }),
      loopback:        node("Loopback interface", { "0": leaf("Loopback0"), "1": leaf("Loopback1"), "2": leaf("Loopback2"), _arg: leaf("<0-2147483647>  Loopback number") }),
      "port-channel":  node("EtherChannel interface", { "1": leaf("Port-channel1"), "2": leaf("Port-channel2"), "3": leaf("Port-channel3"), "20": leaf("Port-channel20"), _arg: leaf("<1-64>  Port-channel number") }),
      range:           leaf("<interface-range>  Configure interface range"),
      serial:          node("Serial interface", { _arg: leaf("<slot/port/channel>") }),
      tunnel:          node("Tunnel interface", { _arg: leaf("<0-2147483647>  Tunnel interface number") }),
      vlan:            node("Catalyst VLANs (SVI)", { _arg: leaf("<1-4094>  VLAN interface number") }),
    }),
    ip: node("Global IP configuration subcommands", {
      "access-list":   node("Named access-list", {
        extended:      node("Extended access list", { _arg: leaf("<name>  Access list name") }),
        standard:      node("Standard access list", { _arg: leaf("<name>  Access list name") }),
      }),
      arp:             node("ARP configuration", {
        inspection:    node("Dynamic ARP Inspection", {
          validate:    node("DAI additional validation", {
            "dst-mac": leaf("Validate destination MAC address"),
            ip:        leaf("Validate IP addresses"),
            "src-mac": leaf("Validate source MAC address"),
          }),
          vlan:        node("Enable DAI on a VLAN", { _arg: leaf("<1-4094>  VLAN number") }),
        }),
        "proxy-arp":   leaf("Enable proxy ARP"),
      }),
      classless:       leaf("Follow classless routing rules"),
      "default-gateway": both("Specify default gateway (for switches without IP routing)", { _arg: leaf("<A.B.C.D>  Default gateway IP address") }),
      "default":       node("Set a command to its defaults", { gateway: leaf("<A.B.C.D>  Specify default gateway") }),
      dhcp:            node("DHCP configuration commands", {
        "excluded-address": both("Prevent DHCP from assigning certain addresses", { _arg: both("<low-address>  Low IP address", { _arg: leaf("<high-address>  High IP address") }) }),
        pool:          node("Configure DHCP address pool", { _arg: leaf("<name>  Pool name") }),
        snooping:      both("DHCP Snooping", {
          information: node("DHCP Snooping information", { option: leaf("DHCP Snooping information option") }),
          verify:      node("Verify source address", { "mac-address": leaf("Verify source MAC address matches hardware address") }),
          vlan:        node("Enable DHCP snooping on a VLAN", { _arg: leaf("<1-4094>  VLAN number") }),
        }),
      }),
      "domain-lookup": leaf("Enable IP Domain Name System hostname translation"),
      "domain-name":   both("Define the default domain name", { _arg: leaf("<name>  Default domain name") }),
      http:            node("HTTP server and client commands", {
        server:        leaf("Enable HTTP server"),
        "secure-server": leaf("Enable HTTPS server"),
      }),
      "name-server":   both("Specify address of name server to use", { _arg: both("<A.B.C.D>  First name server IP", { _arg: leaf("<A.B.C.D>  Second name server IP") }) }),
      nat:             node("NAT configuration", {
        inside:        node("Inside address translation", {
          source:      node("Source address translation", {
            list:      node("Specify access list", { _arg: node("<acl>  ACL name/number", { interface: node("Specify interface", { _arg: both("<interface>  Interface name", { overload: leaf("Overload an address translation") }) }), pool: node("Specify pool", { _arg: both("<name>  Pool name", { overload: leaf("Overload address translation") }) }) }) }),
            static:    node("Static address translation", { _arg: node("<local-ip>  Local IP address", { _arg: leaf("<global-ip>  Global IP address") }) }),
          }),
        }),
        outside:       node("Outside address translation", {
          source:      node("Source address translation", { static: node("Static address translation", { _arg: node("<global-ip>", { _arg: leaf("<local-ip>") }) }) }),
        }),
        pool:          node("Define pool of global addresses", { _arg: node("<name>  Pool name", { _arg: node("<start-ip>  Start IP", { _arg: node("<end-ip>  End IP", { netmask: node("Specify netmask", { _arg: leaf("<mask>  Subnet mask") }), prefix: node("Prefix", { length: leaf("<0-32>  Prefix length") }) }) }) }) }),
      }),
      routing:         leaf("Enable IP routing"),
      route:           both("Establish static routes", {
        _arg: node("<A.B.C.D>  Destination network", {
          _arg: node("<A.B.C.D>  Destination mask or /prefix", {
            _arg: both("<A.B.C.D>  Forwarding router's address or interface", {
              _arg:       leaf("<1-255>  Distance metric for this route"),
              permanent:  leaf("Permanent route"),
              track:      leaf("Track object"),
              name:       node("Give name to this route", { _arg: leaf("<tag>  Name of next hop") }),
              tag:        node("Set tag for this route", { _arg: leaf("<1-4294967295>  Tag value") }),
            }),
          }),
        }),
      }),
      ssh:             node("Configure SSH server", {
        version:       node("Specify SSH version", { "1": leaf("Protocol version 1"), "2": leaf("Protocol version 2") }),
        "time-out":    leaf("<1-120>  SSH timeout in seconds"),
        "authentication-retries": leaf("<0-5>  Number of authentication retries"),
        "source-interface": both("Specify interface for source address in SSH connections", { _arg: leaf("<interface>  Interface name") }),
      }),
    }),
    ipv6:              node("IPv6 global configuration", {
      route:           both("Establish IPv6 static routes", {
        _arg: node("<X:X:X:X::X/n>  IPv6 prefix", {
          _arg: both("<X:X:X:X::X>  Next-hop IPv6 address or interface", {
            _arg:       leaf("<1-254>  Administrative distance"),
            permanent:  leaf("Permanent route"),
          }),
        }),
      }),
      "unicast-routing": leaf("Enable IPv6 unicast routing"),
    }),
    line:              node("Configure a terminal line", {
      console:         node("Primary terminal line", { _arg: leaf("<0>  First Line number") }),
      vty:             node("Virtual terminal", { _arg: node("<0-15>  First line number", { _arg: leaf("<0-15>  Last line number") }) }),
      aux:             node("Auxiliary line", { _arg: leaf("<0>  First line number") }),
    }),
    lldp:              both("Global LLDP configuration commands", {
      run:             leaf("Enable LLDP"),
      holdtime:        leaf("<0-65535>  Specify hold time in seconds"),
      "reinit":        leaf("<2-5>  Specify delay (in secs) for LLDP to initialize"),
      timer:           leaf("<5-65534>  Specify rate at which LLDP packets are sent (in sec)"),
      "tlv-select":    leaf("Selection of LLDP TLVs to send"),
    }),
    logging:           node("Modify message logging facilities", {
      buffered:        both("Set buffered logging parameters", { _arg: leaf("<4096-2147483647>  Logging buffer size") }),
      console:         both("Set console logging parameters", { _arg: leaf("<0-7>  Severity level") }),
      host:            both("Set syslog server IP address", { _arg: leaf("<A.B.C.D>  IP address of the syslog server") }),
      on:              leaf("Enable logging to all enabled destinations"),
      trap:            both("Set syslog server logging level", { _arg: leaf("<0-7>  Severity level") }),
    }),
    "mac":             node("MAC address table configuration", {
      "address-table": node("MAC address table configuration", {
        aging:         node("Aging time configuration", { time: leaf("<0-1000000>  Aging time in seconds") }),
        static:        node("Static MAC address configuration", {
          _arg:        node("<H.H.H>  48-bit hardware address", { vlan: node("VLAN id", { _arg: node("<1-4094>  VLAN ID", { interface: leaf("<interface>  Interface name") }) }) }),
        }),
      }),
    }),
    "no":              node("Negate a command or set its defaults", {
      aaa:             node("AAA commands", { "new-model": leaf("Disable AAA access control model") }),
      "access-list":   node("Remove an access list", { _arg: leaf("<1-2699>  ACL number or name") }),
      banner:          node("Remove a banner", { motd: leaf("Remove MOTD banner") }),
      cdp:             node("CDP commands", { run: leaf("Disable CDP") }),
      "enable":        node("Remove enable password", { secret: leaf("Remove enable secret"), password: leaf("Remove enable password") }),
      hostname:        leaf("Remove hostname (resets to default)"),
      ip:              node("IP commands", {
        "access-list": node("Remove named access list", { _arg: leaf("<name>  Access list name") }),
        "default-gateway": leaf("Remove default gateway"),
        "domain-lookup": leaf("Disable DNS lookup"),
        "domain-name": leaf("Remove domain name"),
        dhcp:          node("DHCP commands", { pool: leaf("<name>  Remove DHCP pool"), "excluded-address": leaf("<ip>  Remove excluded address") }),
        http:          node("HTTP commands", { server: leaf("Disable HTTP server"), "secure-server": leaf("Disable HTTPS server") }),
        nat:           node("Remove NAT configuration", { inside: leaf("Remove inside NAT"), pool: leaf("<name>  Remove NAT pool") }),
        route:         both("Remove static route", { _arg: leaf("<A.B.C.D>  Destination network") }),
        routing:       leaf("Disable IP routing"),
        ssh:           node("SSH commands", { version: leaf("Remove SSH version restriction") }),
      }),
      ipv6:            node("IPv6 commands", { "unicast-routing": leaf("Disable IPv6 unicast routing"), route: leaf("<prefix>  Remove IPv6 static route") }),
      lldp:            node("LLDP commands", { run: leaf("Disable LLDP") }),
      logging:         node("Disable logging", { on: leaf("Disable all logging"), console: leaf("Disable console logging"), buffered: leaf("Clear logging buffer"), host: leaf("<A.B.C.D>  Remove syslog server") }),
      ntp:             node("NTP commands", { master: leaf("Remove NTP master"), server: leaf("<A.B.C.D>  Remove NTP server") }),
      router:          node("Remove routing process", { ospf: leaf("<pid>  Remove OSPF process"), eigrp: leaf("<asn>  Remove EIGRP process"), rip: leaf("Remove RIP") }),
      service:         node("Disable service", { "password-encryption": leaf("Disable password encryption"), timestamps: leaf("Remove timestamps") }),
      "spanning-tree": node("STP commands", {
        mode:          leaf("Remove STP mode override"),
        vlan:          both("Remove STP VLAN config", { _arg: leaf("<1-4094>  VLAN number") }),
        "portfast":    leaf("Disable global portfast default"),
      }),
      username:        both("Remove user name entry", { _arg: leaf("<name>  Username to remove") }),
      vlan:            both("Remove VLAN", { _arg: leaf("<1-4094>  VLAN ID to remove") }),
    }),
    ntp:               node("Configure NTP", {
      authenticate:    leaf("Authenticate time sources"),
      "authentication-key": node("Authentication key for trusted time sources", { _arg: leaf("<1-4294967295>  Key number") }),
      master:          both("Act as NTP master clock", { _arg: leaf("<1-15>  Stratum number") }),
      peer:            both("Configure NTP peer", { _arg: leaf("<A.B.C.D>  IP address of peer") }),
      server:          both("Configure NTP server", { _arg: both("<A.B.C.D>  IP address of NTP server", { prefer: leaf("Prefer this server when possible"), version: leaf("<1-4>  NTP version") }) }),
      "source":        both("Configure interface for source address", { _arg: leaf("<interface>  Interface") }),
      "trusted-key":   both("Key numbers for trusted time sources", { _arg: leaf("<1-4294967295>  Key number") }),
    }),
    router:            node("Enable a routing process", {
      ospf:            node("Open Shortest Path First (OSPF)", { _arg: leaf("<1-65535>  Process ID") }),
      eigrp:           node("Enhanced IGRP (EIGRP)", { _arg: leaf("<1-65535>  Autonomous System number") }),
      rip:             leaf("Routing Information Protocol (RIP)"),
      bgp:             node("Border Gateway Protocol (BGP)", { _arg: leaf("<1-4294967295>  AS number") }),
    }),
    service:           node("Modify use of network based services", {
      "dhcp":          leaf("DHCP service commands"),
      "nagle":         leaf("Enable TCP Nagle algorithm"),
      "password-encryption": leaf("Encrypt system passwords"),
      "tcp-keepalives-in": leaf("Enable TCP keepalives for inbound telnet connections"),
      "tcp-keepalives-out": leaf("Enable TCP keepalives for outbound telnet connections"),
      timestamps:      node("Timestamp debug/log messages", {
        debug:         both("Timestamp debug messages", { datetime: both("Datetime", { msec: leaf("Include milliseconds"), "localtime": leaf("Use local time zone") }), uptime: leaf("Uptime") }),
        log:           both("Timestamp log messages", { datetime: both("Datetime", { msec: leaf("Include milliseconds"), "localtime": leaf("Use local time zone") }), uptime: leaf("Uptime") }),
      }),
    }),
    "snmp-server":     node("Modify SNMP parameters", {
      community:       both("Enable SNMP; set community string and access privs", { _arg: both("<community-string>  SNMP community string", { ro: leaf("Read-only access"), rw: leaf("Read-write access") }) }),
      "contact":       both("Text for mib object sysContact", { _arg: leaf("<text>  System contact information") }),
      enable:          node("Enable SNMP traps", { traps: leaf("Enable SNMP traps") }),
      host:            both("Specify hosts to receive SNMP notifications", { _arg: leaf("<A.B.C.D>  IP address of SNMP notification host") }),
      location:        both("Text for mib object sysLocation", { _arg: leaf("<text>  System location information") }),
      "trap-source":   both("Assign an interface for the source address of all traps", { _arg: leaf("<interface>  Interface name") }),
    }),
    "spanning-tree":   both("Spanning Tree Subsystem", {
      mode:            node("Spanning tree operating mode", {
        "pvst":        leaf("Per-VLAN spanning tree mode (default)"),
        "rapid-pvst":  leaf("Per-VLAN rapid spanning tree mode"),
        mst:           leaf("Multiple spanning tree mode"),
      }),
      "portfast":      both("Enable portfast by default on access ports", { default: leaf("Enable portfast on all non-trunking interfaces") }),
      "extend":        node("Spanning Tree extend function", { "system-id": leaf("Enable 802.1t Extended system ID") }),
      vlan:            node("VLAN Switch Spanning Tree", {
        _arg: node("<1-4094>  VLAN number(s)", {
          "forward-time": leaf("<4-30>  Fwd delay time"),
          "hello-time":   leaf("<1-10>  Hello time between hellos"),
          "max-age":      leaf("<6-40>  Max age time"),
          priority:       node("Bridge priority", { _arg: leaf("<0-61440>  Bridge priority (multiples of 4096)") }),
          root:           node("Configure switch as root", { primary: leaf("Configure this switch as primary root"), secondary: leaf("Configure this switch as secondary root") }),
        }),
      }),
    }),
    username:          node("Establish user name authentication", {
      _arg: node("<name>  User name", {
        "algorithm-type": node("Specify encryption algorithm for password", {
          md5:           node("MD5 algorithm", { secret: node("Specify the secret for the user", { _arg: leaf("<secret>  Cleartext secret") }) }),
          scrypt:        node("SCRYPT hashing algorithm", { secret: node("Specify the secret for the user", { _arg: leaf("<secret>  Cleartext secret") }) }),
          sha256:        node("SHA256/PBKDF2 algorithm", { secret: node("Specify the secret for the user", { _arg: leaf("<secret>  Cleartext secret") }) }),
        }),
        nopassword:    leaf("No password is required for the user to log in"),
        password:      both("Specify the password for the user", { _arg: leaf("<password>  User password string"), "0": leaf("Unencrypted password"), "7": leaf("Encrypted password") }),
        privilege:     node("Set user privilege level", {
          _arg: node("<0-15>  User privilege level", {
            "algorithm-type": node("Specify encryption algorithm", {
              md5:           node("MD5", { secret: node("Secret", { _arg: leaf("<secret>") }) }),
              scrypt:        node("SCRYPT", { secret: node("Secret", { _arg: leaf("<secret>") }) }),
              sha256:        node("SHA256", { secret: node("Secret", { _arg: leaf("<secret>") }) }),
            }),
            password:      both("Specify password", { _arg: leaf("<password>"), "0": leaf("Unencrypted"), "7": leaf("Encrypted") }),
            secret:        both("Specify secret", { _arg: leaf("<secret>") }),
          }),
        }),
        secret:        both("Specify the secret for the user", { _arg: leaf("<secret>  The user secret"), "0": leaf("Unencrypted secret"), "5": leaf("MD5 hashed secret") }),
        view:          both("Set view name as per parser view", { _arg: leaf("<view-name>  View name") }),
      }),
    }),
    vlan:              both("VLAN configuration", { _arg: leaf("<1-4094>  VLAN ID list") }),
    vtp:               node("Configure VTP", {
      domain:          both("Set the name of the VTP administrative domain", { _arg: leaf("<name>  VTP domain name") }),
      mode:            node("Configure VTP device mode", {
        client:        leaf("Set the device to client mode"),
        server:        leaf("Set the device to server mode"),
        transparent:   leaf("Set the device to transparent mode"),
        "off":         leaf("Set the device to off mode"),
      }),
      password:        both("Set the password for the VTP administrative domain", { _arg: leaf("<password>  VTP password") }),
      pruning:         leaf("Set the administrative domain to permit pruning"),
      version:         node("Set the administrative domain to VTP version", { "1": leaf("VTP version 1"), "2": leaf("VTP version 2"), "3": leaf("VTP version 3") }),
    }),
    "key":             node("Key management", {
      chain:           node("Key-chain management", { _arg: leaf("<n>  Key-chain name") }),
    }),
    "policy-map":      both("Configure QoS policy-map", { _arg: leaf("<n>  policy-map name") }),
    "class-map":       both("Configure QoS class-map", { _arg: leaf("<n>  class-map name") }),
  },

  // ── INTERFACE CONFIG ─────────────────────────────────────────────────────
  "config-if": {
    do:                DO_CMDS,
    bandwidth:         both("Set bandwidth informational parameter", { _arg: leaf("<1-10000000>  Bandwidth in kilobits") }),
    cdp:               both("CDP interface subcommands", { enable: leaf("Enable CDP on this interface") }),
    "channel-group":   node("EtherChannel/port bundling", { _arg: node("<1-64>  Channel group number", { mode: node("EtherChannel mode", { active: leaf("Enable LACP unconditionally"), passive: leaf("Enable LACP only if a LACP device is detected"), on: leaf("Enable EtherChannel only"), desirable: leaf("Enable PAgP unconditionally"), auto: leaf("Enable PAgP only if a PAgP device is detected") }) }) }),
    "channel-protocol":node("Select the channel protocol", { lacp: leaf("Prepare interface for LACP protocol"), pagp: leaf("Prepare interface for PAgP protocol") }),
    description:       both("Interface specific description", { _arg: leaf("<line>  Up to 240 characters describing this interface") }),
    duplex:            node("Configure duplex operation", { auto: leaf("Auto duplex negotiation"), full: leaf("Force full duplex operation"), half: leaf("Force half-duplex operation") }),
    encapsulation:     node("Set encapsulation type for an interface", { dot1q: node("IEEE 802.1Q Virtual LAN", { _arg: both("<1-4094>  IEEE 802.1Q VLAN ID", { native: leaf("Make this as native VLAN") }) }) }),
    interface:         node("Select another interface", { ethernet: node("Ethernet", { ...IFACE_NUMS }), gigabitethernet: node("GigabitEthernet", { _arg: leaf("<slot/port>") }), _arg: leaf("<interface>  Interface name") }),
    ip: node("Interface Internet Protocol config commands", {
      "access-group":  node("Specify access control for packets", { _arg: node("<acl>  Access list name", { in: leaf("Inbound packets"), out: leaf("Outbound packets") }) }),
      address:         both("Set the IP address of an interface", { _arg: node("<A.B.C.D>  IP address", { _arg: leaf("<A.B.C.D>  IP subnet mask") }), dhcp: both("IP Address negotiated via DHCP", { hostname: leaf("<hostname>  Send hostname to DHCP server") }), secondary: leaf("Make this IP address a secondary address") }),
      arp:             node("ARP commands", { inspection: node("ARP inspection", { trust: leaf("Configure trust state for Dynamic ARP Inspection"), limit: both("Rate limit ARP", { rate: both("<0-2048>  Rate in packets/second", { burst: leaf("Set burst interval") }) }) }), "timeout": leaf("<0-2147483>  ARP cache timeout") }),
      dhcp:            node("DHCP on interface commands", { snooping: node("DHCP Snooping interface subcommands", { trust: leaf("Configure interface as trusted"), limit: node("Rate limit DHCP packets", { rate: leaf("<1-2048>  Rate in packets/second") }) }) }),
      "helper-address":both("Specify a destination address for UDP broadcasts", { _arg: leaf("<A.B.C.D>  IP destination address") }),
      nat:             node("NAT interface commands", { inside: leaf("Inside interface for address translation"), outside: leaf("Outside interface for address translation") }),
      ospf:            both("OSPF interface commands", {
        _arg:          node("<1-65535>  Process ID", { area: node("Set the OSPF area ID", { _arg: leaf("<0-4294967295>  OSPF area ID") }) }),
        authentication: both("Enable authentication", { "message-digest": leaf("Use MD5 authentication") }),
        cost:          node("Interface cost", { _arg: leaf("<1-65535>  Route cost of this interface") }),
        "dead-interval": both("Interval after which neighbor is declared dead", { _arg: leaf("<1-65535>  Seconds"), minimal: leaf("Set to 1 second") }),
        "hello-interval": node("Time between HELLO packets", { _arg: leaf("<1-65535>  Seconds") }),
        "message-digest-key": node("MD5 authentication key", { _arg: node("<1-255>  Key ID", { md5: leaf("<key>  Authentication key") }) }),
        network:       node("OSPF network type", { "broadcast": leaf("Specify OSPF broadcast multi-access network"), "non-broadcast": leaf("OSPF non-broadcast network"), "point-to-multipoint": leaf("OSPF point-to-multipoint network"), "point-to-point": leaf("OSPF point-to-point network") }),
        priority:      node("Router priority", { _arg: leaf("<0-255>  Priority - used in designated router election") }),
        "retransmit-interval": node("Time between retransmitting unacknowledged LSAs", { _arg: leaf("<1-65535>  Seconds") }),
        "transmit-delay": node("Estimated time to send link-state updates", { _arg: leaf("<1-65535>  Seconds") }),
      }),
      "proxy-arp":     leaf("Enable proxy ARP"),
      "redirects":     leaf("Send ICMP redirect messages"),
      "verify":        node("Verify source addresses", { unicast: node("Unicast RPF", { source: node("Reachability", { reachability: leaf("Check source reachability") }) }) }),
    }),
    ipv6:              node("IPv6 interface subcommands", {
      address:         both("Configure IPv6 address", {
        _arg:          both("<X:X:X:X::X/n>  IPv6 prefix", { "eui-64": leaf("Use 64-bit Extended Unique Identifier (EUI-64)"), anycast: leaf("Configure as an anycast address") }),
        autoconfig:    leaf("Obtain address using autoconfiguration"),
        dhcp:          leaf("Obtain address using DHCP"),
      }),
      enable:          leaf("Enable IPv6 processing"),
      nd:              node("IPv6 Neighbor Discovery", { ra: node("Router advertisement", { suppress: leaf("Suppress IPv6 Router Advertisements"), interval: leaf("<4-1800>  RA interval in seconds") }) }),
      ospf:            both("OSPF interface commands", { _arg: node("<1-65535>  Process ID", { area: node("OSPF area", { _arg: leaf("<0-4294967295>  Area ID") }) }) }),
    }),
    keepalive:         both("Enable keepalive", { _arg: leaf("<0-32767>  Keepalive period (default 10 seconds)") }),
    lldp:              both("LLDP interface subcommands", { transmit: leaf("Enable LLDP transmission on this interface"), receive: leaf("Enable LLDP reception on this interface") }),
    "media-type":      node("Set the interface media type", { rj45: leaf("Force RJ45 connector type"), sfp: leaf("Force SFP connector type"), auto: leaf("Auto select interface media type") }),
    mtu:               both("Set the interface Maximum Transmission Unit (MTU)", { _arg: leaf("<64-9216>  MTU size in bytes") }),
    negotiation:       node("Select link speed and duplex negotiation", { auto: leaf("Enable link autonegotiation") }),
    "no":              node("Negate a command or set its defaults", {
      bandwidth:       leaf("Reset bandwidth to default"),
      cdp:             node("CDP commands", { enable: leaf("Disable CDP on this interface") }),
      description:     leaf("Remove interface description"),
      duplex:          leaf("Reset to default duplex"),
      "channel-group": leaf("Remove interface from channel group"),
      ip:              node("IP commands", { address: leaf("Remove IP address"), nat: leaf("Remove NAT designation"), ospf: leaf("Remove OSPF from interface"), "helper-address": leaf("Remove helper address"), "proxy-arp": leaf("Disable proxy ARP"), "access-group": leaf("Remove access group") }),
      ipv6:            node("IPv6 commands", { address: leaf("Remove IPv6 address"), enable: leaf("Disable IPv6 processing"), ospf: leaf("Remove OSPFv3") }),
      keepalive:       leaf("Disable keepalive"),
      lldp:            node("LLDP commands", { transmit: leaf("Disable LLDP transmission on this interface"), receive: leaf("Disable LLDP reception on this interface") }),
      mtu:             leaf("Reset MTU to default"),
      negotiation:     leaf("Disable auto negotiation"),
      shutdown:        leaf("Bring up the interface"),
      speed:           leaf("Reset to default speed"),
      standby:         both("Remove HSRP configuration", { _arg: leaf("<0-255>  Group number") }),
      switchport:      leaf("Put interface in routed mode (L3)"),
      "spanning-tree": node("STP commands", { portfast: leaf("Disable PortFast on this interface"), bpduguard: leaf("Disable BPDU Guard"), bpdufilter: leaf("Disable BPDU filter"), cost: leaf("Reset STP cost to default"), priority: leaf("Reset STP priority") }),
      "storm-control": leaf("Remove storm control"),
      "service-policy": leaf("Remove service policy"),
    }),
    shutdown:          leaf("Shutdown the selected interface"),
    "spanning-tree":   both("Spanning tree commands", {
      bpduguard:       both("Don't accept BPDUs on this interface", { enable: leaf("Enable BPDU guard"), disable: leaf("Disable BPDU guard") }),
      bpdufilter:      both("Don't send or receive BPDUs on this interface", { enable: leaf("Enable BPDU filter"), disable: leaf("Disable BPDU filter") }),
      cost:            node("Change an interface's spanning tree port path cost", { _arg: leaf("<1-200000000>  Port path cost") }),
      guard:           node("Change an interface's spanning tree guard mode", { root: leaf("Enable root guard"), loop: leaf("Enable loop guard"), none: leaf("Disable guard") }),
      link:            node("Specify the spanning tree link type", { point: leaf("Point-to-point link"), shared: leaf("Shared link type") }),
      portfast:        both("Portfast options", { disable: leaf("Disable portfast for this interface"), trunk: leaf("Enable portfast on a trunk interface") }),
      priority:        node("Change an interface's spanning tree port priority", { _arg: leaf("<0-240>  Port priority in increments of 16") }),
      vlan:            node("VLAN options for spanning tree", { _arg: node("<1-4094>  VLAN number", { cost: leaf("<1-200000000>  Cost"), priority: leaf("<0-240>  Priority") }) }),
    }),
    speed:             node("Configure speed operation", { auto: leaf("Enable automatic speed negotiation"), "10": leaf("Force 10 Mbps operation"), "100": leaf("Force 100 Mbps operation"), "1000": leaf("Force 1000 Mbps operation"), "10000": leaf("Force 10000 Mbps operation") }),
    "service-policy":  node("Configure QoS service policy", {
      input:           node("Assign policy-map to the input of an interface", { _arg: leaf("<policy-map-name>  policy-map name") }),
      output:          node("Assign policy-map to the output of an interface", { _arg: leaf("<policy-map-name>  policy-map name") }),
    }),
    standby:           both("HSRP configuration", {
      _arg: node("<0-255>  Group number", {
        authentication: leaf("<word>  Authentication string"),
        ip:            both("<A.B.C.D>  Virtual IP address", { secondary: leaf("Make this IP address a secondary virtual IP address") }),
        preempt:       both("Overthrow lower priority Active routers", { delay: leaf("Wait before preempting") }),
        priority:      leaf("<0-255>  Priority level"),
        timers:        both("Hello and hold timers", { _arg: leaf("<1-254>  Hello interval in seconds") }),
        track:         both("Priority tracking", { _arg: leaf("<1-1000>  Track object number") }),
        version:       node("HSRP version", { "1": leaf("HSRP version 1"), "2": leaf("HSRP version 2") }),
      }),
    }),
    "storm-control":   node("Storm control", {
      broadcast:       node("Broadcast address storm control", { level: both("Set threshold levels", { _arg: both("<0.00-100.00>  Rising threshold level in percent", { _arg: leaf("<0.00-100.00>  Falling threshold level") }) }) }),
      multicast:       node("Multicast address storm control", { level: leaf("<0.00-100.00>  Rising threshold level") }),
      unicast:         node("Unicast storm control", { level: leaf("<0.00-100.00>  Rising threshold level") }),
      action:          node("Action to take for storm-controlled traffic", { shutdown: leaf("Shutdown this interface if a storm occurs"), trap: leaf("Send SNMP trap if a storm occurs") }),
    }),
    switchport:        node("Set switching mode characteristics", {
      access:          node("Set access mode characteristics of the interface", { vlan: node("Set VLAN when interface is in access mode", { _arg: leaf("<1-4094>  VLAN ID of the VLAN when this port is in access mode") }) }),
      mode:            node("Set trunking mode of the interface", {
        access:        leaf("Set trunking mode to ACCESS unconditionally"),
        trunk:         leaf("Set trunking mode to TRUNK unconditionally"),
        dynamic:       node("Set trunking mode to dynamically negotiate", { auto: leaf("Set mode to DYNAMIC AUTO"), desirable: leaf("Set mode to DYNAMIC DESIRABLE") }),
        "dot1q-tunnel":leaf("Set trunking mode to TUNNEL unconditionally"),
      }),
      nonegotiate:     leaf("Device will not engage in negotiation protocol on this interface"),
      "port-security": both("Security related command", {
        maximum:       node("Max secure addresses", { _arg: both("<1-3072>  Maximum addresses", { vlan: leaf("Per-VLAN maximum addresses") }) }),
        violation:     node("Security violation mode", { protect: leaf("Security violation protect mode"), restrict: leaf("Security violation restrict mode"), shutdown: both("Security violation shutdown mode", { vlan: leaf("Shutdown VLAN on security violation") }) }),
        "mac-address": both("Secure mac address", { sticky: both("Configure dynamic secure addresses as sticky", {}), _arg: leaf("<H.H.H>  48-bit hardware address") }),
        aging:         node("Port-security aging commands", { time: both("<1-1440>  Aging time in minutes", {}), type: node("Aging type", { absolute: leaf("Absolute aging (default)"), inactivity: leaf("Inactivity aging") }) }),
      }),
      protected:       leaf("Configure an interface to be a protected port"),
      trunk:           node("Set trunking characteristics of the interface", {
        allowed:       node("Set allowed VLANs when interface is in trunking mode", { vlan: node("Set allowed VLANs", { _arg: leaf("<vlan-list>  VLAN IDs of the allowed VLANs"), add: leaf("<vlan-list>  VLANs to add to the current list"), remove: leaf("<vlan-list>  VLANs to remove from the current list"), except: leaf("<vlan-list>  All VLANs except the following"), all: leaf("All VLANs"), none: leaf("No VLANs") }) }),
        encapsulation: node("Set trunking encapsulation when interface is in trunking mode", { dot1q: leaf("Interface uses only 802.1q trunking encapsulation"), isl: leaf("Interface uses only ISL trunking encapsulation"), negotiate: leaf("Device will negotiate trunking encapsulation with peer") }),
        native:        node("Set trunking native characteristics when interface is in trunking mode", { vlan: node("Set native VLAN when interface is in trunking mode", { _arg: leaf("<1-4094>  VLAN ID of the native VLAN") }) }),
        pruning:       node("Set pruning when interface is in trunking mode", { vlan: leaf("<vlan-list>  VLAN IDs to set pruning eligibility") }),
      }),
      voice:           node("Voice appliance attributes", { vlan: node("Vlan for voice traffic", { _arg: leaf("<1-4094>  Voice VLAN ID"), dot1p: leaf("Priority tagged on PVID"), none: leaf("Don't tell telephone about voice vlan"), untagged: leaf("Untagged on PVID") }) }),
    }),
  },

  // ── SUBINTERFACE CONFIG ──────────────────────────────────────────────────
  "config-subif": {
    do:                DO_CMDS,
    bandwidth:         both("Set bandwidth informational parameter", { _arg: leaf("<1-10000000>  Bandwidth in kilobits") }),
    description:       both("Interface specific description", { _arg: leaf("<line>  Up to 240 characters") }),
    encapsulation:     node("Set encapsulation type for an interface", { dot1q: node("IEEE 802.1Q Virtual LAN", { _arg: both("<1-4094>  IEEE 802.1Q VLAN ID", { native: leaf("Make this as native VLAN") }) }) }),
    ip:                node("Interface IP config", {
      address:         both("Set the IP address of an interface", { _arg: node("<A.B.C.D>  IP address", { _arg: leaf("<A.B.C.D>  IP subnet mask") }) }),
      "access-group":  node("Specify access control for packets", { _arg: node("<acl>  Access list name", { in: leaf("Inbound"), out: leaf("Outbound") }) }),
      "helper-address":both("Specify a destination address for UDP broadcasts", { _arg: leaf("<A.B.C.D>  IP destination") }),
      nat:             node("NAT interface commands", { inside: leaf("Inside interface for address translation"), outside: leaf("Outside interface for address translation") }),
      ospf:            both("OSPF interface commands", { _arg: node("<1-65535>  Process ID", { area: node("Area", { _arg: leaf("<0-4294967295>  Area ID") }) }) }),
    }),
    ipv6:              node("IPv6 subinterface config", { address: both("Configure IPv6 address", { _arg: both("<X:X:X:X::X/n>  IPv6 address", { "eui-64": leaf("Use EUI-64") }) }), enable: leaf("Enable IPv6 processing") }),
    mtu:               both("Set the interface Maximum Transmission Unit (MTU)", { _arg: leaf("<64-9216>  MTU size in bytes") }),
    "no":              node("Negate a command", { shutdown: leaf("Bring up the subinterface"), ip: node("IP commands", { address: leaf("Remove IP address"), nat: leaf("Remove NAT"), "access-group": leaf("Remove access group") }), description: leaf("Remove description"), encapsulation: leaf("Remove encapsulation") }),
    shutdown:          leaf("Shutdown the subinterface"),
  },

  // ── LINE CONFIG ──────────────────────────────────────────────────────────
  "config-line": {
    do:                DO_CMDS,
    "access-class":    node("Filter connections based on an IP access list", { _arg: node("<n>  IP access list name or number", { in: leaf("Filter incoming connections"), out: leaf("Filter outgoing connections") }) }),
    databits:          node("Set number of data bits per character", { "5": leaf("5 data bits"), "6": leaf("6 data bits"), "7": leaf("7 data bits"), "8": leaf("8 data bits") }),
    "exec-timeout":    both("Set the EXEC timeout", { _arg: both("<0-35791>  Timeout in minutes", { _arg: leaf("<0-2147483>  Timeout in seconds") }) }),
    flowcontrol:       node("Set the flow control", { hardware: leaf("Use RTS/CTS"), none: leaf("Turn off flow control"), software: leaf("Use XON/XOFF") }),
    login:             both("Enable password checking", { local: leaf("Local password checking"), tacacs: leaf("Use TACACS password checking") }),
    logging:           node("Modify message logging facilities", { synchronous: leaf("Synchronize unsolicited messages and debug output with normal output") }),
    "modem":           node("Configure the modem lines", { callin: leaf("Configure for modem dialin") }),
    "no":              node("Negate a command", { "exec-timeout": leaf("Remove the exec timeout"), logging: leaf("Remove logging"), "access-class": leaf("Remove access class"), flowcontrol: leaf("Remove flow control"), password: leaf("Remove password") }),
    parity:            node("Set terminal parity", { even: leaf("Even parity"), none: leaf("No parity"), odd: leaf("Odd parity") }),
    password:          both("Set a line password", { _arg: leaf("<password>  The password string"), "0": leaf("Unencrypted password"), "7": leaf("Encrypted password") }),
    privilege:         node("Change privilege level for line", { level: node("Assign default privilege level for line", { _arg: leaf("<0-15>  Default privilege level for line") }) }),
    "speed":           node("Set the transmit and receive speeds", { "9600": leaf("9600 bps"), "19200": leaf("19200 bps"), "38400": leaf("38400 bps"), "57600": leaf("57600 bps"), "115200": leaf("115200 bps") }),
    stopbits:          node("Set async line stop bits", { "1": leaf("One stop bit"), "1.5": leaf("One and one-half stop bits"), "2": leaf("Two stop bits") }),
    transport:         node("Define transport protocols for line", {
      input:           node("Define which protocols to use when connecting to terminal", { all: leaf("All protocols"), none: leaf("No protocols (prevents access)"), ssh: leaf("SSH protocol"), telnet: leaf("TCP/IP Telnet protocol") }),
      output:          node("Define which protocols to use for outgoing connections", { all: leaf("All protocols"), none: leaf("No protocols"), ssh: leaf("SSH protocol"), telnet: leaf("TCP/IP Telnet protocol") }),
      preferred:       node("Define the preferred protocol to use", { ssh: leaf("SSH protocol"), telnet: leaf("TCP/IP Telnet protocol") }),
    }),
  },

  // ── ROUTER CONFIG (OSPF) ─────────────────────────────────────────────────
  "config-router": {
    do:                DO_CMDS,
    area:              node("OSPF area parameters", {
      _arg: node("<0-4294967295>  OSPF area ID", {
        authentication:  both("Enable authentication", { "message-digest": leaf("Use message-digest authentication") }),
        "default-cost":  leaf("<0-16777215>  Set the summary default-cost of a NSSA/stub area"),
        nssa:            both("NSSA settings", { "no-summary": leaf("Do not send summary LSA into NSSA area"), "no-redistribution": leaf("No redistribution into this NSSA area") }),
        range:           both("Summarize routes matching address/mask", { _arg: leaf("<A.B.C.D>  Area range prefix") }),
        stub:            both("Settings for configuring the area as a stub", { "no-summary": leaf("Do not send summary LSA into stub area") }),
        "virtual-link":  both("Virtual link to OSPF area", { _arg: leaf("<A.B.C.D>  ID (IP addr) associated with virtual link neighbor") }),
      }),
    }),
    "auto-cost":       node("Calculate OSPF interface cost according to bandwidth", { "reference-bandwidth": node("Use reference bandwidth method to assign OSPF cost", { _arg: leaf("<1-4294967>  The reference bandwidth in Mbits/sec") }) }),
    capability:        node("Enable specific OSPF topology capability", { "lls": leaf("Enable link-local signaling (LLS) support"), "opaque": leaf("Enable OSPF LSA opaque capability") }),
    "default-information": node("Control distribution of default information", {
      originate:       both("Distribute a default route", { always: leaf("Always advertise default route even if no default exists"), metric: both("<0-16777214>  OSPF default metric", {}), "metric-type": node("OSPF metric type for default routes", { "1": leaf("OSPF external type 1 metric"), "2": leaf("OSPF external type 2 metric") }) }),
    }),
    "default-metric":  both("Set metric of redistributed routes", { _arg: leaf("<1-16777214>  Default metric") }),
    distance:          both("Define an administrative distance", {
      _arg:            both("<1-255>  Administrative distance", {}),
      ospf:            node("OSPF distance", { intra: leaf("<1-255>  Intra-area distance"), inter: leaf("<1-255>  Inter-area distance"), external: leaf("<1-255>  External route distance") }),
    }),
    "log-adjacency-changes": both("Log changes in adjacency state", { detail: leaf("Log all state changes") }),
    "max-lsa":         both("Maximum number of non-self-generated LSAs", { _arg: leaf("<1-4294967295>  Maximum number of LSAs") }),
    network:           node("Enable routing on an IP network", {
      _arg: node("<A.B.C.D>  Network number", {
        _arg: node("<A.B.C.D>  OSPF wild card bits", {
          area: node("Set the OSPF area ID", { _arg: leaf("<0-4294967295>  OSPF area ID as a decimal value") }),
        }),
      }),
    }),
    "no":              node("Negate a command or set its defaults", {
      area:            both("Remove area parameters", { _arg: leaf("<area-id>  OSPF area ID") }),
      "auto-cost":     leaf("Reset auto-cost reference bandwidth"),
      "default-information": leaf("Remove default information originate"),
      distance:        leaf("Reset administrative distance"),
      "log-adjacency-changes": leaf("Remove adjacency logging"),
      network:         both("Remove network statement", { _arg: leaf("<A.B.C.D>  Network number") }),
      "passive-interface": both("Restore interface to active routing", { _arg: leaf("<interface>  Interface name"), default: leaf("Restore all interfaces to active routing") }),
      redistribute:    both("Remove redistribution", { _arg: leaf("<protocol>  Protocol") }),
      "router-id":     leaf("Remove router ID"),
    }),
    "passive-interface": both("Suppress routing updates on an interface", { _arg: leaf("<interface>  Interface name"), default: leaf("Suppress routing updates on all interfaces") }),
    redistribute:      node("Redistribute information from another routing protocol", {
      bgp:             both("Border Gateway Protocol (BGP)", { _arg: leaf("<1-65535>  AS number") }),
      connected:       both("Connected routes", { subnets: leaf("Consider subnets for redistribution into OSPF") }),
      eigrp:           both("Enhanced Interior Gateway Routing Protocol (EIGRP)", { _arg: leaf("<1-65535>  AS number") }),
      rip:             both("Routing Information Protocol (RIP)", { subnets: leaf("Consider subnets for redistribution into OSPF") }),
      static:          both("Static routes", { subnets: leaf("Consider subnets for redistribution into OSPF") }),
    }),
    "router-id":       node("Override configured router ID", { _arg: leaf("<A.B.C.D>  OSPF router-id in IP address format") }),
    "summary-address": both("Configure IP address summaries", { _arg: node("<A.B.C.D>  Summary prefix", { _arg: leaf("<A.B.C.D>  Summary mask") }) }),
    "timers":          node("Adjust routing timers", {
      spf:             both("SPF timers", { _arg: both("<0-4294967295>  Delay in seconds", { _arg: leaf("<0-4294967295>  Hold time in seconds") }) }),
      lsa:             both("OSPF LSA timers", { arrival: leaf("<0-600000>  Minimum delay in msec for accepting an LSA") }),
    }),
  },

  // ── ROUTER RIP CONFIG ────────────────────────────────────────────────────
  "config-router-rip": {
    do:                   DO_CMDS,
    network:              both("Enable routing on an IP network", { _arg: leaf("<A.B.C.D>  Network number") }),
    version:              node("Set routing protocol version", { "1": leaf("RIP version 1"), "2": leaf("RIP version 2") }),
    "passive-interface":  both("Suppress routing updates on an interface", { _arg: leaf("<interface>  Interface name"), default: leaf("Suppress on all interfaces") }),
    "no":                 node("Negate a command", {
      "passive-interface": node("Restore interface to active routing", { _arg: leaf("<interface>"), default: leaf("Restore all interfaces") }),
      network:             leaf("<A.B.C.D>  Remove network"),
      "auto-summary":      leaf("Disable auto-summary"),
    }),
    "auto-summary":       leaf("Enable automatic network number summarization"),
    "no auto-summary":    leaf("Disable automatic summarization"),
    redistribute:         node("Redistribute information from another routing protocol", {
      connected:          both("Connected routes", { metric: leaf("<0-16777214>  Metric") }),
      static:             both("Static routes", { metric: leaf("<0-16777214>  Metric") }),
      ospf:               both("OSPF routes", { _arg: leaf("<1-65535>  Process ID") }),
    }),
    "default-information": node("Control distribution of default information", {
      originate:          leaf("Distribute a default route"),
    }),
    timers:               node("Adjust routing timers", {
      basic:              both("<update>  Timers", { _arg: both("<0-4294967295>  Update timer", { _arg: both("<0-4294967295>  Invalid timer", { _arg: leaf("<0-4294967295>  Flush timer") }) }) }),
    }),
  },

  // ── ROUTER EIGRP CONFIG ──────────────────────────────────────────────────
  "config-router-eigrp": {
    do:                   DO_CMDS,
    network:              both("Enable routing on an IP network", {
      _arg:               both("<A.B.C.D>  Network number", { _arg: leaf("<A.B.C.D>  EIGRP wild card bits") }),
    }),
    "passive-interface":  both("Suppress routing updates on an interface", { _arg: leaf("<interface>  Interface name"), default: leaf("Suppress on all interfaces") }),
    "no":                 node("Negate a command", {
      "passive-interface": node("Restore interface", { _arg: leaf("<interface>"), default: leaf("Restore all") }),
      "auto-summary":      leaf("Disable auto-summary"),
      network:             leaf("<A.B.C.D>  Remove network"),
    }),
    "auto-summary":       leaf("Enable automatic network number summarization"),
    "eigrp":              node("EIGRP specific commands", {
      "router-id":        both("Router ID for this EIGRP process", { _arg: leaf("<A.B.C.D>  EIGRP router-id in IP address format") }),
      "stub":             both("Set EIGRP as a stub router", { connected: leaf("Advertise connected routes"), summary: leaf("Advertise summary routes"), redistributed: leaf("Advertise redistributed routes") }),
    }),
    "variance":           both("Control load balancing variance", { _arg: leaf("<1-128>  Metric variance multiplier") }),
    "maximum-paths":      both("Forward packets over multiple paths", { _arg: leaf("<1-32>  Number of paths") }),
    redistribute:         node("Redistribute from another protocol", {
      connected:          both("Connected", { metric: leaf("<bw delay rel load mtu>  EIGRP metric") }),
      static:             both("Static routes", { metric: leaf("<bw delay rel load mtu>  EIGRP metric") }),
      ospf:               both("OSPF routes", { _arg: leaf("<1-65535>  Process ID") }),
    }),
    "router-id":          both("Router ID", { _arg: leaf("<A.B.C.D>  EIGRP router-id") }),
  },

  // ── VLAN CONFIG ──────────────────────────────────────────────────────────
  "config-vlan": {
    do:                DO_CMDS,
    "media":           node("VLAN specific media type token", { ethernet: leaf("Ethernet") }),
    mtu:               both("VLAN Maximum Transmission Unit", { _arg: leaf("<1500-9216>  MTU value in bytes") }),
    name:              both("Ascii name of the VLAN", { _arg: leaf("<WORD>  The ASCII name for the VLAN") }),
    "no":              node("Negate a command or set its defaults", { name: leaf("Remove VLAN name"), mtu: leaf("Reset VLAN MTU"), state: leaf("Reset VLAN state") }),
    private:           node("Private VLANs", { vlan: node("Private VLAN type", { community: leaf("Community type"), isolated: leaf("Isolated type"), primary: leaf("Primary type") }) }),
    remote:            node("Remote SPAN VLAN", { span: leaf("Configure VLAN as Remote SPAN VLAN") }),
    state:             node("Operational state of the VLAN", { active: leaf("VLAN Active State"), suspend: leaf("VLAN Suspended State") }),
  },

  // ── ACL CONFIG (standard) ────────────────────────────────────────────────
  "config-acl": {
    do:                DO_CMDS,
    permit:            node("Specify packets to forward", { ...STD_SRC }),
    deny:              node("Specify packets to reject", { ...STD_SRC }),
    remark:            both("Access list entry comment", { _arg: leaf("<text>  Comment up to 100 characters") }),
    "no":              node("Negate a command or set its defaults", { _arg: leaf("<1-2147483647>  Sequence number of the entry to delete") }),
  },

  // ── ACL CONFIG (extended) ────────────────────────────────────────────────
  "config-ext-acl": {
    do:                DO_CMDS,
    permit:            node("Specify packets to forward", { ...EXT_PROTO }),
    deny:              node("Specify packets to reject", { ...EXT_PROTO }),
    remark:            both("Access list entry comment", { _arg: leaf("<text>  Comment up to 100 characters") }),
    "no":              node("Negate a command or set its defaults", { _arg: leaf("<1-2147483647>  Sequence number of the entry to delete") }),
  },

  // ── DHCP POOL CONFIG ─────────────────────────────────────────────────────
  "config-dhcp": {
    do:                DO_CMDS,
    "bootfile":        both("Boot file name", { _arg: leaf("<filename>  Boot file name") }),
    "default-router":  both("Default routers", { _arg: both("<A.B.C.D>  Router's IP address", { _arg: leaf("<A.B.C.D>  Router's IP address 2") }) }),
    "dns-server":      both("DNS servers", { _arg: both("<A.B.C.D>  DNS server's IP address", { _arg: leaf("<A.B.C.D>  DNS server's IP address 2") }) }),
    "domain-name":     both("Domain name", { _arg: leaf("<domain>  Domain name") }),
    "hardware-address": both("Client hardware address", { _arg: leaf("<H.H.H>  Client hardware (MAC) address") }),
    "host":            both("Client IP address and mask", { _arg: node("<A.B.C.D>  Client IP address", { _arg: leaf("<A.B.C.D>  Client IP subnet mask") }) }),
    lease:             both("Lease time", { _arg: both("<0-365>  Days", { _arg: both("<0-23>  Hours", { _arg: leaf("<0-59>  Minutes") }) }), infinite: leaf("Infinite lease") }),
    network:           both("Network number and mask", { _arg: node("<A.B.C.D>  Network number", { _arg: leaf("<A.B.C.D>  Network mask") }) }),
    "next-server":     both("Next server IP address", { _arg: leaf("<A.B.C.D>  Server's IP address") }),
    "no":              node("Negate a command or set its defaults", { "default-router": leaf("Remove default router"), "dns-server": leaf("Remove DNS server"), "domain-name": leaf("Remove domain name"), network: leaf("Remove network"), host: leaf("Remove client host") }),
    option:            both("Raw DHCP options", { _arg: leaf("<0-254>  DHCP option code") }),
    "update":          node("Update DHCP", { arp: leaf("Enable ARP for IP address assignment") }),
    "utilization":     node("Set DHCP pool utilization mark", { mark: node("Set utilization mark", { high: leaf("<1-100>  High mark in %"), low: leaf("<1-100>  Low mark in %") }) }),
  },
};

// ─── LOOKUP FUNCTION ──────────────────────────────────────────────────────────
export function lookupCmd(input, mode) {
  const tree = CMD_TREE[mode] || {};
  const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const endsWithSpace = input.endsWith(" ");

  let current = tree;
  let i = 0;

  while (i < words.length) {
    const word = words[i];
    const isLast = i === words.length - 1;

    if (isLast && !endsWithSpace) {
      const matches = Object.entries(current)
        .filter(([k]) => !k.startsWith("_") && k.startsWith(word))
        .map(([k, v]) => ({ word: k, desc: v._desc || "" }));
      return { matches, partial: word };
    }

    if (current[word]) { current = current[word]; i++; continue; }

    const abbrevMatches = Object.keys(current).filter(k => !k.startsWith("_") && k.startsWith(word));
    if (abbrevMatches.length === 1) { current = current[abbrevMatches[0]]; i++; continue; }

    if (current._arg) { current = current._arg; i++; continue; }

    return { matches: [], partial: word };
  }

  const matches = Object.entries(current)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => ({ word: k, desc: v._desc || "" }));

  if (current._eol) matches.push({ word: "<cr>", desc: "" });
  if (current._arg) matches.push({ word: current._arg._desc || "<value>", desc: "" });

  return { matches, partial: "" };
}

