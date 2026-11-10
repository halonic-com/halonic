// Phase 5 spike (HAL-3775): native srt on a Windows CI runner. Beyond the two
// canary probes of windows-fence-probe.mjs, this runs a battery of attacks,
// the two network-fence bypasses srt's README admits (traffic that a system
// service makes for the program, and a thread that switches token before it
// opens a socket), and a matrix of the tools an agent uses.
//
// Every probe runs through the srt CLI, after `windows-install`. Probes whose
// result depends on the machine also run once outside srt as a control; a
// probe whose control fails is INCONCLUSIVE, never a pass. Report-only: the
// exit code is always 0 unless the harness itself breaks. The per-probe
// results go to the job summary and to windows-spike-results.json.
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srtCli = join(packageDir, "node_modules/@anthropic-ai/sandbox-runtime/dist/cli.js");
const node = process.execPath;

const root = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), "halonic-spike-"));
const work = join(root, "work");
const hidden = join(root, "hidden");
const outside = join(root, "outside");
for (const dir of [work, hidden, outside]) mkdirSync(dir);
const secret = join(hidden, "secret.txt");
writeFileSync(secret, "hunter2");
writeFileSync(join(outside, "original.txt"), "original");

// A loopback port the fence must block (srt only allows 60080-60089).
let connections = 0;
const server = createServer((socket) => {
  connections += 1;
  socket.on("data", () => {
    socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
  });
  socket.on("error", () => {});
  setTimeout(() => socket.destroy(), 3000).unref();
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;

const settings = join(root, "settings.json");
writeFileSync(
  settings,
  JSON.stringify({
    network: {
      allowedDomains: ["example.com", "github.com", "registry.npmjs.org", "pypi.org"],
      deniedDomains: [],
    },
    filesystem: { denyRead: [hidden], allowRead: [work], allowWrite: [work], denyWrite: [] },
  }),
);

function inSrt(command, timeout = 90_000) {
  const run = spawnSync(node, [srtCli, "-s", settings, "-c", command], {
    encoding: "utf8",
    timeout,
    cwd: work,
  });
  return { code: run.status, out: `${run.stdout ?? ""}`, err: `${run.stderr ?? ""}` };
}
function outsideSrt(command, timeout = 90_000) {
  const run = spawnSync(command, { shell: true, encoding: "utf8", timeout, cwd: work });
  return { code: run.status, out: `${run.stdout ?? ""}`, err: `${run.stderr ?? ""}` };
}
// The canary server lives in this process, so a probe that counts its
// connections must not block the event loop: spawnSync would hold every
// connection in the queue until the child is gone, and the counter would read 0.
function runAsync(file, args, options) {
  return new Promise((done) => {
    const child = spawn(file, args, { ...options, cwd: work });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), options.timeout ?? 90_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => (err += String(e)));
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, out, err });
    });
  });
}
const inSrtAsync = (command) => runAsync(node, [srtCli, "-s", settings, "-c", command], {});
const outsideSrtAsync = (command) => runAsync(command, [], { shell: true });
function script(name, body) {
  const path = join(work, name);
  writeFileSync(path, body);
  return path;
}

const results = [];
const tail = (s) => s.trim().split(/\r?\n/).slice(-3).join(" | ").slice(0, 300);
/** status: PASS (fence held / tool worked), FAIL (fence leaked / tool broke), INCONCLUSIVE, INFO. */
function record(group, name, status, detail) {
  results.push({ group, name, status, detail });
  console.log(`[${status}] ${group}: ${name} - ${detail}`);
}

