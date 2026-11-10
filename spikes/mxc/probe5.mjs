// MXC go/no-go, extra probes (HAL-3320, part of HAL-3303). Throwaway, never merges.
// Same settings as probe4: spawn() / MxcProcess, telemetry off, the round 2 UI policy, the symlink
// flags in NODE_OPTIONS, no drive-root grant.
// Modes (argv[2]):
//   write     the box writes only to its working folder: not to a read-only grant, not to a folder it isn't given
//   internet  with no allowed sites, curl.exe to an outside IP and host name fails; the same call from the host works
//   dns       HAL-3365: which bridge policy keeps name lookups in the box; the fence probes per policy
//   all       all three
// argv[3] (optional) is the data folder, so a second Windows user can run the probe in a folder it owns.
// Prints "RESULT ..." lines and one JSON object on the last stdout line.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createTcpServer } from "node:net";
import { networkInterfaces, tmpdir, userInfo } from "node:os";
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
async function inBox(label, command, { work, read = [], denied = [], net = network.closed, env = {}, containmentConfig, timeoutMs = 60_000 }) {
  const home = join(work, "home");
  for (const d of ["", "AppData\\Roaming", "AppData\\Local"]) mkdirSync(join(home, d), { recursive: true });
  const request = {
    command,
    ...(containmentConfig ? { containment: { type: "processcontainer", config: containmentConfig } } : {}),
    filesystem: { readonlyPaths: [...new Set(read.filter(Boolean))], readwritePaths: [work], deniedPaths: denied },
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
    // DNS on its own. Direct queries (nslookup talks UDP 53 itself) and lookups through the Windows
    // DNS client service (curl, like most programs, asks the service, which runs outside the box).
    out.cases[`${pname}: nslookup`] = await inBox(`internet ${pname} nslookup`, "nslookup.exe example.com", { work, net });
    out.cases[`${pname}: dns side channel`] = await dnsSideChannel(work, net, pname);
  }
  bridge.close();
  const blocked = (c) => !c.ok && !/http=[1-5]\d\d/.test(c.stdout ?? "");
  // nslookup exits 0 even when every query times out; an answer has a "Name:" line.
  const answered = (c) => /^Name:/m.test(c.stdout ?? "");
  out.verdict = {
    hostReachesIp: hostControl.ip.exit === 0,
    hostReachesName: hostControl.name.exit === 0,
    closed: Object.fromEntries(Object.keys(targets).map((k) => [k, blocked(out.cases[`closed: ${k}`])])),
    bridgeOnly: Object.fromEntries(Object.keys(targets).map((k) => [k, blocked(out.cases[`bridgeOnly: ${k}`])])),
    curlExitCodes: Object.fromEntries(Object.entries(out.cases).filter(([k]) => !/nslookup|dns/.test(k)).map(([k, c]) => [k, c.curlExit ?? c.spawnError])),
    nslookupAnswers: { closed: answered(out.cases["closed: nslookup"]), bridgeOnly: answered(out.cases["bridgeOnly: nslookup"]) },
    dnsSideChannel: { closed: out.cases["closed: dns side channel"].verdict, bridgeOnly: out.cases["bridgeOnly: dns side channel"].verdict },
  };
  console.log(`RESULT internet (${out.user}): ${JSON.stringify(out.verdict)}`);
  return out;
}

/**
 * Does a name lookup from inside the box leave the machine? The box asks for a name nobody has asked
 * for before (nip.io answers any "<label>-1-2-3-4.nip.io" with 1.2.3.4), then the host looks for it in
 * the DNS client service's cache. curl exit 7 ("could not connect") instead of 6 ("could not resolve")
 * and a cache entry both mean the lookup went out: a channel for data even with the network off.
 */
async function dnsSideChannel(work, net, pname, boxOptions = {}) {
  const label = uniqueLabel(pname);
  const name = `${label}-192-0-2-1.nip.io`;
  // --noproxy: under a proxy policy MXC sets HTTP_PROXY, and curl would hand the name to the proxy
  // instead of looking it up itself.
  const r = await inBox(`internet ${pname} dns side channel`, `curl.exe -sS -m 5 --noproxy * http://${name}/`, { work, net, ...boxOptions });
  const host = spawnSync("curl.exe", ["-sS", "-m", "5", "-o", "NUL", "-w", "%{remote_ip}", `http://${label}-host-192-0-2-1.nip.io/`], { encoding: "utf8" });
  r.name = name;
  r.curlExit = r.exit;
  r.hostCacheEntry = hostDnsCache(label);
  r.verdict = {
    resolvedInBox: r.exit === 7 || r.exit === 28,
    inHostDnsCache: Boolean(r.hostCacheEntry),
    curlExit: r.exit,
    hostControlResolves: host.stderr.includes("Could not resolve") ? false : host.status,
  };
  return r;
}

/** A DNS label nobody has looked up before, so a cache entry can only come from this run. */
function uniqueLabel(tag) {
  const slug = tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  return `mxc-${slug}-${process.pid}-${Date.now().toString(36)}`;
}

