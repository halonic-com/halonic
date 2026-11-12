// Reads `tcpdump -nn -tttt [-k]` text (UTC) on stdin and writes a Markdown
// report on stdout. Exits 1 when the session sent anything off this computer,
// or when the control isn't in the capture.
//
// The control (control.json, from control.mjs) is a fetch of example.com at
// the end of the session. Its packets are the ones of its pid where tcpdump
// shows the process (macOS, -k); elsewhere (Linux) the ones after it started
// on its DNS lookup of example.com, on its own connection, and ARP. The
// capture must hold its lookup and a SYN to the address it connected to,
// which the lookup must have returned.
//
// Every other packet that isn't loopback is the session's on Linux, where the
// capture only sees the session's network namespace. On macOS a packet is the
// session's when its process, or the process it was sent for, is one of the
// session's (processes.mjs). A process the samples never saw that started
// after the session's first one also fails: it may be a short-lived one of
// the session's. Other processes are listed for review. A packet without a
// process (a reset after its socket closed) takes the process of its
// connection; one with no connection (ARP, ICMP) is listed for review.
//
// Usage: report.mjs <title> <control.json> [<process samples> <session pid>] < packets.txt
import { readFileSync } from "node:fs";
import { parseSamples, sessionPids } from "./processes.mjs";

const [title = "Capture", controlFile, samplesFile, rootArg] = process.argv.slice(2);
const problems = [];
const read = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
};
const control = JSON.parse(read(controlFile) ?? "null");
if (!control) problems.push("The control never ran: there is no control.json.");
else if (!control.ok) problems.push(`The control fetch failed: ${control.error ?? "no answer"}.`);
const byProcess = samplesFile !== undefined;
const root = Number(rootArg);
if (byProcess && !(root > 1))
  problems.push(`The session's first pid is missing (got "${rootArg}").`);
const samples = byProcess ? parseSamples(read(samplesFile) ?? "") : [];
if (byProcess && samples.length === 0) problems.push("There are no process samples.");
const ours = byProcess ? sessionPids(samples, root) : new Set();
const seen = new Set(samples.map((s) => s.pid));

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
const isExample = (name) => /^example\.com\./i.test(name ?? "");
/** "proc node:2831" in macOS's packet metadata to { name, pid }. */
function tag(meta, key) {
  const m = new RegExp(`(?:^|, )${key} ([^,]*):(\\d+)(?=,|$)`).exec(meta ?? "");
  return m ? { name: m[1], pid: Number(m[2]) } : undefined;
}

const packets = lines.map((line) => {
  const [, day, clock] = /^(\S+) (\d\d:\d\d:\d\d\.\d{3})/.exec(line) ?? [];
  // macOS (-k) puts the interface, process and direction in brackets; Linux
  // puts the interface and direction in two columns.
  const meta = /^\S+ \S+ \(([^)]*)\)/.exec(line)?.[1];
  const ip = / (IP6?) (\S+) > (\S+?):? /.exec(line);
  const flags = /Flags \[([^\]]*)\]/.exec(line)?.[1];
  return {
    line,
    time: Date.parse(`${day}T${clock}Z`),
    tagged: meta !== undefined,
    proc: tag(meta, "proc"),
    eproc: tag(meta, "eproc"),
    ip,
    // Both ends with their ports, in either direction, name the connection.
    flow: ip && !/ ICMP6? /.test(line) ? [ip[2], ip[3]].sort().join(" ") : undefined,
    from: ip && split(ip[2]),
    to: ip && split(ip[3]),
    query: /\s(?:A|AAAA|HTTPS|SVCB|PTR|TXT|SRV|CNAME|MX|NS|ANY)\? (\S+)/.exec(line)?.[1],
    answers: [...line.matchAll(/\b(?:A|AAAA) ([\da-f.:]+)(?=,| \()/g)].map((m) => m[1]),
    syn: flags?.includes("S") === true && !flags.includes("."),
    arp: / ARP, /.test(line),
  };
});
const owners = new Map();
for (const p of packets) if (p.flow && p.proc) owners.set(p.flow, p);
const processesOf = (p) => (p.proc ? p : (owners.get(p.flow) ?? {}));

const afterStart = (p) => control !== null && p.time >= control.start;
const isConnection = (p) =>
  control?.localPort !== undefined &&
  [p.from, p.to].some(([, port]) => Number(port) === control.localPort) &&
  [p.from, p.to].some(([a, port]) => a === control.address && port === "443");
