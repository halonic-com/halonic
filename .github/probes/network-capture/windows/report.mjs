// Reads a Windows capture folder (capture.pcapng from pktmon, processes.json
// from sample.ps1, session.json and control.json) and writes a Markdown report
// on stdout. Exits 1 when a Halonic program sent anything but the update
// check to GitHub, or when the control isn't in the capture.
//
// pktmon's packets name no process, so each packet is matched to the
// connection `netstat` sampled with the same addresses and ports at that time,
// and that connection's process is put in one of three groups:
//   - Halonic: the installer, a program in the install folder, or a program
//     one of those started (but not WebView2);
//   - WebView2: msedgewebview2.exe;
//   - Windows and others: everything else (the runner, DNS, updates).
// DNS goes out from a Windows service, so lookups land in the last group. A
// packet whose connection was never sampled is listed on its own.
//
// Usage: report.mjs <capture folder>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const read = (name) => {
  try {
    return readFileSync(join(dir, name));
  } catch {
    return undefined;
  }
};
const json = (name) => {
  const text = read(name)?.toString("utf8").replace(/^﻿/, "");
  return text ? JSON.parse(text) : undefined;
};
const problems = [];

/** Packets of a pcapng file: { time (ms), frame } for each enhanced packet block. */
export function readPcapng(buffer) {
  const packets = [];
  const resolutions = [];
  for (let at = 0; at + 12 <= buffer.length; ) {
    const type = buffer.readUInt32LE(at);
    const length = buffer.readUInt32LE(at + 4);
    if (length < 12 || at + length > buffer.length) break;
    if (type === 0x0a0d0d0a && buffer.readUInt32LE(at + 8) !== 0x1a2b3c4d)
      throw new Error("The capture isn't little-endian pcapng.");
    if (type === 1) {
      // Interface description: the options may hold if_tsresol (code 9).
      let resolution = 1e6;
      for (let o = at + 16; o + 4 <= at + length - 4; ) {
        const code = buffer.readUInt16LE(o);
        const size = buffer.readUInt16LE(o + 2);
        if (code === 0) break;
        if (code === 9) {
          const v = buffer[o + 4];
          resolution = v & 0x80 ? 2 ** (v & 0x7f) : 10 ** v;
        }
        o += 4 + Math.ceil(size / 4) * 4;
      }
      resolutions.push(resolution);
    } else if (type === 6) {
      const iface = buffer.readUInt32LE(at + 8);
      const ticks = buffer.readUInt32LE(at + 12) * 2 ** 32 + buffer.readUInt32LE(at + 16);
      const size = buffer.readUInt32LE(at + 20);
      packets.push({
        time: (ticks / (resolutions[iface] ?? 1e6)) * 1000,
        frame: buffer.subarray(at + 28, at + 28 + size),
      });
    }
    at += length;
  }
  return packets;
}

const ip4 = (b, at) => `${b[at]}.${b[at + 1]}.${b[at + 2]}.${b[at + 3]}`;
/** The compressed, lower-case form of an address, so capture and netstat agree. */
export function normalize(address) {
  const bare = address.replace(/%.*$/, "").replace(/^\[|\]$/g, "");
  return bare.includes(":") ? new URL(`http://[${bare}]`).hostname.slice(1, -1) : bare;
}
const ip6 = (b, at) =>
  normalize(
    Array.from({ length: 8 }, (_, i) => b.readUInt16BE(at + i * 2).toString(16)).join(":"),
  );

/** An Ethernet frame to { proto, src, dst, sport, dport, flags, payload } or { other }. */
export function decode(frame) {
  let at = 12;
  let ethertype = frame.readUInt16BE(at);
  if (ethertype === 0x8100) {
    at += 4;
    ethertype = frame.readUInt16BE(at);
  }
  at += 2;
  let proto;
  let src;
  let dst;
  if (ethertype === 0x0800) {
    proto = frame[at + 9];
    src = ip4(frame, at + 12);
    dst = ip4(frame, at + 16);
    at += (frame[at] & 15) * 4;
  } else if (ethertype === 0x86dd) {
    proto = frame[at + 6];
    src = ip6(frame, at + 8);
    dst = ip6(frame, at + 24);
    at += 40;
  } else return { other: ethertype === 0x0806 ? "ARP" : `ethertype 0x${ethertype.toString(16)}` };
  if (proto !== 6 && proto !== 17) return { other: `IP protocol ${proto}`, src, dst };
  const out = { proto: proto === 6 ? "TCP" : "UDP", src, dst, sport: frame.readUInt16BE(at), dport: frame.readUInt16BE(at + 2) };
  if (proto === 6) {
    out.flags = frame[at + 13];
    out.payload = frame.subarray(at + ((frame[at + 12] >> 4) * 4));
  } else out.payload = frame.subarray(at + 8);
  return out;
}