/** The host DNS client cache entries starting with `label`, as JSON, or null when there are none. */
function hostDnsCache(label) {
  const cache = spawnSync("powershell.exe", ["-NoProfile", "-Command", `Get-DnsClientCache | Where-Object Entry -like '${label}*' | Select-Object Entry, Status, Data | ConvertTo-Json -Compress`], { encoding: "utf8" });
  return cache.stdout.trim() || null;
}

// ---- Mode: dns (HAL-3365) ---------------------------------------------------------------------
//
// Which network policy lets the box reach Halonic's bridge but keeps name lookups inside the box?
// Every variant runs the same fence check, so a policy that closes DNS but opens something else
// shows up too.

/**
 * Runs inside the box (Node): the bridge, another local port, the hidden and denied files, a write
 * outside the working folder, an outbound connection and a name lookup through the Windows DNS
 * client service (getaddrinfo, as curl and most runtimes use). Prints one "FENCE {json}" line.
 */
const FENCE = `import { lookup } from "node:dns/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { connect } from "node:net";
const t = JSON.parse(readFileSync(process.argv[2], "utf8"));
const tcp = (host, port) => new Promise((done) => {
  const s = connect({ host, port, timeout: 5000 });
  s.on("connect", () => { s.destroy(); done("connected"); });
  s.on("timeout", () => { s.destroy(); done("timeout"); });
  s.on("error", (e) => done(e.code ?? e.message));
});
const httpGet = (host, port) => new Promise((done) => {
  const r = request({ host, port, path: "/", timeout: 5000 }, (res) => {
    let body = "";
    res.on("data", (c) => { body += c; });
    res.on("end", () => done(res.statusCode + " " + body));
  });
  r.on("timeout", () => { r.destroy(); done("timeout"); });
  r.on("error", (e) => done(e.code ?? e.message));
  r.end();
});
const attempt = async (fn) => { try { return await fn(); } catch (e) { return e.code ?? String(e.message); } };
const out = {
  httpProxyEnv: process.env.HTTP_PROXY ?? null,
  bridge: await httpGet(t.bridgeHost, t.bridgePort),
  otherPortLoopback: await tcp("127.0.0.1", t.otherPort),
  otherPortBridgeAddress: await tcp(t.bridgeHost, t.otherPort),
  allowedFile: await attempt(() => readFileSync(t.allowedFile, "utf8")),
  hiddenFile: await attempt(() => readFileSync(t.hiddenFile, "utf8")),
  deniedFile: await attempt(() => readFileSync(t.deniedFile, "utf8")),
  writeOutside: await attempt(() => { writeFileSync(t.writeOutside, "box"); return "ok"; }),
  outboundIp: await tcp("1.1.1.1", 80),
  lookup: await attempt(async () => (await lookup(t.uniqueName)).address),
};
console.log("FENCE " + JSON.stringify(out));
`;

