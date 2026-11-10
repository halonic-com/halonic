// MXC go/no-go, extra probes (HAL-3320, part of HAL-3303). Throwaway, never merges.
// Same settings as probe4: spawn() / MxcProcess, telemetry off, the round 2 UI policy, the symlink
// flags in NODE_OPTIONS, no drive-root grant.
// Modes (argv[2]):
//   write     the box writes only to its working folder: not to a read-only grant, not to a folder it isn't given
//   internet  with no allowed sites, curl.exe to an outside IP and host name fails; the same call from the host works
//   all       both
// argv[3] (optional) is the data folder, so a second Windows user can run the probe in a folder it owns.
// Prints "RESULT ..." lines and one JSON object on the last stdout line.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createTcpServer } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";

const { spawn: mxcSpawn, getPlatformSupport } = await import("@microsoft/mxc-sdk/v1");

const drive = `${process.env.SystemDrive ?? "C:"}\\`;
const sysRoot = process.env.SystemRoot;
const mode = process.argv[2] ?? "all";
const base = process.argv[3] ?? process.env.SPIKE_ROOT ?? join(drive, "mxc-spike-data");
mkdirSync(base, { recursive: true });

const SPAWN_OPTIONS = { telemetry: { enabled: false } };
const UI = { disable: false, clipboard: "none", allowInputInjection: false };
const SYMLINK_FLAGS = "--preserve-symlinks --preserve-symlinks-main";
const q = (p) => `"${p}"`;
const hex = (code) => (code == null ? null : `0x${(code >>> 0).toString(16).toUpperCase()}`);

const network = {
  // No allowed sites at all: what a run gets when its permission sheet lists none.
  closed: { egress: { default: "deny" }, ingress: { default: "deny", hostLoopback: "deny" } },
  // No allowed sites, but the bridge rule every adapter run carries (as in probe4).
  bridgeOnly: (port) => ({
    egress: { default: "deny", allow: [{ to: [{ cidr: "127.0.0.1/32" }], ports: [{ protocol: "tcp", port }] }] },
    ingress: { default: "deny", hostLoopback: "deny" },
  }),
};

// ---- Running one command in the box (the probe4 helper, trimmed) ---------------------------------

/** Spawns `command` in a container and collects its streams, exit code and the SDK's warnings. */
async function inBox(label, command, { work, read = [], net = network.closed, env = {}, timeoutMs = 60_000 }) {
  const home = join(work, "home");
  for (const d of ["", "AppData\\Roaming", "AppData\\Local"]) mkdirSync(join(home, d), { recursive: true });
  const request = {
    command,
    filesystem: { readonlyPaths: [...new Set(read.filter(Boolean))], readwritePaths: [work], deniedPaths: [] },
    workingDirectory: work,
    network: net,
    ui: UI,
    timeoutMs,
    environment: { USERPROFILE: home, HOME: home, APPDATA: join(home, "AppData", "Roaming"), LOCALAPPDATA: join(home, "AppData", "Local"), NODE_OPTIONS: SYMLINK_FLAGS, ...env },
    inheritDefaultEnvironment: true,
  };
  const t0 = performance.now();
  const rec = { label };
  let proc;
  try {
    proc = await mxcSpawn(request, SPAWN_OPTIONS);
  } catch (error) {
    rec.spawnError = `${error?.code ?? ""} ${String(error?.message ?? error).split("\n")[0]}`.trim();
    rec.ok = false;
    console.error(`${label}: spawn failed: ${rec.spawnError}`);
    return rec;
  }
  let stdout = "";
  let stderr = "";
  proc.standardOutput?.setEncoding("utf8");
  proc.standardError?.setEncoding("utf8");
  proc.standardOutput?.on("data", (chunk) => {
    stdout += chunk;
  });
  proc.standardError?.on("data", (chunk) => {
    stderr += chunk;
  });
  try {
    const done = await proc.wait();
    rec.exit = done.exitCode;
    rec.hex = hex(done.exitCode);
    rec.timedOut = done.timedOut;
  } catch (error) {
    rec.waitError = String(error?.message ?? error).split("\n")[0];
  }
  rec.ms = Math.round(performance.now() - t0);
  rec.stdout = stdout.trim().slice(-2000);
  rec.stderr = stderr.trim().slice(0, 900);
  rec.warnings = proc.warnings?.length ? [...proc.warnings] : undefined;
  rec.ok = rec.exit === 0 && !rec.waitError && !rec.timedOut;
  proc.dispose();
  console.error(`${label}: exit ${rec.exit} ${rec.hex ?? ""} ${rec.waitError ?? ""} (${rec.ms} ms)`);
  return rec;
}

// ---- Mode: write ------------------------------------------------------------------------------

/**
 * Every write a program could try on a folder: create, overwrite, append, delete, rename, make a
 * subfolder. Runs as a Node script inside the box, reads the folders from a JSON file in its working
 * folder and prints one JSON line of op -> "ok" | error code.
 */