// ---- Group 1: file attacks, as one node program inside srt -----------------
const attackChild = script(
  "attacks.mjs",
  `import { readFileSync, writeFileSync, symlinkSync, linkSync, copyFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const r = {};
const t = (k, f) => { try { r[k] = f(); } catch (e) { r[k] = "blocked:" + (e.code ?? e.message).toString().slice(0, 40); } };
const work = ${JSON.stringify(work)}, secret = ${JSON.stringify(secret)}, outside = ${JSON.stringify(outside)};
t("control_write", () => { writeFileSync(join(work, "c.txt"), "x"); return "ok"; });
t("link_control", () => { writeFileSync(join(work, "plain.txt"), "plain"); symlinkSync(join(work, "plain.txt"), join(work, "lnk0")); return readFileSync(join(work, "lnk0"), "utf8"); });
t("hardlink_control", () => { linkSync(join(work, "plain.txt"), join(work, "hl0")); return readFileSync(join(work, "hl0"), "utf8"); });
t("junction_control", () => { mkdirSync(join(work, "dir0")); writeFileSync(join(work, "dir0", "f.txt"), "plain"); symlinkSync(join(work, "dir0"), join(work, "jn0"), "junction"); return readFileSync(join(work, "jn0", "f.txt"), "utf8"); });
t("read_secret", () => readFileSync(secret, "utf8"));
t("symlink_secret", () => { symlinkSync(secret, join(work, "lnk")); return readFileSync(join(work, "lnk"), "utf8"); });
t("hardlink_secret", () => { linkSync(secret, join(work, "hl")); return readFileSync(join(work, "hl"), "utf8"); });
t("copy_secret", () => { copyFileSync(secret, join(work, "cp")); return readFileSync(join(work, "cp"), "utf8"); });
t("junction_secret", () => { symlinkSync(${JSON.stringify(hidden)}, join(work, "jn"), "junction"); return readFileSync(join(work, "jn", "secret.txt"), "utf8"); });
t("list_hidden", () => readdirSync(${JSON.stringify(hidden)}).join(","));
t("cmd_type_secret", () => { const p = spawnSync("cmd", ["/c", "type", secret], { encoding: "utf8" }); if (p.stdout.includes("hunter2")) return p.stdout; throw Object.assign(new Error("no"), { code: "NOLEAK" }); });
t("write_outside", () => { writeFileSync(join(outside, "original.txt"), "overwritten"); return "ok"; });
t("create_outside", () => { writeFileSync(join(outside, "new.txt"), "x"); return "ok"; });
t("write_via_junction", () => { symlinkSync(outside, join(work, "jo"), "junction"); writeFileSync(join(work, "jo", "via.txt"), "x"); return "ok"; });
t("env_secret", () => { if (process.env.HALONIC_SPIKE_SECRET) return process.env.HALONIC_SPIKE_SECRET; throw Object.assign(new Error("no"), { code: "ABSENT" }); });
console.log(JSON.stringify(r));
`,
);
process.env.HALONIC_SPIKE_SECRET = "env-leak";
{
  const run = inSrt(`"${node}" "${attackChild}"`);
  let r;
  try {
    r = JSON.parse(run.out.trim().split(/\r?\n/).pop());
  } catch {
    record("attacks", "the attack program gave a result", "FAIL", tail(run.err || run.out));
  }
  if (r) {
    const leaked = (v) => typeof v === "string" && !v.startsWith("blocked:");
    record(
      "attacks",
      "control write in the work folder",
      r.control_write === "ok" ? "PASS" : "FAIL",
      r.control_write,
    );
    // A link probe only counts as a pass when the same kind of link works
    // inside the work folder; EPERM on creating the link proves nothing.
    const controlFor = {
      symlink_secret: "link_control",
      hardlink_secret: "hardlink_control",
      junction_secret: "junction_control",
    };
    for (const [k, label] of [
      ["read_secret", "can't read a denied file"],
      ["symlink_secret", "can't read it through a symlink"],
      ["hardlink_secret", "can't read it through a hard link"],
      ["copy_secret", "can't copy it into the work folder"],
      ["junction_secret", "can't read it through a junction"],
      ["list_hidden", "can't list the denied folder"],
      ["cmd_type_secret", "can't read it through cmd.exe"],
      ["write_outside", "can't overwrite a file outside the work folder"],
      ["create_outside", "can't create a file outside the work folder"],
      ["write_via_junction", "can't write outside through a junction"],
      ["env_secret", "doesn't see the host's environment"],
    ]) {
      if (controlFor[k] && !leaked(r[controlFor[k]])) {
        record(
          "attacks",
          label,
          leaked(r[k]) ? "FAIL" : "INCONCLUSIVE",
          `the control link in the work folder failed (${r[controlFor[k]]}); ${String(r[k]).slice(0, 60)}`,
        );
        continue;
      }
      record("attacks", label, leaked(r[k]) ? "FAIL" : "PASS", String(r[k]).slice(0, 80));
    }
  }
}
delete process.env.HALONIC_SPIKE_SECRET;
const stillOriginal = readFileSync(join(outside, "original.txt"), "utf8") === "original";
record(
  "attacks",
  "outside file is unchanged on disk",
  stillOriginal ? "PASS" : "FAIL",
  "checked from outside",
);