/** The names and addresses in a DNS message: { questions, answers: [[name, address]] }. */
export function parseDns(m) {
  const result = { questions: [], answers: [] };
  try {
    const name = (start) => {
      const labels = [];
      let at = start;
      let end;
      for (let hops = 0; hops < 20; hops++) {
        const n = m[at];
        if (n === 0) return [labels.join("."), end ?? at + 1];
        if (n >= 0xc0) {
          end ??= at + 2;
          at = ((n & 0x3f) << 8) | m[at + 1];
        } else {
          labels.push(m.toString("latin1", at + 1, at + 1 + n));
          at += 1 + n;
        }
      }
      throw new Error("loop");
    };
    let at = 12;
    for (let i = 0; i < m.readUInt16BE(4); i++) {
      const [q, next] = name(at);
      result.questions.push(q);
      at = next + 4;
    }
    for (let i = 0; i < m.readUInt16BE(6); i++) {
      const [owner, next] = name(at);
      const type = m.readUInt16BE(next);
      const size = m.readUInt16BE(next + 8);
      const data = next + 10;
      if (type === 1 && size === 4) result.answers.push([owner, ip4(m, data)]);
      if (type === 28 && size === 16) result.answers.push([owner, ip6(m, data)]);
      at = data + size;
    }
  } catch {
    // A message that doesn't parse gives what it gave so far.
  }
  return result;
}

const session = json("session.json");
const control = json("control.json");
if (control?.address) control.address = normalize(control.address);
const samples = json("processes.json");
const pcap = read("capture.pcapng");
if (!session) problems.push("There is no session.json: the capture script stopped early.");
if (!pcap || pcap.length === 0) problems.push("There is no capture.");
if (!samples) problems.push("There are no process samples (processes.json).");
if (!control) problems.push("The control never ran: there is no control.json.");
else if (!control.ok) problems.push(`The control fetch failed: ${control.error ?? "no answer"}.`);

const packets = pcap && pcap.length > 0 ? readPcapng(pcap).map((p) => ({ time: p.time, ...decode(p.frame) })) : [];
const WINDOW = 1500;
const installDir = (session?.installDir ?? "\0").toLowerCase();
const setup = (session?.setup ?? "\0").toLowerCase();
const table = samples?.processes ?? [];
const processAt = (pid, time) =>
  table.filter((p) => p.pid === pid).find((p) => p.first - WINDOW <= time && time <= p.last + WINDOW) ??
  table.find((p) => p.pid === pid);
const isHalonicProgram = (p) => {
  const path = (p.path ?? "").toLowerCase();
  return path === setup || path.startsWith(installDir);
};
/** Halonic, WebView2 or Windows and others, for a process and its parents. */
function groupOf(process, time) {
  if (/^msedgewebview2\.exe$/i.test(process.name)) return "WebView2";
  for (let p = process, hops = 0; p && hops < 20; hops++) {
    if (isHalonicProgram(p)) return "Halonic";
    p = processAt(p.ppid, time);
  }
  return "Windows and others";
}

const endpointKey = (address, port) => `${normalize(address)}:${port}`;
const wildcard = (a) => a === "0.0.0.0" || a === "::" || a === "*";
const connections = (samples?.connections ?? []).map((c) => {
  const split = (s) => {
    const i = s.lastIndexOf(":");
    return [s.slice(0, i), s.slice(i + 1)];
  };
  const [la, lp] = split(c.local);
  const [ra, rp] = split(c.remote);
  return { ...c, la: wildcard(la) ? la : normalize(la), lp, ra: ra === "*" ? ra : normalize(ra), rp };
});
const connectionOf = (p) =>
  connections
    .filter((c) => c.proto === p.proto && c.pid > 0 && c.first - WINDOW <= p.time && p.time <= c.last + WINDOW)
    .filter((c) => {
      const sends = String(p.sport) === c.lp && (wildcard(c.la) || c.la === p.src);
      const gets = String(p.dport) === c.lp && (wildcard(c.la) || c.la === p.dst);
      if (c.proto === "UDP") return sends || gets;
      return (sends && endpointKey(p.dst, p.dport) === `${c.ra}:${c.rp}`) || (gets && endpointKey(p.src, p.sport) === `${c.ra}:${c.rp}`);
    })
    .sort((a, b) => b.first - a.first)[0];

// DNS: every address the capture saw an answer for, and the names asked for.
const names = new Map();
const asked = new Map();
for (const p of packets) {
  if (p.proto !== "UDP" || (p.sport !== 53 && p.dport !== 53) || !p.payload || p.payload.length < 12) continue;
  const dns = parseDns(p.payload);
  for (const q of dns.questions) if (p.dport === 53) asked.set(q, (asked.get(q) ?? 0) + 1);
  for (const [name, address] of dns.answers) names.set(address, [...new Set([...(names.get(address) ?? []), name])]);
}
const nameOf = (address) => names.get(address)?.[0] ?? address;
// The update check reads latest.json from GitHub, which sends the download on to its asset hosts.
const isUpdateHost = (address) =>
  (names.get(address) ?? []).some((n) => /(^|\.)(github\.com|githubusercontent\.com)$/i.test(n));

const phaseOf = (time) =>
  Object.entries(session?.phases ?? {}).find(([, w]) => w.start <= time && time <= w.end)?.[0] ?? "between";
