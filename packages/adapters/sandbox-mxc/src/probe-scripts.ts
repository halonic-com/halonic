// The Node programs the fence proof and the trust-check canary run inside the
// box. They are plain CommonJS files, written into the box's folders and
// started by `node <script> <config file>`: a file, not `node -e`, so no
// quoting gets in the way. Each reads its settings from the JSON file named
// by its first argument and prints one JSON line.

/**
 * Reads the control file, the hidden file and the denied file; tries to write
 * where nothing may be written (the host looks at the disk afterwards, so
 * what the box says about it doesn't matter); and tries the network: a TCP
 * connection to each port, to each address of the local network, to each
 * internet address and to the bridge (the network control), and a DNS query
 * sent straight to each public DNS server.
 *
 * Settings: `{ control, hidden, denied, writes: [{ create, existing }],
 * ports: [{ host, port }], lan: [{ host, port }], internet: [{ host, port }],
 * dns: [{ host, port }], bridge: { host, port } | null }`.
 *
 * It prints `{ control, hidden, denied, ports, lan, internet, dns, network }`. A file
 * is `readable` or `hidden`. A network attempt is `{ host, port, state, code }`:
 * `connected` (a connection, or a DNS answer), `refused` (the system said no:
 * ECONNREFUSED, EACCES, EPERM or an unreachable network), `timeout` (nothing
 * came back) or `failed` (any other error, such as Winsock not starting). Only
 * `refused` proves a block by itself: see `network-probes.ts`.
 */
export const leakProbeScript = `
const fs = require("node:fs");
const net = require("node:net");
const dgram = require("node:dgram");
const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const attemptTimeoutMs = 3000;
const refusalCodes = new Set([
  "ECONNREFUSED",
  "EACCES",
  "EPERM",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENETDOWN",
]);
const readState = (file) => {
  try {
    fs.readFileSync(file);
    return "readable";
  } catch {
    return "hidden";
  }
};
const attempt = (action) => {
  try {
    action();
  } catch {
    // Refused, as it should be.
  }
};
const stateOf = (error) => {
  if (error.code === "ETIMEDOUT") return "timeout";
  return refusalCodes.has(error.code) ? "refused" : "failed";
};
const outcome = ({ host, port }, state, code) => ({ host, port, state, code: code ?? null });
const reach = (target) =>
  new Promise((resolve) => {
    let socket = null;
    const finish = (state, code) => {
      clearTimeout(timer);
      socket?.destroy();
      resolve(outcome(target, state, code));
    };
    const timer = setTimeout(() => finish("timeout"), attemptTimeoutMs);
    try {
      socket = net.connect(target);
    } catch (error) {
      finish("failed", error.code);
      return;
    }
    socket.once("connect", () => finish("connected"));
    socket.once("error", (error) => finish(stateOf(error), error.code));
  });
// A DNS query for an A record of example.com: a header, then one question.
const dnsQuery = Buffer.concat([
  Buffer.from([0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  ...["example", "com"].map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label)])),
  Buffer.from([0x00]),
  Buffer.from([0x00, 0x01, 0x00, 0x01]),
]);
const ask = (target) =>
  new Promise((resolve) => {
    let socket = null;
    const finish = (state, code) => {
      clearTimeout(timer);
      socket?.close();
      resolve(outcome(target, state, code));
    };
    const timer = setTimeout(() => finish("timeout"), attemptTimeoutMs);
    try {
      socket = dgram.createSocket(target.host.includes(":") ? "udp6" : "udp4");
      socket.once("message", () => finish("connected"));
      socket.once("error", (error) => finish(stateOf(error), error.code));
      socket.send(dnsQuery, target.port, target.host, (error) => {
        if (error) finish(stateOf(error), error.code);
      });
    } catch (error) {
      finish("failed", error.code);
    }
  });
async function main() {
  const report = {
    control: readState(config.control),
    hidden: readState(config.hidden),
    denied: readState(config.denied),
  };
  for (const { create, existing } of config.writes ?? []) {
    attempt(() => fs.writeFileSync(create, "written by the box"));
    attempt(() => fs.writeFileSync(existing, "changed by the box"));
    attempt(() => fs.rmSync(existing));
  }
  // All at once, so the slowest wait is one timeout, not their sum.
  [report.ports, report.lan, report.internet, report.dns, report.network] = await Promise.all([
    Promise.all(config.ports.map(reach)),
    Promise.all((config.lan ?? []).map(reach)),
    Promise.all((config.internet ?? []).map(reach)),
    Promise.all((config.dns ?? []).map(ask)),
    config.bridge ? reach(config.bridge) : null,
  ]);
  console.log(JSON.stringify(report));
}
main();
`;