// ---- Group 2: process containment ------------------------------------------
// The child writes a "started" file before it spawns the detached grandchild:
// piped stdout from a short-lived process is not a reliable signal on Windows.
// The same program also runs outside srt as a control, where the grandchild
// must survive; if it doesn't, the probe itself is broken.
{
  const child = script(
    "orphan.mjs",
    `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const prefix = process.argv[2];
writeFileSync(prefix + ".started", "yes");
const p = spawn(process.execPath, ["-e", "setTimeout(() => require('fs').writeFileSync(" + JSON.stringify(prefix + ".alive") + ", 'alive'), 8000)"], { detached: true, stdio: "ignore" });
p.unref();
console.log("started");
`,
  );
  const markIn = join(work, "orphan-srt");
  const markOut = join(work, "orphan-control");
  const [inRun] = await Promise.all([
    inSrtAsync(`"${node}" "${child}" "${markIn}"`),
    outsideSrtAsync(`"${node}" "${child}" "${markOut}"`),
  ]);
  await new Promise((done) => setTimeout(done, 12_000));
  const started = existsSync(`${markIn}.started`);
  const alive = existsSync(`${markIn}.alive`);
  const controlOk = existsSync(`${markOut}.started`) && existsSync(`${markOut}.alive`);
  let orphanStatus = "INCONCLUSIVE";
  let detail;
  if (!started) {
    detail = `the child never started inside srt (exit ${inRun.code}): ${tail(inRun.err || inRun.out)}`;
  } else if (!controlOk) {
    detail =
      "the control outside srt did not leave a surviving detached child, so the probe cannot tell";
  } else {
    orphanStatus = alive ? "FAIL" : "PASS";
    detail = alive
      ? "the detached child outlived srt"
      : "the child did not outlive srt (the control outside srt did)";
  }
  record(
    "processes",
    "a detached child is still killed with the session (job object)",
    orphanStatus,
    detail,
  );
}

