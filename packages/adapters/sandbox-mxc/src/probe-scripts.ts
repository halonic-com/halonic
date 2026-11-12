// The Node programs the fence proof and the trust-check canary run inside the
// box. They are plain CommonJS files, written into the box's folders and
// started by `node <script> <config file>`: a file, not `node -e`, so no
// quoting gets in the way. Each reads its settings from the JSON file named
// by its first argument and prints one JSON line.

/**
 * Reads the control file, the hidden file and the denied file; tries to write
 * where nothing may be written (the host looks at the disk afterwards, so
 * what the box says about it doesn't matter); and connects to each port.
 *
 * Settings: `{ control, hidden, denied, writes: [{ create, existing }], ports: [{ host, port }] }`.
 * It prints `{ control, hidden, denied, ports: [{ host, port, state }] }`, where
 * a file is `readable` or `hidden` and a port is `connected` or `blocked`.
 */
export const leakProbeScript = `
const fs = require("node:fs");
const net = require("node:net");
const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
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
const reach = ({ host, port }) =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (state) => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ host, port, state });
    };
    const timer = setTimeout(() => finish("blocked"), 3000);
    socket.once("connect", () => finish("connected"));
    socket.once("error", () => finish("blocked"));
  });
async function main() {
  const report = {
    control: readState(config.control),
    hidden: readState(config.hidden),
    denied: readState(config.denied),
    ports: [],
  };
  for (const { create, existing } of config.writes ?? []) {
    attempt(() => fs.writeFileSync(create, "written by the box"));
    attempt(() => fs.writeFileSync(existing, "changed by the box"));
    attempt(() => fs.rmSync(existing));
  }
  for (const target of config.ports) report.ports.push(await reach(target));
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

/** What {@link leakProbeScript} printed. */
export interface LeakReport {
  control: string;
  hidden: string;
  denied: string;
  ports: { host: string; port: number; state: string }[];
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

/** The leak probe's report, or `null` when the program printed anything else: a crash, nothing, or other text. */
export function parseLeakReport(output: string): LeakReport | null {
  const report = lastLine(output) as Partial<LeakReport> | null;
  if (typeof report !== "object" || report === null) return null;
  const { control, hidden, denied, ports } = report;
  if (typeof control !== "string" || typeof hidden !== "string" || typeof denied !== "string") {
    return null;
  }
  if (!Array.isArray(ports)) return null;
  return { control, hidden, denied, ports };
}

/** The work probe's report, or `null` when the program printed anything else. */
export function parseWorkReport(output: string): WorkReport | null {
  const report = lastLine(output) as Partial<WorkReport> | null;
  if (typeof report !== "object" || report === null) return null;
  const { listed, wrote } = report;
  return typeof listed === "boolean" && typeof wrote === "boolean" ? { listed, wrote } : null;
}
