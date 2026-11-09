// MXC process-container spike, round 2 (HAL-2444). Throwaway.
// The host side is Node (it drives the SDK); the probes that run INSIDE the container are native
// (cmd.exe, curl.exe) so they start even if Node does not.
// Modes (argv[2]):
//   native   canaries: hidden file, blocked loopback port, allowed-folder file read (control)
//   time     N starts of `cmd.exe /c exit 0` with a minimal read-only list (argv[3] = N, default 1)
//   node     Node, git, pnpm inside the container with growing read-only lists; first variant that works wins
// Prints one JSON object on the last stdout line.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { performance } from "node:perf_hooks";

const drive = `${process.env.SystemDrive ?? "C:"}\\`;
const mode = process.argv[2] ?? "native";
const base = process.env.SPIKE_ROOT ?? join(process.env.RUNNER_TEMP ?? join(drive, "mxc-spike"), "mxc-probe2");
mkdirSync(base, { recursive: true });
const { run, getPlatformSupport } = await import("@microsoft/mxc-sdk/v1");
const q = (p) => `"${p}"`;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function runIn(command, { work, read = [], denied = [], loopback = "deny", timeoutMs = 60_000, ui, containment }) {
  const t0 = performance.now();
  try {
    const out = await run({
      command,
      filesystem: { readonlyPaths: read, readwritePaths: [work], deniedPaths: denied },
      workingDirectory: work,
      network: { egress: { default: "deny" }, ingress: { default: "deny", hostLoopback: loopback } },
      timeoutMs,
      ...(ui ? { ui } : {}),
      ...(containment ? { containment } : {}),
    });
    return { ms: Math.round(performance.now() - t0), exitCode: out.exitCode, meta: out.outputMetadata, stdout: String(out.stdout ?? "").trim().slice(0, 300), stderr: String(out.stderr ?? "").trim().slice(0, 300), timedOut: out.timedOut, warnings: out.warnings };
  } catch (error) {
    return { ms: Math.round(performance.now() - t0), error: String(error?.message ?? error).split("\n")[0] };
  }
}

const report = { mode, support: undefined, result: undefined };
try {
  report.support = getPlatformSupport();
} catch (error) {
  report.support = { error: String(error) };
}
const work = mkdtempSync(join(base, "work-"));

