@echo off
rem Halonic MXC check - double-click this file. No admin needed. Nothing is installed system-wide, nothing is uploaded.
rem Internal spike tool (HAL-3541, variants of HAL-2545). Not for publishing.
title Halonic MXC check - variants
set "MXC_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:MXC_SELF); iex $t.Substring($t.IndexOf('#PS'+'BEGIN'))"
echo.
pause
exit /b
#PSBEGIN
$ErrorActionPreference = 'Stop'
$CheckJs = @'
// Halonic MXC check: runs inside Node, drives Microsoft's MXC SDK. Prints a short PASS/FAIL summary.
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const facts = JSON.parse(process.env.MXC_FACTS ?? "{}");
const profileBase = process.env.MXC_DATA;
const outsideBase = process.env.MXC_OUTSIDE;
const reportFile = join(dirname(profileBase), "report-variants.txt");
writeFileSync(reportFile, "");
const say = (s = "") => { console.log(s); appendFileSync(reportFile, s + "\n"); };
const q = (p) => `"${p}"`;

const sdkMod = await import("@microsoft/mxc-sdk/v1");
const { run, getPlatformSupport } = sdkMod;
const nodeDir = dirname(process.execPath);
const UI = { disable: false, clipboard: "none", allowInputInjection: false };

async function box(command, { work, read = [], denied = [], loopback = "deny" }) {
  const t0 = performance.now();
  try {
    const out = await run({
      command,
      filesystem: { readonlyPaths: [...read, ...extraRead], readwritePaths: [work], deniedPaths: denied },
      workingDirectory: work,
      network: { egress: { default: "deny" }, ingress: { default: "deny", hostLoopback: loopback } },
      timeoutMs: 60_000,
      ui: UI,
    });
    return { exit: out.exitCode, out: String(out.stdout ?? "").trim(), err: String(out.stderr ?? "").trim(), ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { exit: null, error: String(e?.message ?? e).split("\n")[0].slice(0, 160), ms: Math.round(performance.now() - t0) };
  }
}
let extraRead = [];
const ok = (r) => r.exit === 0 && !r.error;

const results = []; // { name, status: PASS | FAIL | SKIP, note }
const add = (name, status, note = "") => results.push({ name, status, note });

async function suite(label, base, extra) {
  rmSync(base, { recursive: true, force: true });
  mkdirSync(base, { recursive: true });
  extraRead = extra;
  const before = results.length;
  const work = mkdtempSync(join(base, "work-"));
  const allowed = mkdtempSync(join(base, "allowed-"));
  const hidden = mkdtempSync(join(base, "hidden-"));
  writeFileSync(join(allowed, "control.txt"), "control");
  writeFileSync(join(allowed, "denied.txt"), "denied");
  writeFileSync(join(hidden, "canary.txt"), "canary");
  const readCmd = (f) => `cmd.exe /c type ${q(f)}`;

  // Part 1: native canaries (cmd.exe and curl.exe start on every Windows).
  const start = await box("cmd.exe /c exit 0", { work, read: [allowed] });
  if (!ok(start)) {
    add("A box can be started at all", "FAIL", start.error ?? `exit ${start.exit}`);
  } else {
    add("A box can be started at all", "PASS", `${start.ms} ms`);
    const allowedRead = await box(readCmd(join(allowed, "control.txt")), { work, read: [allowed] });
    add("Program inside can read a folder we allowed (control)", ok(allowedRead) ? "PASS" : "FAIL", ok(allowedRead) ? "" : allowedRead.error ?? `exit ${allowedRead.exit}`);

    const hid = await box(readCmd(join(hidden, "canary.txt")), { work, read: [allowed] });
    const hidOpen = await box(readCmd(join(hidden, "canary.txt")), { work, read: [allowed, hidden] });
    add("Program inside cannot read a folder we did not allow", !ok(hid) && ok(hidOpen) ? "PASS" : "FAIL", ok(hid) ? "LEAK: file was readable" : !ok(hidOpen) ? "test not valid (open control failed)" : "");

    const den = await box(readCmd(join(allowed, "denied.txt")), { work, read: [allowed], denied: [join(allowed, "denied.txt")] });
    add("Program inside cannot read a file we explicitly denied", !ok(den) ? "PASS" : "FAIL", ok(den) ? "LEAK: denied file was readable" : "");

    let connections = 0;
    const server = createServer((s) => { connections += 1; s.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nhi"); });
    await new Promise((d) => server.listen(0, "127.0.0.1", d));
    const port = server.address().port;
    const curl = `curl.exe -sS -m 8 http://127.0.0.1:${port}/`;
    const curlOk = await box("curl.exe --version", { work, read: [allowed] });
    const lbDenied = await box(curl, { work, read: [allowed] });
    const seenDenied = connections;
    const lbOpen = await box(curl, { work, read: [allowed], loopback: "allow" });
    const seenOpen = connections - seenDenied;
    server.close();
    if (!ok(curlOk)) add("Program inside cannot reach this PC's local network port", "FAIL", "curl did not start inside the box");
    else add("Program inside cannot reach this PC's local network port", seenDenied === 0 && !ok(lbDenied) ? "PASS" : "FAIL", seenDenied ? "LEAK: connection reached the PC" : "");
    add("(control) the same port is reachable when we allow it", seenOpen > 0 ? "PASS" : "SKIP", seenOpen > 0 ? "" : lbOpen.error ?? "could not be tested on this Windows");
  }

  // Part 2: Node inside the box, with the two symlink flags and no grant on the whole drive.
  const nodeTest = await box(`${q(process.execPath)} --version`, { work, read: [nodeDir] });
  add("Node.js starts inside the box", ok(nodeTest) ? "PASS" : "FAIL", ok(nodeTest) ? nodeTest.out : nodeTest.error ?? `exit ${nodeTest.exit} (0x${((nodeTest.exit ?? 0) >>> 0).toString(16).toUpperCase()})`);
  if (ok(nodeTest)) {
    let connections = 0;
    const server = createServer((s) => { connections += 1; s.destroy(); });
    await new Promise((d) => server.listen(0, "127.0.0.1", d));
    const port = server.address().port;
    const child = join(work, "child.mjs");
    writeFileSync(child, `import { readFileSync } from "node:fs";
  import { connect } from "node:net";
  const r = { control: "no", file: "unknown", port: "unknown" };
  try { readFileSync(${JSON.stringify(join(allowed, "control.txt"))}); r.control = "read"; } catch {}
  try { readFileSync(${JSON.stringify(join(hidden, "canary.txt"))}); r.file = "read"; } catch { r.file = "blocked"; }
  await new Promise((done) => {
    const s = connect({ host: "127.0.0.1", port: ${port} });
    const fin = (o) => { r.port = o; s.destroy(); done(); };
    s.setTimeout(5000, () => fin("blocked"));
    s.on("connect", () => fin("reached"));
    s.on("error", () => fin("blocked"));
  });
  console.log(JSON.stringify(r));
  `);
    const r = await box(`${q(process.execPath)} --preserve-symlinks --preserve-symlinks-main ${q(child)}`, { work, read: [nodeDir, allowed] });
    server.close();
    let parsed = null;
    try { parsed = JSON.parse(r.out.split(/\r?\n/).pop()); } catch {}
    if (!parsed) add("A Node script runs inside the box (symlink flags, no drive grant)", "FAIL", (r.err.split(/\r?\n/).find((l) => /Error/.test(l)) ?? r.error ?? `exit ${r.exit}`).slice(0, 160));
    else {
      add("A Node script runs inside the box (symlink flags, no drive grant)", parsed.control === "read" ? "PASS" : "FAIL", parsed.control === "read" ? "" : "could not read the allowed folder");
      add("Node inside cannot read a folder we did not allow", parsed.file === "blocked" ? "PASS" : "FAIL", parsed.file === "blocked" ? "" : "LEAK: file was readable");
      add("Node inside cannot reach this PC's local network port", parsed.port === "blocked" && connections === 0 ? "PASS" : "FAIL", connections ? "LEAK: connection reached the PC" : "");
    }
  }


  for (const r of results.slice(before)) r.name = `[${label}] ${r.name}`;
  extraRead = [];
}
let support;
try { support = getPlatformSupport(); } catch (e) { support = { isSupported: false, reason: String(e) }; }
say(`Windows: ${facts.windows} (edition ${facts.edition_id}, version ${facts.version}, build ${facts.build}, ${facts.architecture}), admin: ${facts.admin}`);
say(`MXC support: ${support.isSupported ? "yes" : "NO"}${support.reason ? " - " + support.reason : ""}; tier: ${support.isolationTier ?? support.tier ?? "unknown"}; methods: ${(support.availableMethods ?? []).join(", ") || "none"}`);
say("");


// Variant D: raw probe output from the SDK and from wxc-exec.exe.
say("=== D: probe output ===");
try { say("getPlatformSupport(): " + JSON.stringify(support, null, 1)); } catch {}
say("SDK exports: " + Object.keys(sdkMod).join(", "));
try {
  if (typeof sdkMod.probe === "function") say("probe(): " + JSON.stringify(await sdkMod.probe(), null, 1));
  else say("probe(): not exported by this SDK version");
} catch (e) { say("probe() failed: " + String(e?.message ?? e).split("\n")[0]); }
const { readdirSync, statSync } = await import("node:fs");
const found = [];
const walk = (d, depth) => { if (depth > 6) return; let es; try { es = readdirSync(d); } catch { return; } for (const n of es) { const p = join(d, n); if (/^wxc-exec(\.exe)?$/i.test(n)) found.push(p); else if (depth < 6) { try { if (statSync(p).isDirectory()) walk(p, depth + 1); } catch {} } } };
walk(join(process.cwd(), "node_modules", "@microsoft"), 0);
for (const exe of found.slice(0, 2)) {
  const r = spawnSync(exe, ["--probe"], { encoding: "utf8", timeout: 30000 });
  say(`${exe} --probe (exit ${r.status}):\n${(r.stdout ?? "").trim()}\n${(r.stderr ?? "").trim()}`);
}
if (!found.length) say("wxc-exec not found inside the SDK folder");
say("");


// Variants: same suite, different places and grants.
await suite("current: folders in your profile", profileBase, []);
await suite("A: folders outside the profile (C:\\halonic-mxc-check)", outsideBase, []);  // leak-guard: allow absolute-path real-PC test folder on the tester machine
await suite("C: DIAGNOSIS ONLY, whole C:\\ readable", profileBase, ["C:\\"]);

// Summary
say("SUMMARY");
for (const r of results) say(`  ${r.status.padEnd(4)}  ${r.name}${r.note ? "  [" + r.note + "]" : ""}`);
const fails = results.filter((r) => r.status === "FAIL");
const leaks = fails.filter((r) => /LEAK/.test(r.note));
say("");
if (!fails.length) say("RESULT: PASS - the box held on this PC.");
else if (leaks.length) say("RESULT: FAIL - the box LEAKED on this PC. Please send this report to the Halonic team.");
else say("RESULT: DID NOT RUN FULLY - the box could not be started or a test could not run. Please send this report to the Halonic team.");
say(`Windows: ${facts.windows}, edition ${facts.edition_id}, build ${facts.build}`);
'@
$NodeVersion = '24.21.0'
$SdkVersion = '1.0.1'
$work = Join-Path $env:LOCALAPPDATA 'halonic-mxc-check'
$outside = 'C:\halonic-mxc-check\data'  // leak-guard: allow absolute-path real-PC test folder on the tester machine
New-Item -ItemType Directory -Force $work | Out-Null

Write-Host ''
Write-Host '=== Halonic MXC check ===' -ForegroundColor Cyan
Write-Host 'This tests whether Windows can keep a program inside a locked box (a "process container").'
Write-Host 'It runs three variants, in your profile and in C:\halonic-mxc-check. It removes nothing outside those.'  // leak-guard: allow absolute-path real-PC test folder on the tester machine
Write-Host ''

# 1. Windows edition and build
$os = Get-CimInstance Win32_OperatingSystem
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$facts = [ordered]@{
  windows      = $os.Caption
  edition_id   = $cv.EditionID
  version      = $cv.DisplayVersion
  build        = "$($os.BuildNumber).$($cv.UBR)"
  architecture = $os.OSArchitecture
  admin        = [bool]$isAdmin
}
Write-Host "Windows: $($facts.windows)  (edition $($facts.edition_id), version $($facts.version), build $($facts.build), $($facts.architecture))"
Write-Host "Running as administrator: $(if ($isAdmin) { 'yes' } else { 'no (that is fine)' })"
Write-Host ''
$env:MXC_FACTS = ($facts | ConvertTo-Json -Compress)

try {
  # 2. Node.js 24 (portable copy in our folder if there is none)
  $nodeDir = $null
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) {
    $v = (& $cmd.Source --version) -replace '^v', ''
    if ([version]$v -ge [version]'24.0.0') { $nodeDir = Split-Path $cmd.Source }
  }
  if (-not $nodeDir) {
    $arch = if ($os.OSArchitecture -match 'ARM') { 'arm64' } else { 'x64' }
    $name = "node-v$NodeVersion-win-$arch"
    $nodeDir = Join-Path $work $name
    if (-not (Test-Path "$nodeDir\node.exe")) {
      Write-Host "Step 1/3: downloading a private copy of Node.js $NodeVersion from nodejs.org (about 30 MB)..."
      $zip = Join-Path $work "$name.zip"
      $base = "https://nodejs.org/dist/v$NodeVersion"
      Invoke-WebRequest "$base/$name.zip" -OutFile $zip -UseBasicParsing
      $sums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content -split "`n"
      $want = ($sums | Where-Object { $_ -match "$name\.zip" } | Select-Object -First 1) -split '\s+' | Select-Object -First 1
      $got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
      if ($want -ne $got) { throw "Node.js download did not match its published checksum. Stopped." }
      Expand-Archive $zip -DestinationPath $work -Force
      Remove-Item $zip
    }
  } else {
    Write-Host "Step 1/3: using the Node.js you already have ($nodeDir)."
  }
  $env:PATH = "$nodeDir;$env:PATH"
  $nodeExe = Join-Path $nodeDir 'node.exe'

  # 3. The MXC SDK, pinned
  $sdk = Join-Path $work 'sdk'
  New-Item -ItemType Directory -Force $sdk | Out-Null
  Set-Content -Path "$sdk\package.json" -Value "{`"name`":`"mxc-check`",`"private`":true,`"type`":`"module`",`"dependencies`":{`"@microsoft/mxc-sdk`":`"$SdkVersion`"}}"
  if (-not (Test-Path "$sdk\node_modules\@microsoft\mxc-sdk")) {
    Write-Host 'Step 2/3: downloading Microsoft''s MXC package from npm...'
    Push-Location $sdk
    & "$nodeDir\npm.cmd" install --ignore-scripts --no-audit --no-fund --loglevel=error
    $npmExit = $LASTEXITCODE
    Pop-Location
    if ($npmExit -ne 0) { throw 'npm install failed.' }
  }

  # 4. The checks
  [IO.File]::WriteAllText("$sdk\check.mjs", $CheckJs, (New-Object Text.UTF8Encoding($false)))
  Write-Host 'Step 3/3: running the checks (about a minute)...'
  Write-Host ''
  $env:MXC_DATA = Join-Path $work 'data'
  $env:MXC_OUTSIDE = $outside
  New-Item -ItemType Directory -Force (Split-Path $outside) | Out-Null
  Push-Location $sdk
  & $nodeExe check.mjs
  Pop-Location
} catch {
  Write-Host ''
  Write-Host "COULD NOT RUN THE CHECK: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Please send this window (a photo or screenshot is fine) to the Halonic team.'
}
$report = Join-Path $work 'report-variants.txt'
if (Test-Path $report) {
  $desk = [Environment]::GetFolderPath('Desktop')
  if ($desk -and (Test-Path $desk)) { Copy-Item $report (Join-Path $desk 'halonic-mxc-variants-report.txt') -Force; Write-Host "A copy of this report is on your Desktop: halonic-mxc-variants-report.txt" }
}
Write-Host "To remove everything this check downloaded, delete the folders: $work and C:\halonic-mxc-check"  # leak-guard: allow absolute-path real-PC test folder on the tester machine