const controlFlows = new Set(
  packets
    .filter((p) => p.flow && afterStart(p) && (isExample(p.query) || isConnection(p)))
    .map((p) => p.flow),
);
function isControl(p) {
  if (p.tagged) {
    const { proc, eproc } = processesOf(p);
    return control !== null && [proc?.pid, eproc?.pid].includes(control.pid);
  }
  return afterStart(p) && (p.arp || controlFlows.has(p.flow));
}

const session = new Map();
const unknown = new Map();
const others = new Map();
const unowned = new Map();
const names = new Map();
const controlPackets = [];
let loopback = 0;
const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

for (const p of packets) {
  let key;
  let local = false;
  if (p.ip) {
    const [a, aPort] = p.from;
    const [b, bPort] = p.to;
    local = isLoopback(a) && isLoopback(b);
    // Name the server side: the end with the lower port.
    const server = Number(aPort ?? 1e6) < Number(bPort ?? 1e6) ? [a, aPort] : [b, bPort];
    const client = server[0] === a ? b : a;
    const proto = /\b(UDP|ICMP6?|Flags \[)/.exec(p.line)?.[1]?.startsWith("Flags")
      ? "TCP"
      : "UDP/other";
    key = `${proto} ${client} → ${server[0]}${server[1] ? `:${server[1]}` : ""}`;
  } else {
    key = p.line.replace(/^\S+ \S+ (?:\([^)]*\) |\S+\s+(?:In|Out|M|B|P)\s+)?/, "").slice(0, 80);
  }
  if (p.query && !local) count(names, p.query);
  if (local) {
    loopback++;
    continue;
  }
  if (isControl(p)) {
    controlPackets.push(p);
    continue;
  }
  if (!p.tagged) {
    count(session, key);
    continue;
  }
  const { proc, eproc } = processesOf(p);
  if (proc === undefined) {
    count(unowned, key);
    continue;
  }
  const pids = [proc.pid, eproc?.pid].filter((pid) => pid !== undefined);
  const who = `${proc.name}${eproc && eproc.pid !== proc.pid ? ` for ${eproc.name}` : ""}`;
  if (pids.some((pid) => ours.has(pid))) count(session, `${who} (${pids.join(", ")}) · ${key}`);
  else if (pids.some((pid) => !seen.has(pid) && pid >= root))
    count(unknown, `${who} (${pids.join(", ")}) · ${key}`);
  else count(others, `${who} · ${key}`);
}

const lookedUp = controlPackets.some((p) => isExample(p.query));
const answers = new Set(controlPackets.flatMap((p) => p.answers));
const connected = controlPackets.some(
  (p) => p.syn && p.to?.[0] === control?.address && p.to?.[1] === "443",
);
if (control) {
  if (!lookedUp) problems.push("The control's DNS lookup of example.com isn't in the capture.");
  if (!connected)
    problems.push(
      `The control's SYN to ${control.address ?? "example.com"}:443 isn't in the capture.`,
    );
  if (control.address && !answers.has(control.address))
    problems.push(
      `The control connected to ${control.address}, which its lookup in the capture didn't return.`,
    );
}

const table = (map) =>
  [...map]
    .sort((x, y) => y[1] - x[1])
    .map(([key, n]) => `| ${key.replaceAll("|", "\\|")} | ${n} |`)
    .join("\n");
const total = (map) => [...map.values()].reduce((a, b) => a + b, 0);
const section = (heading, map) =>
  map.size > 0 ? [`### ${heading}`, "", "| Packets | Count |", "|---|---|", table(map), ""] : [];
const sessionTotal = total(session);
const unknownTotal = total(unknown);
const out = [
  `## ${title}`,
  "",
  `${lines.length} packets: ${loopback} on loopback, ${sessionTotal} from the session to elsewhere, ${unknownTotal} from unknown processes, ${controlPackets.length} from the control, ${total(others)} from other programs, ${total(unowned)} from no program.`,
  "",
  "### Control: a fetch of example.com at the end of the session",
  "",
  `- DNS lookup of example.com: ${lookedUp ? "seen" : "not seen"}${answers.size > 0 ? ` (answers: ${[...answers].join(", ")})` : ""}`,
  `- SYN to ${control?.address ?? "example.com"}:443: ${connected ? "seen" : "not seen"}`,
  "",
  ...section("Session traffic off this computer", session),
  ...section("Processes the samples never saw, started after the session began", unknown),
  ...section("Other programs (the runner and the OS), for review", others),
  ...section("No program (ARP, ICMP and closed connections), for review", unowned),
  ...section("DNS names asked for (any program)", names),
];
if (problems.length > 0) out.push("### Problems", "", ...problems.map((p) => `- ${p}`), "");
process.stdout.write(`${out.join("\n")}\n`);
process.exitCode = sessionTotal > 0 || unknownTotal > 0 || problems.length > 0 ? 1 : 0;
