// Reads the ETW events (tracerpt XML) of a Windows capture: the Kernel-Network
// events become flows that name the process of a connection, the Kernel-Process
// events become a process table. report.mjs matches packets to them.

/** The compressed, lower-case form of an address, so capture and netstat agree. */
export function normalize(address) {
  const bare = address.replace(/%.*$/, "").replace(/^\[|\]$/g, "");
  return bare.includes(":") ? new URL(`http://[${bare}]`).hostname.slice(1, -1) : bare;
}

/** Events of a tracerpt XML file: { provider, id, time (ms), data: {name: value} }. */
export function parseEtw(text) {
  const events = [];
  for (const m of text.matchAll(/<Event\b[^>]*>([\s\S]*?)<\/Event>/g)) {
    const body = m[1];
    const id = Number(/<EventID[^>]*>(\d+)</.exec(body)?.[1]);
    const stamp = /<TimeCreated\s+SystemTime=['"]([^'"]+)['"]/.exec(body)?.[1];
    if (!Number.isFinite(id) || !stamp) continue;
    const data = {};
    for (const d of body.matchAll(/<Data\s+Name=['"]([^'"]+)['"][^>]*?(?:\/>|>([^<]*)<\/Data>)/g))
      data[d[1]] = (d[2] ?? "").trim();
    events.push({
      provider: /<Provider\s+Name=['"]([^'"]+)['"]/.exec(body)?.[1] ?? "",
      id,
      // SystemTime has 100 ns digits and a Z: Date wants milliseconds only.
      time: Date.parse(stamp.replace(/(\.\d{3})\d*/, "$1")),
      data,
    });
  }
  return events;
}

/** "10.0.0.4", "::1" or "[fe80::1]:443"-style text to a normalized address, or undefined. */
export function etwAddress(value) {
  if (!value) return undefined;
  const v = value.replace(/^\[|\](:\d+)?$/g, "").replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, "$1");
  try {
    return normalize(v);
  } catch {
    return undefined;
  }
}
export const swap16 = (n) => ((n & 255) << 8) | (n >> 8);
// Kernel-Network event ids for UDP (v4, v6) sends and receives; the rest are TCP.
const UDP_EVENTS = new Set([42, 43, 58, 59]);

/** Flows from Kernel-Network events: one per pid and endpoint pair, with first and last time. */
export function etwFlows(events) {
  const flows = new Map();
  for (const e of events) {
    const { PID, saddr, daddr, sport, dport } = e.data;
    const a = etwAddress(saddr);
    const b = etwAddress(daddr);
    if (PID === undefined || !a || !b || sport === undefined || dport === undefined) continue;
    const proto = UDP_EVENTS.has(e.id) ? "UDP" : "TCP";
    // The ports may be logged in network byte order: both are kept as keys.
    const ports = [Number(sport), Number(dport)];
    const key = `${proto} ${PID} ${a}:${ports[0]} ${b}:${ports[1]}`;
    const flow = flows.get(key);
    if (flow) {
      flow.first = Math.min(flow.first, e.time);
      flow.last = Math.max(flow.last, e.time);
    } else flows.set(key, { proto, pid: Number(PID), a, ap: ports[0], b, bp: ports[1], first: e.time, last: e.time });
  }
  return [...flows.values()];
}

/** Process table entries from Kernel-Process starts (id 1) and stops (id 2). */
export function etwProcesses(events, end) {
  const byPid = new Map();
  for (const e of events) {
    const pid = Number(e.data.ProcessID);
    if (!Number.isFinite(pid)) continue;
    if (e.id === 1) {
      const image = e.data.ImageName ?? "";
      const entry = {
        pid,
        ppid: Number(e.data.ParentProcessID),
        name: image.split(/[\\/]/).pop(),
        path: image,
        first: e.time,
        last: end,
        etw: true,
      };
      byPid.set(`${pid} ${e.time}`, entry);
      byPid.set(`live ${pid}`, entry);
    } else if (e.id === 2) {
      const entry = byPid.get(`live ${pid}`);
      if (entry) {
        entry.last = e.time;
        byPid.delete(`live ${pid}`);
      }
    }
  }
  return [...byPid.entries()].filter(([k]) => !k.startsWith("live ")).map(([, v]) => v);
}