/** A tiny stand-in for the bridge: answers any HTTP request with 200 "ok". */
async function listen(host) {
  const server = createTcpServer((socket) => socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"));
  await new Promise((done, fail) => server.once("error", fail).listen(0, host, done));
  return server;
}

/** The host's first non-loopback, non-link-local IPv4 address (the runner's vNIC). */
function vnicAddress() {
  const all = Object.values(networkInterfaces()).flat();
  return all.find((a) => a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254."))?.address ?? null;
}

/** The policies under test. `bridge` is where the bridge listens for that variant. */
function dnsVariants(loopbackPort, vnic, vnicPort) {
  const proxy = { networkProxy: `http://127.0.0.1:${loopbackPort}` };
  const onVnic = (ingressDefault) => ({
    egress: { default: "deny", allow: [{ to: [{ cidr: `${vnic}/32` }], ports: [{ protocol: "tcp", port: vnicPort }] }] },
    ingress: { default: ingressDefault, hostLoopback: "deny" },
  });
  const variants = {
    "0 no rules (control)": { bridge: ["127.0.0.1", loopbackPort], net: network.closed },
    "0 loopback allow rule (today)": { bridge: ["127.0.0.1", loopbackPort], net: network.bridgeOnly(loopbackPort) },
    // Model 2 in the MXC networking guide, for a proxy with no package or AppContainer identity.
    "1a proxy, no peer identity": {
      bridge: ["127.0.0.1", loopbackPort],
      net: { egress: { default: "deny" }, ingress: { default: "allow", hostLoopback: "allow" }, runtimeConfig: proxy },
    },
    // allowedProxyPeer names a package family or AppContainer profile. Our bridge has neither, so a
    // made-up profile shows whether MXC checks the name or opens the endpoint anyway.
    "1b proxy, allowedProxyPeer": {
      bridge: ["127.0.0.1", loopbackPort],
      net: { egress: { default: "deny" }, ingress: { default: "allow", hostLoopback: "deny" }, runtimeConfig: proxy },
      containmentConfig: { network: { allowedProxyPeer: "halonic.bridge.probe" } },
    },
  };
  if (vnic) {
    variants["2a vNIC allow rule"] = { bridge: [vnic, vnicPort], net: onVnic("deny") };
    variants["2b vNIC allow rule, private network on"] = { bridge: [vnic, vnicPort], net: onVnic("allow") };
  }
  return variants;
}

async function dnsMode() {
  const work = mkdtempSync(join(base, "dns-"));
  const nodeExe = process.execPath;
  const fence = join(work, "fence.mjs");
  writeFileSync(fence, FENCE);
  // Files the box may read, may not see, and is denied inside a folder it may read.
  const allowedDir = seedFolder(mkdtempSync(join(base, "dns-allowed-")));
  const deniedFile = join(allowedDir, "rename-me.txt");
  const hiddenDir = seedFolder(mkdtempSync(join(base, "dns-hidden-")));
  const outsideDir = mkdtempSync(join(base, "dns-outside-"));

  const vnic = vnicAddress();
  const loopbackBridge = await listen("127.0.0.1");
  const vnicBridge = vnic ? await listen(vnic) : null;
  const other = await listen("0.0.0.0");
  const loopbackPort = loopbackBridge.address().port;
  const vnicPort = vnicBridge?.address().port ?? null;
  const out = { user: userInfo().username, vnic, cases: {}, verdict: {} };

  for (const [name, v] of Object.entries(dnsVariants(loopbackPort, vnic, vnicPort))) {
    const label = uniqueLabel(name);
    const targets = {
      bridgeHost: v.bridge[0],
      bridgePort: v.bridge[1],
      otherPort: other.address().port,
      allowedFile: join(allowedDir, "existing.txt"),
      hiddenFile: join(hiddenDir, "existing.txt"),
      deniedFile,
      writeOutside: join(outsideDir, `${label}.txt`),
      uniqueName: `${label}-192-0-2-1.nip.io`,
    };
    const targetsFile = join(work, `targets-${label}.json`);
    writeFileSync(targetsFile, JSON.stringify(targets));
    const boxOptions = { net: v.net, containmentConfig: v.containmentConfig, read: [dirname(nodeExe), allowedDir], denied: [deniedFile] };
    const run = await inBox(`dns ${name} fence`, `${q(nodeExe)} ${q(fence)} ${q(targetsFile)}`, { work, ...boxOptions });
    const line = run.stdout?.split(/\r?\n/).find((l) => l.startsWith("FENCE "));
    run.fence = line ? JSON.parse(line.slice("FENCE ".length)) : null;
    run.lookupInHostCache = hostDnsCache(label);
    run.wroteOutside = existsSync(targets.writeOutside);
    const curl = await dnsSideChannel(work, v.net, name, { containmentConfig: v.containmentConfig });
    out.cases[name] = { fence: run, curl };
    out.verdict[name] = dnsVerdict(run, curl);
    console.log(`RESULT dns ${name} (${out.user}): ${JSON.stringify(out.verdict[name])}`);
  }
  for (const server of [loopbackBridge, vnicBridge, other]) server?.close();
  return out;
}

/** One table row: does the bridge work, do names leak, do the other fence probes hold. */
function dnsVerdict(run, curl) {
  const f = run.fence;
  if (!f) return { started: false, error: run.spawnError ?? run.waitError ?? run.stderr?.slice(0, 300) };
  const refused = (r) => r !== "connected";
  const unreadable = (r) => r !== "original";
  const fence = {
    otherPortLoopback: refused(f.otherPortLoopback),
    otherPortBridgeAddress: refused(f.otherPortBridgeAddress),
    allowedFileReadable: f.allowedFile === "original",
    hiddenFile: unreadable(f.hiddenFile),
    deniedFile: unreadable(f.deniedFile),
    writeOutside: f.writeOutside !== "ok" && !run.wroteOutside,
    outboundIp: refused(f.outboundIp),
  };
  return {
    started: true,
    bridgeWorks: String(f.bridge).startsWith("200"),
    dnsLeaks: /^\d/.test(String(f.lookup)) || Boolean(run.lookupInHostCache) || curl.verdict.inHostDnsCache,
    dns: { nodeLookup: f.lookup, nodeLookupInHostCache: Boolean(run.lookupInHostCache), curlExit: curl.curlExit, curlInHostCache: curl.verdict.inHostDnsCache },
    otherProbesPass: Object.values(fence).every(Boolean),
    fence,
    raw: { bridge: f.bridge, otherPortLoopback: f.otherPortLoopback, otherPortBridgeAddress: f.otherPortBridgeAddress, outboundIp: f.outboundIp, httpProxyEnv: f.httpProxyEnv },
  };
}

// ---- Main -------------------------------------------------------------------------------------

const report = { mode, user: userInfo().username, support: undefined, result: {} };
try {
  report.support = getPlatformSupport();
} catch (error) {
  report.support = { error: String(error) };
}
const modes = { write: writeMode, internet: internetMode, dns: dnsMode };
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
for (const entry of readdirSync(base)) if (/^(write-|net-|dns-)/.test(entry)) rmSync(join(base, entry), { recursive: true, force: true });
process.exit(0);