const lookedUp = packets.some((p) => p.proto === "UDP" && p.sport === 53 && parseDns(p.payload).answers.some(([n]) => /^example\.com$/i.test(n)));
const answers = new Set(packets.filter((p) => p.proto === "UDP" && p.sport === 53).flatMap((p) => parseDns(p.payload).answers.filter(([n]) => /^example\.com$/i.test(n)).map(([, a]) => a)));
const connected = packets.some((p) => p.proto === "TCP" && p.flags & 2 && !(p.flags & 16) && p.dst === control?.address && p.dport === 443 && p.sport === control?.localPort);
if (control?.ok) {
  if (!lookedUp) problems.push("The control's DNS lookup of example.com isn't in the capture.");
  if (!connected) problems.push(`The control's SYN to ${control.address}:443 isn't in the capture.`);
  if (control.address && !answers.has(control.address))
    problems.push(`The control connected to ${control.address}, which its lookup in the capture didn't return.`);
}

const groups = { Halonic: new Map(), WebView2: new Map(), "Windows and others": new Map(), "No process in the samples": new Map() };
const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const failures = [];
let local = 0;
let controlPackets = 0;
for (const p of packets) {
  if (p.other && !p.proto) {
    count(groups["No process in the samples"], `${p.other}${p.src ? ` ${p.src} → ${p.dst}` : ""} · ${phaseOf(p.time)}`);
    continue;
  }
  if (normalize(p.src).startsWith("127.") || p.src === "::1") {
    local++;
    continue;
  }
  if (control && p.sport === control.localPort && p.proto === "TCP" && p.dst === control.address) controlPackets++;
  else if (control && p.dport === control.localPort && p.proto === "TCP" && p.src === control.address) controlPackets++;
  const server = p.sport < p.dport ? [p.src, p.sport] : [p.dst, p.dport];
  const label = `${p.proto} → ${nameOf(server[0])}:${server[1]}`;
  const connection = connectionOf(p);
  const process = connection && processAt(connection.pid, p.time);
  if (!process) {
    count(groups["No process in the samples"], `${label} · ${phaseOf(p.time)}`);
    continue;
  }
  const group = groupOf(process, p.time);
  count(groups[group], `${process.name} · ${label} · ${phaseOf(p.time)}`);
  if (group === "Halonic" && !isUpdateHost(server[0])) failures.push(`${process.name} → ${nameOf(server[0])}:${server[1]} (${phaseOf(p.time)})`);
}

const total = (m) => [...m.values()].reduce((a, b) => a + b, 0);
const rows = (m) => [...m].sort((x, y) => y[1] - x[1]).map(([k, n]) => `| ${k.replaceAll("|", "\\|")} | ${n} |`);
const section = (heading, m) => (m.size > 0 ? [`### ${heading}`, "", "| Packets | Count |", "|---|---|", ...rows(m), ""] : [`### ${heading}`, "", "none", ""]);
const out = [
  "## Session on Windows (x64)",
  "",
  `${packets.length} packets at the network cards: ${total(groups.Halonic)} from Halonic, ${total(groups.WebView2)} from WebView2, ${total(groups["Windows and others"])} from Windows and others, ${total(groups["No process in the samples"])} with no process in the samples, ${controlPackets} of them the control's. Loopback isn't captured at the cards (${local} seen).`,
  "",
  "Phases: " + Object.entries(session?.phases ?? {}).map(([n, w]) => `${n} ${Math.round((w.end - w.start) / 1000)} s`).join(", "),
  "",
  "### Control: a fetch of example.com at the end of the session",
  "",
  `- DNS lookup of example.com: ${lookedUp ? "seen" : "not seen"}${answers.size > 0 ? ` (answers: ${[...answers].join(", ")})` : ""}`,
  `- SYN to ${control?.address ?? "example.com"}:443: ${connected ? "seen" : "not seen"}`,
  "",
  "### Halonic's traffic that is not the update check",
  "",
  ...(failures.length > 0 ? [...new Set(failures)].map((f) => `- ${f}`) : ["none"]),
  "",
  ...section("Halonic (installer, app, agent host, sandbox helper)", groups.Halonic),
  ...section("WebView2, for review", groups.WebView2),
  ...section("Windows and others (runner, DNS, system), for review", groups["Windows and others"]),
  ...section("No process in the samples (short connections, ARP, closed connections), for review", groups["No process in the samples"]),
  ...section("DNS names asked for (any program)", asked),
  "### Only checked in the code, not in this capture",
  "",
  "- Onboarding: nobody clicks through it here, so the capture shows the app on its first screen. What the app does after each onboarding step is only read in the code.",
  "- Anything a signed-in or configured app sends (model providers, sign-in), and what an update does once one is found (download, install, restart).",
  "- A connection shorter than the 0.2 s sampling is never matched to a process; its packets are in the last table.",
  "",
];
if (failures.length > 0) problems.push(`Halonic sent traffic that isn't the update check (listed above).`);
if (problems.length > 0) out.push("### Problems", "", ...problems.map((p) => `- ${p}`), "");
process.stdout.write(`${out.join("\n")}\n`);
process.exitCode = problems.length > 0 ? 1 : 0;