/**
 * Lists the working folder and writes a file in it, then removes it. The
 * script itself is loaded from the working folder, which is the other half of
 * the control that failed on the real PC (HAL-2546).
 *
 * Settings: `{ folder, name }`. It prints `{ listed, wrote }`.
 */
export const workProbeScript = `
const fs = require("node:fs");
const path = require("node:path");
const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const result = { listed: false, wrote: false };
try {
  fs.readdirSync(config.folder);
  result.listed = true;
} catch {
  // Reported as not listed.
}
try {
  const file = path.join(config.folder, config.name);
  fs.writeFileSync(file, "canary");
  fs.unlinkSync(file);
  result.wrote = true;
} catch {
  // Reported as not written.
}
console.log(JSON.stringify(result));
`;

/** How a network attempt of the probe ended: see {@link leakProbeScript}. */
export type AttemptState = "connected" | "refused" | "timeout" | "failed";

/** One network attempt of the leak probe. */
export interface NetworkAttempt {
  host: string;
  port: number;
  state: AttemptState;
  /** The error code (`ECONNREFUSED`, ...), or `null` when it connected or timed out. */
  code: string | null;
}

/** What {@link leakProbeScript} printed. */
export interface LeakReport {
  control: string;
  hidden: string;
  denied: string;
  /** The loopback and host-address listeners. */
  ports: NetworkAttempt[];
  /** The router's usual address and a neighbour in each private range: nothing of ours listens there. */
  lan: NetworkAttempt[];
  internet: NetworkAttempt[];
  dns: NetworkAttempt[];
  /** The bridge, the network control; `null` when the box has none. */
  network: NetworkAttempt | null;
}

/** What {@link workProbeScript} printed. */
export interface WorkReport {
  listed: boolean;
  wrote: boolean;
}

/** The last line of `output` as JSON, or `null` when it isn't. */
function lastLine(output: string): unknown {
  try {
    return JSON.parse(output.trim().split("\n").pop() ?? "");
  } catch {
    return null;
  }
}

const attemptStates: readonly string[] = [
  "connected",
  "refused",
  "timeout",
  "failed",
] satisfies AttemptState[];

function isAttempt(value: unknown): value is NetworkAttempt {
  if (typeof value !== "object" || value === null) return false;
  const { host, port, state } = value as Partial<NetworkAttempt>;
  return (
    typeof host === "string" && typeof port === "number" && attemptStates.includes(state ?? "")
  );
}

/** The leak probe's report, or `null` when the program printed anything else: a crash, nothing, or other text. */
export function parseLeakReport(output: string): LeakReport | null {
  const report = lastLine(output) as Partial<LeakReport> | null;
  if (typeof report !== "object" || report === null) return null;
  const { control, hidden, denied, ports, lan, internet, dns, network } = report;
  if (typeof control !== "string" || typeof hidden !== "string" || typeof denied !== "string") {
    return null;
  }
  if (!Array.isArray(ports) || !ports.every(isAttempt)) return null;
  // A probe settings file without local network, internet or DNS targets prints none.
  const lists = [lan ?? [], internet ?? [], dns ?? []];
  if (!lists.every((list) => Array.isArray(list) && list.every(isAttempt))) return null;
  if (network !== null && network !== undefined && !isAttempt(network)) return null;
  return {
    control,
    hidden,
    denied,
    ports,
    lan: lists[0] as NetworkAttempt[],
    internet: lists[1] as NetworkAttempt[],
    dns: lists[2] as NetworkAttempt[],
    network: network ?? null,
  };
}

/** The work probe's report, or `null` when the program printed anything else. */
export function parseWorkReport(output: string): WorkReport | null {
  const report = lastLine(output) as Partial<WorkReport> | null;
  if (typeof report !== "object" || report === null) return null;
  const { listed, wrote } = report;
  return typeof listed === "boolean" && typeof wrote === "boolean" ? { listed, wrote } : null;
}
