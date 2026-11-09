// MXC process-container spike (HAL-2396). Throwaway.
// Modes (argv[2]):
//   fence   the canary probes: hidden file, blocked loopback port, allowed-folder control
//   cold    one command start, timed, then exit (the caller runs this in a fresh node process, 20 times)
//   warm    20 command starts in this one process, timed
//   tools   which tools run inside the container
// Prints one JSON object on the last stdout line.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";

const drive = `${process.env.SystemDrive ?? "X:"}\\`;
const mode = process.argv[2] ?? "fence";
const base = process.env.SPIKE_ROOT ?? join(process.env.RUNNER_TEMP ?? join(drive, "mxc-spike"), "mxc-probe");
mkdirSync(base, { recursive: true });
const nodeDir = dirname(process.execPath);
const { run, getPlatformSupport } = await import("@microsoft/mxc-sdk/v1");

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const quote = (p) => `"${p}"`;

async function runIn(command, { work, extraRead = [], denied = [], loopback = "deny", timeoutMs = 60_000 }) {
  const t0 = performance.now();
  try {
    const out = await run({
      command,
      filesystem: { readonlyPaths: [nodeDir, ...extraRead], readwritePaths: [work], deniedPaths: denied },
      network: { egress: { default: "deny" }, ingress: { default: "deny", hostLoopback: loopback } },
      timeoutMs,
    });
    return { ms: performance.now() - t0, exitCode: out.exitCode, stdout: out.stdout, stderr: out.stderr, timedOut: out.timedOut, warnings: out.warnings };
  } catch (error) {
    return { ms: performance.now() - t0, error: String(error?.stack ?? error) };
  }
}

const report = { mode, support: undefined, result: undefined };
try {
  report.support = getPlatformSupport();
} catch (error) {
  report.support = { error: String(error) };
}

const work = mkdtempSync(join(base, "work-"));

if (mode === "fence") {
  const hiddenDir = mkdtempSync(join(base, "hidden-"));
  const canaryFile = join(hiddenDir, "canary.txt");
  writeFileSync(canaryFile, "canary");
  let connections = 0;
  const server = createServer((s) => {
    connections += 1;
    s.destroy();
  });
  await new Promise((d) => server.listen(0, "127.0.0.1", d));
  const port = server.address().port;
  const child = join(work, "child.mjs");
  writeFileSync(
    child,
    `import { readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
const r = { control: false, file: "unknown", port: "unknown" };
try { writeFileSync(${JSON.stringify(join(work, "control.txt"))}, "ran"); r.control = true; } catch {}
try { readFileSync(${JSON.stringify(canaryFile)}); r.file = "read"; } catch { r.file = "blocked"; }
await new Promise((done) => {
  const s = connect({ host: "127.0.0.1", port: ${port} });
  const fin = (o) => { r.port = o; s.destroy(); done(); };
  s.setTimeout(5000, () => fin("blocked"));
  s.on("connect", () => fin("reached"));
  s.on("error", () => fin("blocked"));
});
console.log(JSON.stringify(r));
`,
  );
  const cmd = `${quote(process.execPath)} ${quote(child)}`;
  // Variant A: the hidden file lives in a folder the sandbox could otherwise read
  // (the canary folder is under the same temp root as the allowed work folder).
  // The fence must hold with the file listed as denied.
  const fenced = await runIn(cmd, { work, extraRead: [hiddenDir, join(base)], denied: [canaryFile] });
  const seenFenced = connections;
  // Variant B: no deny list, loopback allowed. Proves the probes can see the file and the
  // port at all (otherwise "blocked" would prove nothing).
  const open = await runIn(cmd, { work, extraRead: [hiddenDir, join(base)], loopback: "allow" });
  const parse = (r) => {
    try {
      return JSON.parse(String(r.stdout).trim().split(/\r?\n/).pop());
    } catch {
      return null;
    }
  };
  report.result = { fenced: { raw: fenced, probes: parse(fenced), connectionsSeen: seenFenced }, openControl: { raw: open, probes: parse(open), connectionsSeen: connections - seenFenced } };
  server.close();
  const f = report.result.fenced.probes;
  const o = report.result.openControl.probes;
  report.verdict =
    f && f.control && f.file === "blocked" && f.port === "blocked" && seenFenced === 0
      ? "FENCED"
      : "NOT FENCED or probes did not run";
  report.controlValid = Boolean(o && o.file === "read" && o.port === "reached");
} else if (mode === "cold" || mode === "warm") {
  const commands = { cmd: "cmd.exe /c exit 0", node: `${quote(process.execPath)} -e "0"` };
  const n = mode === "warm" ? 20 : 1;
  const out = {};
  for (const [name, command] of Object.entries(commands)) {
    out[name] = [];
    for (let i = 0; i < n; i += 1) {
      const r = await runIn(command, { work });
      out[name].push({ ms: Math.round(r.ms), exitCode: r.exitCode, error: r.error });
    }
    if (mode === "warm") out[`${name}Median`] = Math.round(median(out[name].map((x) => x.ms)));
  }
  report.result = out;
} else if (mode === "tools") {
  const tools = ["cmd.exe /c ver", `${quote(process.execPath)} --version`, "where.exe git", "git --version", "powershell.exe -NoProfile -Command $PSVersionTable.PSVersion.ToString()", "pwsh.exe -NoProfile -Command 1", "python.exe --version", "curl.exe --version", "tar.exe --version", "where.exe pnpm", "cargo.exe --version", "whoami.exe /groups"];
  const results = {};
  for (const t of tools) {
    const r = await runIn(t, { work, extraRead: [process.env.SystemRoot, process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]].filter(Boolean) });
    results[t] = { exitCode: r.exitCode, error: r.error?.split("\n")[0], out: String(r.stdout ?? "").slice(0, 200).trim(), err: String(r.stderr ?? "").slice(0, 200).trim() };
  }
  report.result = results;
}
console.log(JSON.stringify(report));
// Exit code only reflects the fence verdict; timing and tools modes just report.
process.exit(mode === "fence" && report.verdict !== "FENCED" ? 1 : 0);
