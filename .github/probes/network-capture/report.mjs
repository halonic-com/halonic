// Reads `tcpdump -nn -tttt [-k]` text on stdin and writes a Markdown host
// list on stdout. A packet counts as the session's when it isn't loopback
// and, where tcpdump shows the process (macOS, -k), when its process or the
// process it was sent for is one of SESSION_PROCS. A macOS packet without a
// process (a reset after its socket closed) takes the process of its
// connection; one with no connection (ARP, ICMP) is listed for review. Exits 1
// when the session sent anything, or with --expect-traffic (the control run)
// when it didn't.
// Usage: report.mjs <title> [--expect-traffic] < packets.txt
import { readFileSync } from "node:fs";

const [title = "Capture", flag] = process.argv.slice(2);
const expectTraffic = flag === "--expect-traffic";
const sessionProcs = new Set((process.env.SESSION_PROCS ?? "node").split(","));
const lines = readFileSync(0, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "");

/** "10.0.0.1.443" or "fe80::1.443" to [address, port]; a bare address has no port. */
function split(endpoint) {
  const v4 = /^(\d+\.\d+\.\d+\.\d+)(?:\.(\d+))?$/.exec(endpoint);
  if (v4) return [v4[1], v4[2]];
  const v6 = /^(.*:.*?)(?:\.(\d+))?$/.exec(endpoint);
  return v6 ? [v6[1], v6[2]] : [endpoint, undefined];
}
const isLoopback = (address) => address.startsWith("127.") || address === "::1";

const session = new Map();
const others = new Map();
const unowned = new Map();
const names = new Map();
let loopback = 0;
const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

const packets = lines.map((line) => {
  // macOS (-k) puts the interface, process and direction in brackets; Linux
  // puts the interface and direction in two columns.
  const meta = /^\S+ \S+ \(([^)]*)\)/.exec(line)?.[1];
  const proc = /(?:^|, )proc ([^:,]+)/.exec(meta ?? "")?.[1];
  const eproc = /(?:^|, )eproc ([^:,]+)/.exec(meta ?? "")?.[1];
  const ip = / (IP6?) (\S+) > (\S+?):? /.exec(line);
  // Both ends with their ports, in either direction, name the connection.
  const flow = ip && !/ ICMP6? /.test(line) ? [ip[2], ip[3]].sort().join(" ") : undefined;
  return { line, tagged: meta !== undefined, proc, eproc, ip, flow };
});
const owners = new Map();
for (const p of packets) if (p.flow && p.proc) owners.set(p.flow, p);

for (const { line, tagged, ip, flow, ...packet } of packets) {
  let key;
  let local = false;
  if (ip) {
    const [a, aPort] = split(ip[2]);
    const [b, bPort] = split(ip[3]);
    local = isLoopback(a) && isLoopback(b);
    // Name the server side: the end with the lower port.
    const server = Number(aPort ?? 1e6) < Number(bPort ?? 1e6) ? [a, aPort] : [b, bPort];
    const client = server[0] === a ? b : a;
    const proto = /\b(UDP|ICMP6?|Flags \[)/.exec(line)?.[1]?.startsWith("Flags")
      ? "TCP"
      : "UDP/other";
    key = `${proto} ${client} → ${server[0]}${server[1] ? `:${server[1]}` : ""}`;
  } else {
    key = line.replace(/^\S+ \S+ (?:\([^)]*\) |\S+\s+(?:In|Out|M|B|P)\s+)?/, "").slice(0, 80);
  }
  const query = /\s(?:A|AAAA|HTTPS|SVCB|PTR|TXT|SRV|CNAME|MX|NS|ANY)\? (\S+)/.exec(line)?.[1];
  if (query && !local) count(names, query);
  if (local) {
    loopback++;
    continue;
  }
  if (!tagged) {
    count(session, key);
    continue;
  }
  const { proc, eproc } = packet.proc ? packet : (owners.get(flow) ?? {});
  if (proc === undefined) {
    count(unowned, key);
    continue;
  }
  const who = `${proc}${eproc && eproc !== proc ? ` for ${eproc}` : ""} · `;
  const ours = sessionProcs.has(proc) || sessionProcs.has(eproc ?? "");
  count(ours ? session : others, `${who}${key}`);
}

const table = (map) =>
  [...map]
    .sort((x, y) => y[1] - x[1])
    .map(([key, n]) => `| ${key.replaceAll("|", "\\|")} | ${n} |`)
    .join("\n");
const total = (map) => [...map.values()].reduce((a, b) => a + b, 0);
const sessionTotal = total(session);
const unownedTotal = total(unowned);
const out = [
  `## ${title}`,
  "",
  `${lines.length} packets: ${loopback} on loopback, ${sessionTotal} from the session to elsewhere, ${lines.length - loopback - sessionTotal - unownedTotal} from other programs, ${unownedTotal} from no program.`,
  "",
];
if (session.size > 0)
  out.push(
    "### Session traffic off this computer",
    "",
    "| Packets | Count |",
    "|---|---|",
    table(session),
    "",
  );
if (others.size > 0)
  out.push(
    "### Other programs (the runner and the OS), for review",
    "",
    "| Packets | Count |",
    "|---|---|",
    table(others),
    "",
  );
if (unowned.size > 0)
  out.push(
    "### No program (ARP, ICMP and closed connections), for review",
    "",
    "| Packets | Count |",
    "|---|---|",
    table(unowned),
    "",
  );
if (names.size > 0)
  out.push(
    "### DNS names asked for (any program)",
    "",
    "| Name | Count |",
    "|---|---|",
    table(names),
    "",
  );
process.stdout.write(`${out.join("\n")}\n`);
process.exitCode = sessionTotal > 0 === expectTraffic ? 0 : 1;