// ---- Group 3: network fence and its documented bypasses --------------------
const netChild = script(
  "net.mjs",
  `import { connect } from "node:net";
const socket = connect({ host: "127.0.0.1", port: ${port} });
const finish = (o) => { console.log(o); socket.destroy(); };
socket.setTimeout(5000, () => finish("blocked"));
socket.on("connect", () => finish("reached"));
socket.on("error", () => finish("blocked"));
`,
);
async function netProbe(name, command, why) {
  const before = connections;
  const run = await inSrtAsync(command);
  const reached = connections - before;
  const b = connections;
  await outsideSrtAsync(command);
  const ranOutside = connections - b > 0;
  if (!ranOutside) {
    record(
      "network",
      name,
      "INCONCLUSIVE",
      `control outside srt never reached the canary port (${tail(run.err || run.out)})`,
    );
  } else {
    record(
      "network",
      name,
      reached === 0 ? "PASS" : "FAIL",
      `${reached} connection(s) reached the canary port through srt. ${why}`,
    );
  }
}
await netProbe("raw socket to a blocked loopback port", `"${node}" "${netChild}"`, "Baseline.");
await netProbe(
  "service traffic: BITS (a system service fetches the URL)",
  `powershell -NoProfile -Command "Start-BitsTransfer -Source http://127.0.0.1:${port}/bits -Destination '${join(work, "bits.out")}'"`,
  "README admits traffic made by system services for the program is not filtered.",
);
await netProbe(
  "service traffic: certutil -urlcache",
  `certutil -urlcache -split -f http://127.0.0.1:${port}/certutil "${join(work, "certutil.out")}"`,
  "certutil fetches through the Windows HTTP stack.",
);
await netProbe(
  "service traffic: Windows PowerShell WebClient (.NET)",
  `powershell -NoProfile -Command "(New-Object Net.WebClient).DownloadString('http://127.0.0.1:${port}/dotnet')"`,
  "Plain HTTP through .NET, to a port the proxy never allows.",
);
// Token switch: the thread drops to the anonymous token, then opens the socket.
const tokenPs = script(
  "token-switch.ps1",
  `Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Net.Sockets;
public static class Sw {
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool ImpersonateAnonymousToken(IntPtr t);
  [DllImport("advapi32.dll")] static extern bool RevertToSelf();
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentThread();
  public static string Go(int port) {
    string r;
    if (!ImpersonateAnonymousToken(GetCurrentThread())) return "no-switch:" + Marshal.GetLastWin32Error();
    try { using (var c = new TcpClient()) { var a = c.BeginConnect("127.0.0.1", port, null, null);
      r = a.AsyncWaitHandle.WaitOne(4000) && c.Connected ? "reached" : "blocked"; } }
    catch (Exception e) { r = "blocked:" + e.GetType().Name; }
    RevertToSelf(); return r;
  }
}
"@
Write-Output ("token-switch " + [Sw]::Go(${port}))
`,
);
{
  const name = "token switch: anonymous token before connect";
  const command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${tokenPs}"`;
  const says = (out) => {
    if (out.includes("token-switch reached")) return "reached";
    if (out.includes("token-switch blocked")) return "blocked";
    return "unknown";
  };
  // Control first: outside srt, the same script must reach the canary. If
  // Winsock itself refuses the anonymous token, a "blocked" inside srt proves
  // nothing about srt.
  const controlBefore = connections;
  const control = await outsideSrtAsync(command);
  const controlReached = connections - controlBefore;
  const before = connections;
  const run = await inSrtAsync(command);
  const reached = connections - before;
  const childSays = says(run.out);
  if (controlReached === 0 || says(control.out) !== "reached") {
    record(
      "network",
      name,
      "INCONCLUSIVE",
      `control outside srt did not reach the canary (${controlReached} connection(s); ${tail(control.out || control.err)}), so Windows itself may refuse the anonymous token. Inside srt: ${reached} connection(s); ${tail(run.out || run.err)}`,
    );
  } else if (run.out.includes("no-switch")) {
    record("network", name, "INCONCLUSIVE", tail(run.out));
  } else if (!run.out.includes("token-switch")) {
    record("network", name, "INCONCLUSIVE", `probe did not run: ${tail(run.err || run.out)}`);
  } else if (childSays === "reached" && reached === 0) {
    record(
      "network",
      name,
      "INCONCLUSIVE",
      "the child says it connected but the canary saw nothing",
    );
  } else {
    record(
      "network",
      name,
      childSays === "blocked" && reached === 0 ? "PASS" : "FAIL",
      `control outside srt reached the canary; inside srt ${reached} connection(s); ${tail(run.out)}`,
    );
  }
}