if (mode === "native") {
  // Folders: allowed (readable, holds the control file), hidden (not in any list), denied-inside (a file in a readable folder that is also listed as denied).
  const allowed = mkdtempSync(join(base, "allowed-"));
  const hidden = mkdtempSync(join(base, "hidden-"));
  writeFileSync(join(allowed, "control.txt"), "control");
  writeFileSync(join(allowed, "denied.txt"), "denied");
  writeFileSync(join(hidden, "canary.txt"), "canary");
  const ok = (r) => r.exitCode === 0 && !r.error;
  const readCmd = (f) => `cmd.exe /c type ${q(f)}`;
  const results = {};
  // 1. Allowed-folder control: a file read in an allowed folder must work.
  results.allowedRead = await runIn(readCmd(join(allowed, "control.txt")), { work, read: [allowed] });
  // 2. Hidden file: in a folder that is in no list. Must fail.
  results.hiddenFile = await runIn(readCmd(join(hidden, "canary.txt")), { work, read: [allowed] });
  // 3. Denied file inside a readable folder. Must fail.
  results.deniedInsideAllowed = await runIn(readCmd(join(allowed, "denied.txt")), { work, read: [allowed], denied: [join(allowed, "denied.txt")] });
  // 4. Open control for the hidden file: the same file made readable. Must work, or "blocked" above means nothing.
  results.hiddenFileOpenControl = await runIn(readCmd(join(hidden, "canary.txt")), { work, read: [allowed, hidden] });
  // 5. Blocked loopback port: curl from inside to a server on the host's 127.0.0.1.
  let connections = 0;
  const server = createServer((s) => {
    connections += 1;
    s.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nhi");
  });
  await new Promise((d) => server.listen(0, "127.0.0.1", d));
  const port = server.address().port;
  const curl = `curl.exe -sS -m 8 http://127.0.0.1:${port}/`;
  results.loopbackDenied = await runIn(curl, { work, read: [allowed] });
  const seenDenied = connections;
  // 6. Open control for loopback (needs hostLoopback=allow, which Server 2025 does not support; the error is recorded).
  results.loopbackOpenControl = await runIn(curl, { work, read: [allowed], loopback: "allow" });
  const seenOpen = connections - seenDenied;
  // 7. Control that curl itself starts inside the container and can talk to something that is not the fence:
  //    curl --version must exit 0.
  results.curlStarts = await runIn("curl.exe --version", { work, read: [allowed] });
  server.close();
  report.result = { results, connectionsSeenWhenDenied: seenDenied, connectionsSeenWhenAllowed: seenOpen };
  const fileFenced = ok(results.allowedRead) && !ok(results.hiddenFile) && !ok(results.deniedInsideAllowed);
  const fileControlValid = ok(results.hiddenFileOpenControl);
  const portFenced = ok(results.curlStarts) && seenDenied === 0 && !ok(results.loopbackDenied);
  const portControlValid = ok(results.loopbackOpenControl) && seenOpen > 0;
  report.verdict = { fileFenced, fileControlValid, portFenced, portControlValid };
} else if (mode === "time") {
  const n = Number(process.argv[3] ?? 1);
  const allowed = mkdtempSync(join(base, "allowed-"));
  const ms = [];
  for (let i = 0; i < n; i += 1) {
    const r = await runIn("cmd.exe /c exit 0", { work, read: [allowed], timeoutMs: 120_000 });
    ms.push(r.ms);
    console.error(`${mode} #${i}: ${r.ms} ms, exit ${r.exitCode}, ${r.error ?? ""}`);
  }
  report.result = { ms, median: median(ms) };
} else if (mode === "node") {
  const where = (t) => {
    const r = spawnSync("where.exe", [t], { encoding: "utf8" });
    return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
  };
  const nodeExe = process.execPath;
  const nodeDir = dirname(nodeExe);
  const gitExe = where("git");
  const pnpmExe = where("pnpm.cmd") ?? where("pnpm");
  const gitRoot = gitExe ? dirname(dirname(gitExe)) : null;
  const pnpmDir = pnpmExe ? dirname(pnpmExe) : null;
  const sys = process.env.SystemRoot, pf = process.env.ProgramFiles, pfx = process.env["ProgramFiles(x86)"];
  const toolcache = process.env.RUNNER_TOOL_CACHE;
  const tools = {
    node: `${q(nodeExe)} --version`,
    git: gitExe ? `${q(gitExe)} --version` : null,
    pnpm: pnpmExe ? `${q(pnpmExe)} --version` : null,
  };
  const variants = [
    { name: "A: node dir, git root, pnpm dir", read: [nodeDir, gitRoot, pnpmDir] },
    { name: "B: A plus Program Files and Windows", read: [nodeDir, gitRoot, pnpmDir, pf, pfx, sys] },
    { name: "C: B plus tool cache and system-drive root", read: [nodeDir, gitRoot, pnpmDir, pf, pfx, sys, toolcache, drive] },
  ].map((v) => ({ ...v, read: [...new Set(v.read.filter(Boolean))] }));
  const out = { paths: { nodeExe, gitExe, pnpmExe }, variants: [] };
  for (const v of variants) {
    const rec = { name: v.name, read: v.read, tools: {} };
    for (const [t, cmd] of Object.entries(tools)) {
      if (!cmd) {
        rec.tools[t] = "not installed on host";
        continue;
      }
      const r = await runIn(cmd, { work, read: v.read, timeoutMs: 120_000 });
      rec.tools[t] = { exit: r.exitCode, hex: r.exitCode == null ? null : `0x${(r.exitCode >>> 0).toString(16).toUpperCase()}`, out: r.stdout, err: r.stderr || r.error, ms: r.ms };
      console.error(`${v.name} / ${t}: exit ${r.exitCode} ${r.error ?? ""} (${r.ms} ms)`);
    }
    out.variants.push(rec);
    if (Object.values(rec.tools).every((x) => typeof x === "string" || x.exit === 0)) break;
  }
  // What can the container see of the Node folder? (separates "path not readable" from "DLL init fails".)
  out.dirFromInside = await runIn(`cmd.exe /c dir /b ${q(nodeDir)}`, { work, read: [nodeDir] });
  report.result = out;
}
if (mode === "node2") {
  // Hypothesis: 0xC0000142 is user32/shell32 failing to initialise because the container has no desktop (ui.disable defaults to true).
  const nodeExe = process.execPath;
  const read = [dirname(nodeExe), process.env.SystemRoot, process.env.ProgramFiles].filter(Boolean);
  const cmd = `${q(nodeExe)} --version`;
  const variants = {
    uiEnabled: { ui: { disable: false, clipboard: "none", allowInputInjection: false } },
    uiEnabledWithCapture: {
      ui: { disable: false, clipboard: "none", allowInputInjection: false },
      containment: { type: "processcontainer", config: { captureDenials: { mode: "block", outputPath: join(base, "denials-ui.json"), retainEtl: false } } },
    },
    uiDisabledWithCapture: {
      containment: { type: "processcontainer", config: { captureDenials: { mode: "block", outputPath: join(base, "denials-noui.json"), retainEtl: false } } },
    },
    // Native exes that do / do not pull in user32, to see if the pattern holds.
    findstr: { cmd: "findstr.exe /?" },
    hostname: { cmd: "hostname.exe" },
    ipconfig: { cmd: "ipconfig.exe" },
    tasklist: { cmd: "tasklist.exe" },
  };
  const out = {};
  for (const [name, v] of Object.entries(variants)) {
    const r = await runIn(v.cmd ?? cmd, { work, read, ui: v.ui, containment: v.containment, timeoutMs: 120_000 });
    out[name] = { exit: r.exitCode, hex: r.exitCode == null ? null : `0x${(r.exitCode >>> 0).toString(16).toUpperCase()}`, out: r.stdout?.slice(0, 80), err: r.stderr || r.error, meta: r.meta };
    for (const f of ["denials-ui.json", "denials-noui.json"]) {
      try {
        if (name.toLowerCase().includes(f.includes("noui") ? "disabled" : "enabledwith")) out[name].denials = readFileSync(join(base, f), "utf8").slice(0, 3000);
      } catch {}
    }
    console.error(`${name}: exit ${r.exitCode} ${r.error ?? ""}`);
  }
  report.result = out;
}
console.log(JSON.stringify(report));