const WRITER = `import { appendFileSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const targets = JSON.parse(readFileSync(process.argv[2], "utf8"));
const tryOp = (fn) => { try { fn(); return "ok"; } catch (e) { return e.code ?? String(e.message); } };
const results = {};
for (const [name, dir] of Object.entries(targets)) {
  results[name] = {
    read: tryOp(() => readFileSync(join(dir, "existing.txt"), "utf8")),
    create: tryOp(() => writeFileSync(join(dir, "created-by-box.txt"), "box")),
    overwrite: tryOp(() => writeFileSync(join(dir, "existing.txt"), "box")),
    append: tryOp(() => appendFileSync(join(dir, "existing.txt"), "box")),
    rename: tryOp(() => renameSync(join(dir, "rename-me.txt"), join(dir, "renamed-by-box.txt"))),
    delete: tryOp(() => unlinkSync(join(dir, "delete-me.txt"))),
    mkdir: tryOp(() => mkdirSync(join(dir, "folder-by-box"))),
  };
}
console.log("WRITES " + JSON.stringify(results));
`;

const ORIGINAL = "original";

/** A folder holding the three files the writer touches, created and owned by the host user. */
function seedFolder(dir) {
  mkdirSync(dir, { recursive: true });
  for (const f of ["existing.txt", "rename-me.txt", "delete-me.txt"]) writeFileSync(join(dir, f), ORIGINAL);
  return dir;
}

/** What the host sees afterwards: the truth, whatever the box reported. */
function hostView(dir) {
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : null);
  return {
    existingUnchanged: read("existing.txt") === ORIGINAL,
    createdByBox: existsSync(join(dir, "created-by-box.txt")),
    renamed: existsSync(join(dir, "renamed-by-box.txt")) || !existsSync(join(dir, "rename-me.txt")),
    deleted: !existsSync(join(dir, "delete-me.txt")),
    folderByBox: existsSync(join(dir, "folder-by-box")),
  };
}

const untouched = (v) => v.existingUnchanged && !v.createdByBox && !v.renamed && !v.deleted && !v.folderByBox;
const allChanged = (v) => !v.existingUnchanged && v.createdByBox && v.renamed && v.deleted && v.folderByBox;

/** The host user's own write in a folder, so "the box could not write" is not a host permission. */
function hostCanWrite(dir) {
  const p = join(dir, `host-control-${process.pid}.txt`);
  try {
    writeFileSync(p, "host");
    rmSync(p);
    return true;
  } catch (error) {
    return error.code ?? false;
  }
}

async function writeMode() {
  const work = mkdtempSync(join(base, "write-work-"));
  const targets = {
    workingFolder: seedFolder(join(work, "inside")),
    readOnlyGrant: seedFolder(mkdtempSync(join(base, "write-readonly-"))),
    notListed: seedFolder(mkdtempSync(join(base, "write-unlisted-"))),
    // Folders a normal program could write to on the host, never given to the box.
    hostTemp: seedFolder(mkdtempSync(join(tmpdir(), "mxc-write-"))),
    driveRoot: drive,
  };
  const hostControl = Object.fromEntries(Object.entries(targets).map(([k, dir]) => [k, hostCanWrite(dir)]));
  const nodeExe = process.execPath;
  const writer = join(work, "writer.mjs");
  writeFileSync(writer, WRITER);
  const seeded = Object.fromEntries(Object.entries(targets).filter(([k]) => k !== "driveRoot"));
  const out = { user: userInfo().username, targets, hostControl, cases: {} };

  // Node inside the box: every write op on every folder, one run.
  const targetsFile = join(work, "targets.json");
  writeFileSync(targetsFile, JSON.stringify(seeded));
  const nodeRun = await inBox("write node", `${q(nodeExe)} ${q(writer)} ${q(targetsFile)}`, {
    work,
    read: [dirname(nodeExe), targets.readOnlyGrant],
  });
  const line = nodeRun.stdout?.split(/\r?\n/).find((l) => l.startsWith("WRITES "));
  nodeRun.reported = line ? JSON.parse(line.slice("WRITES ".length)) : null;
  out.cases.node = nodeRun;

  // Native tools inside the box: cmd.exe redirection and mkdir, one folder per run. No quotes: the
  // paths have no spaces, and cmd.exe's /c quote handling stays out of the way.
  const native = {};
  for (const [name, dir] of Object.entries(targets)) {
    const file = join(dir, `native-${name}.txt`);
    const r = await inBox(`write native ${name}`, `cmd.exe /d /c echo box> ${file} & mkdir ${join(dir, `native-folder-${name}`)}`, {
      work,
      read: [targets.readOnlyGrant],
    });
    r.fileCreated = existsSync(file);
    r.folderCreated = existsSync(join(dir, `native-folder-${name}`));
    native[name] = r;
  }
  out.cases.native = native;

  out.hostView = Object.fromEntries(Object.entries(seeded).map(([k, dir]) => [k, hostView(dir)]));
  const nativeBlocked = (k) => !native[k].fileCreated && !native[k].folderCreated;
  out.verdict = {
    controlWorkingFolderWritable: allChanged(out.hostView.workingFolder) && native.workingFolder.fileCreated,
    readOnlyGrantReadable: nodeRun.reported?.readOnlyGrant?.read === "ok",
    readOnlyGrantBlocked: untouched(out.hostView.readOnlyGrant) && nativeBlocked("readOnlyGrant"),
    notListedBlocked: untouched(out.hostView.notListed) && nativeBlocked("notListed"),
    hostTempBlocked: untouched(out.hostView.hostTemp) && nativeBlocked("hostTemp"),
    driveRootBlocked: nativeBlocked("driveRoot"),
    hostCouldWriteAll: Object.values(hostControl).every((v) => v === true),
  };

  // Clean up anything the box managed to leave on the drive root or in the host's temp folder.
  rmSync(join(drive, "native-driveRoot.txt"), { force: true });
  rmSync(join(drive, "native-folder-driveRoot"), { recursive: true, force: true });
  rmSync(targets.hostTemp, { recursive: true, force: true });
  console.log(`RESULT write (${out.user}): ${JSON.stringify(out.verdict)}`);
  console.log(`RESULT write ops reported by the box: ${JSON.stringify(nodeRun.reported ?? nodeRun.spawnError ?? nodeRun.stderr)}`);
  return out;
}

