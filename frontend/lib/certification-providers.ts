export const certificationProviders = [
  { name: "Cisco", mark: "cisco", area: "Networking", aliases: ["cisco"] },
  { name: "CompTIA", mark: "CompTIA", area: "IT & cybersecurity", aliases: ["comptia", "compitia"] },
  { name: "PeopleCert", mark: "PeopleCert", area: "Service management", aliases: ["peoplecert"] },
  { name: "PMI", mark: "PMI", area: "Project management", aliases: ["pmi", "projectmanagementinstitute"] },
  { name: "Oracle", mark: "ORACLE", area: "Database & cloud", aliases: ["oracle"] },
  { name: "VMware", mark: "vmware", area: "Virtualization", aliases: ["vmware"] },
  { name: "OCEG", mark: "OCEG", area: "Governance & risk", aliases: ["oceg"] },
  { name: "EC-Council", mark: "EC-Council", area: "Ethical hacking", aliases: ["eccouncil"] },
  { name: "Fortinet", mark: "FORTINET", area: "Network security", aliases: ["fortinet"] },
  { name: "Palo Alto", mark: "palo alto", area: "Cybersecurity", aliases: ["paloalto", "paloaltonetworks"] },
  { name: "ISACA", mark: "ISACA", area: "Audit & assurance", aliases: ["isaca"] },
  { name: "The Open Group", mark: "The Open Group", area: "Enterprise architecture", aliases: ["theopengroup", "opengroup"] },
  { name: "Google Cloud", mark: "Google Cloud", area: "Cloud computing", aliases: ["googlecloud", "gcp"] },
  { name: "Microsoft", mark: "Microsoft", area: "Cloud & infrastructure", aliases: ["microsoft"] },
];

export function providerCatalog(categories: string[]) {
  return certificationProviders.map(provider => {
    const matches = categories.filter(category => provider.aliases.includes(category.toLowerCase().replace(/[^a-z0-9]/g, "")));
    return { ...provider, count: matches.length, href: `/exams?${new URLSearchParams({ category: matches[0] || provider.name })}` };
  });
}