// ---- Group 4: which agent tools break --------------------------------------
const systemRoot = process.env.SystemRoot ?? "";
// The git probe is a node program, so the shell's quoting of `echo x> f` is out
// of the picture; the redirect has its own probe in the list below.
const gitChild = script(
  "git-commit.mjs",
  `import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = join(process.cwd(), "tool-repo-" + process.pid);
mkdirSync(dir);
const git = (...a) => { const p = spawnSync("git", a, { cwd: dir, encoding: "utf8" }); return { code: p.status, text: (p.stdout + p.stderr).trim() }; };
const steps = [["init", git("init", "-q")]];
writeFileSync(join(dir, "f"), "x");
steps.push(["file", { code: 0, text: readFileSync(join(dir, "f"), "utf8") }]);
steps.push(["email", git("config", "user.email", "a@b.c")], ["name", git("config", "user.name", "t")], ["add", git("add", "f")], ["commit", git("commit", "-q", "-m", "m")], ["log", git("log", "--oneline")]);
for (const [k, r] of steps) console.log(k + " " + r.code + " " + r.text.replace(/\\r?\\n/g, " / "));
process.exit(steps.some(([, r]) => r.code !== 0) ? 1 : 0);
`,
);
const tools = [
  [
    "node: HTTPS fetch",
    `"${node}" -e "fetch('https://example.com').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"`,
  ],
  [
    "python: HTTPS request",
    `python -c "import urllib.request,sys; urllib.request.urlopen('https://example.com',timeout=20)"`,
  ],
  ["git: ls-remote over HTTPS", `git ls-remote https://github.com/halonic-com/halonic.git HEAD`],
  ["git: init, add, commit in the work folder", `"${node}" "${gitChild}"`],
  [
    "cmd redirect: echo x> f writes the file",
    `del /q "${join(work, "echo-probe.txt")}" 2>nul & echo x> "${join(work, "echo-probe.txt")}" && type "${join(work, "echo-probe.txt")}"`,
  ],
  [
    "curl.exe (Windows built-in, schannel)",
    `"${win32.join(systemRoot, "System32", "curl.exe")}" -sS -f -m 20 -o NUL https://example.com`,
  ],
  [
    "PowerShell Invoke-WebRequest",
    `powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing https://example.com | Out-Null"`,
  ],
  [
    "PowerShell .NET WebClient HTTPS",
    `powershell -NoProfile -Command "(New-Object Net.WebClient).DownloadString('https://example.com') | Out-Null"`,
  ],
  [
    "pwsh 7 Invoke-WebRequest",
    `pwsh -NoProfile -Command "Invoke-WebRequest https://example.com | Out-Null"`,
  ],
  ["dotnet --info (starts)", `dotnet --info`],
  ["winget --version (starts)", `winget --version`],
  ["npm view (registry over HTTPS)", `npm view left-pad version`],
  ["pip download metadata", `python -m pip index versions requests`],
  ["cmd.exe: dir and echo", `cmd /c "dir /b && echo ok"`],
  ["ripgrep or findstr over the work folder", `findstr /s /m "x" *`],
];
// Git for Windows curl is not probed: windows-2025 has no curl.exe next to git (HAL-3831).
for (const [name, command] of tools) {
  const control = outsideSrt(command, 120_000);
  if (control.code !== 0) {
    record(
      "tools",
      name,
      "INCONCLUSIVE",
      `control outside srt failed (exit ${control.code}): ${tail(control.err || control.out)}`,
    );
    continue;
  }
  const run = inSrt(command, 120_000);
  record(
    "tools",
    name,
    run.code === 0 ? "PASS" : "FAIL",
    run.code === 0
      ? "works inside srt"
      : `breaks inside srt (exit ${run.code}): ${tail(run.err || run.out)}`,
  );
}

server.close();
writeFileSync(join(packageDir, "windows-spike-results.json"), JSON.stringify(results, null, 2));
const lines = results.map(
  (r) =>
    `| ${r.group} | ${r.status} | ${r.name} | ${r.detail.replace(/\|/g, "/").replace(/\r?\n/g, " ")} |`,
);
const table = `### Native srt on Windows: spike probes (HAL-3775)\n\n| Group | Result | Probe | Detail |\n| --- | --- | --- | --- |\n${lines.join("\n")}\n`;
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
console.log(table);
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`PASS ${count("PASS")}, FAIL ${count("FAIL")}, INCONCLUSIVE ${count("INCONCLUSIVE")}`);