// ---- Mode: internet -----------------------------------------------------------------------------

async function internetMode() {
  const work = mkdtempSync(join(base, "net-"));
  const bridge = createTcpServer((socket) => socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"));
  await new Promise((done) => bridge.listen(0, "127.0.0.1", done));
  const bridgePort = bridge.address().port;
  const targets = { ip: "http://1.1.1.1/", ipHttps: "https://1.1.1.1/", name: "https://example.com/", name2: "http://neverssl.com/" };
  // curl exit codes: 6 = name not resolved, 7 = connection refused or blocked, 28 = timeout, 35 = TLS failure.
  const curlArgs = (url) => ["-sS", "-m", "10", "-o", "NUL", "-w", "%{http_code}", url];
  const hostControl = Object.fromEntries(
    Object.entries(targets).map(([k, url]) => {
      const r = spawnSync("curl.exe", curlArgs(url), { encoding: "utf8" });
      return [k, { exit: r.status, http: r.stdout.trim(), error: r.stderr.trim().slice(0, 200) }];
    }),
  );
  const out = { user: userInfo().username, bridgePort, hostControl, cases: {} };
  // curl.exe without "-o NUL" inside the box: keep the null device out of the picture (round 2).
  const boxCurl = (url) => `curl.exe -sS -m 10 -w " http=%{http_code}" ${url}`;
  const policies = { closed: network.closed, bridgeOnly: network.bridgeOnly(bridgePort) };
  for (const [pname, net] of Object.entries(policies)) {
    for (const [k, url] of Object.entries(targets)) {
      const r = await inBox(`internet ${pname} ${k}`, boxCurl(url), { work, net, read: [`${sysRoot}\\System32`] });
      r.curlExit = r.exit;
      r.curlError = r.stderr.split(/\r?\n/)[0] ?? null;
      out.cases[`${pname}: ${k}`] = r;
    }
    // DNS on its own: does the box even resolve names?
    out.cases[`${pname}: dns`] = await inBox(`internet ${pname} dns`, "nslookup.exe example.com", { work, net });
  }
  bridge.close();
  const blocked = (c) => !c.ok && !/http=[1-5]\d\d/.test(c.stdout ?? "");
  out.verdict = {
    hostReachesIp: hostControl.ip.exit === 0,
    hostReachesName: hostControl.name.exit === 0,
    closed: Object.fromEntries(Object.keys(targets).map((k) => [k, blocked(out.cases[`closed: ${k}`])])),
    bridgeOnly: Object.fromEntries(Object.keys(targets).map((k) => [k, blocked(out.cases[`bridgeOnly: ${k}`])])),
    curlExitCodes: Object.fromEntries(Object.entries(out.cases).filter(([k]) => !k.endsWith("dns")).map(([k, c]) => [k, c.curlExit ?? c.spawnError])),
    dnsResolvesInBox: { closed: out.cases["closed: dns"].ok, bridgeOnly: out.cases["bridgeOnly: dns"].ok },
  };
  console.log(`RESULT internet (${out.user}): ${JSON.stringify(out.verdict)}`);
  return out;
}

// ---- Main -------------------------------------------------------------------------------------

const report = { mode, user: userInfo().username, support: undefined, result: {} };
try {
  report.support = getPlatformSupport();
} catch (error) {
  report.support = { error: String(error) };
}
const modes = { write: writeMode, internet: internetMode };
for (const name of mode === "all" ? Object.keys(modes) : [mode]) {
  try {
    report.result[name] = await modes[name]();
  } catch (error) {
    report.result[name] = { error: String(error?.stack ?? error).slice(0, 1500) };
    console.log(`RESULT ${name}: probe crashed: ${String(error?.message ?? error).split("\n")[0]}`);
  }
}
console.log(JSON.stringify(report));
// Leave no data folders behind for the next mode or user.
for (const entry of readdirSync(base)) if (/^(write-|net-)/.test(entry)) rmSync(join(base, entry), { recursive: true, force: true });
process.exit(0);
