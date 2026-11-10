@echo off
rem Halonic MXC diagnosis - double-click this file. No admin needed. Nothing is installed system-wide, nothing is uploaded.
rem Internal spike tool (HAL-3503). Not for publishing.
title Halonic MXC diagnosis
set "MXC_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:MXC_SELF); iex $t.Substring($t.IndexOf('#PS'+'BEGIN'))"
echo.
pause
exit /b
#PSBEGIN
$ErrorActionPreference = 'Stop'
$CheckJs = @'
// Halonic MXC diagnosis (HAL-3503): same box, many ways of granting a folder, in several places. Prints one table.
import { spawnSync } from "node:child_process";
import { dirname, join, parse } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { performance } from "node:perf_hooks";

const facts = JSON.parse(process.env.MXC_FACTS ?? "{}");
const reportFile = process.env.MXC_REPORT;
writeFileSync(reportFile, "");
const say = (s = "") => { console.log(s); appendFileSync(reportFile, s + "\n"); };
const q = (p) => `"${p}"`;
const { run, getPlatformSupport } = await import("@microsoft/mxc-sdk/v1");
const nodeDir = dirname(process.execPath);
const UI = { disable: false, clipboard: "none", allowInputInjection: false };

async function box(command, { work, ro = [], rw = [], denied = [], env, flags = false }) {
  const t0 = performance.now();
  const environment = { ...(env ?? {}), ...(flags ? { NODE_OPTIONS: "--preserve-symlinks --preserve-symlinks-main" } : {}) };
  try {
    const out = await run({
      command,
      filesystem: { readonlyPaths: ro, readwritePaths: [work, ...rw], deniedPaths: denied },
      workingDirectory: work,
      ...(Object.keys(environment).length ? { environment, inheritDefaultEnvironment: true } : {}),
      network: { egress: { default: "deny" }, ingress: { default: "deny", hostLoopback: "deny" } },
      timeoutMs: 60_000,
      ui: UI,
    });
    return { exit: out.exitCode, out: String(out.stdout ?? "").trim(), err: String(out.stderr ?? "").trim(), ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { exit: null, error: String(e?.message ?? e).split("\n")[0].slice(0, 200), out: "", err: "", ms: Math.round(performance.now() - t0) };
  }
}
const ok = (r) => r.exit === 0 && !r.error;
const why = (r) => ok(r) ? "" : (r.error ?? `exit ${r.exit}: ${(r.err || r.out).split(/\r?\n/)[0].slice(0, 120)}`);

let support;
try { support = getPlatformSupport(); } catch (e) { support = { isSupported: false, reason: String(e) }; }
say(`Windows: ${facts.windows} (edition ${facts.edition_id}, version ${facts.version}, build ${facts.build}, ${facts.architecture}), admin: ${facts.admin}`);
say(`MXC support: ${support.isSupported ? "yes" : "NO"}; tier: ${support.isolationTier ?? "?"}; methods: ${(support.availableMethods ?? []).join(", ")}; user: ${process.env.USERDOMAIN}\\${process.env.USERNAME}`);
say(`Node: ${process.version} at ${process.execPath}`);

const drive = process.env.SystemDrive ?? "C:";
const places = [
  ["AppData\\Local", join(process.env.LOCALAPPDATA, "halonic-mxc-diag")],
  ["drive root", join(drive + "\\", "halonic-mxc-diag")],
  ["Users\\Public", join(process.env.PUBLIC ?? drive + "\\Users\\Public", "halonic-mxc-diag")],
  ["Temp", join(process.env.TEMP ?? process.env.LOCALAPPDATA, "halonic-mxc-diag")],
  ["Documents", join(process.env.USERPROFILE, "Documents", "halonic-mxc-diag")],
];

const rows = []; // place, test, status, note
const rec = (place, test, status, note = "") => { rows.push({ place, test, status, note }); say(`  ${status.padEnd(4)} [${place}] ${test}${note ? "  -> " + note : ""}`); };

for (const [place, base] of places) {
  say("");
  say(`=== ${place}: ${base}`);
  try {
    rmSync(base, { recursive: true, force: true });
    mkdirSync(base, { recursive: true });
  } catch (e) { rec(place, "create folder", "SKIP", String(e.message).slice(0, 100)); continue; }
  const work = mkdtempSync(join(base, "work-"));
  const allowed = mkdtempSync(join(base, "allowed-"));
  writeFileSync(join(allowed, "control.txt"), "control");
  writeFileSync(join(work, "w.txt"), "work");
  const typeCmd = (f) => `cmd.exe /c type ${q(f)}`;
  const ctl = join(allowed, "control.txt");

  // ACL facts for this place (host side, no box needed)
  const ic = (p) => { const r = spawnSync("icacls.exe", [p], { encoding: "utf8" }); return (r.stdout || r.stderr || "").trim().split(/\r?\n/).filter((l) => l && !/Successfully/.test(l)).map((l) => l.trim()).join(" | ").slice(0, 600); };
  say(`  ACL ${base}: ${ic(base)}`);
  say(`  ACL ${allowed}: ${ic(allowed)}`);
  say(`  ACL ${dirname(base)}: ${ic(dirname(base))}`);

  const t = async (test, fn) => { const r = await fn(); rec(place, test, ok(r) ? "PASS" : "FAIL", why(r)); return r; };

  // 0. start
  await t("box starts (cmd, own work folder rw)", () => box("cmd.exe /c exit 0", { work }));
  // 1. rw work folder readable from inside
  await t("cmd reads a file in its own rw work folder", () => box(typeCmd(join(work, "w.txt")), { work }));
  await t("cmd lists its own rw work folder (dir)", () => box(`cmd.exe /c dir ${q(work)}`, { work }));
  // 2. grant forms for the read-only folder
  await t("ro grant: plain folder path", () => box(typeCmd(ctl), { work, ro: [allowed] }));
  await t("ro grant: folder path with trailing backslash", () => box(typeCmd(ctl), { work, ro: [allowed + "\\"] }));
  await t("ro grant: forward slashes", () => box(typeCmd(ctl), { work, ro: [allowed.replaceAll("\\", "/")] }));
  await t("ro grant: the file itself", () => box(typeCmd(ctl), { work, ro: [ctl] }));
  await t("ro grant: the parent of all (base) folder", () => box(typeCmd(ctl), { work, ro: [base] }));
  await t("rw grant: the folder as read-write instead", () => box(typeCmd(ctl), { work, rw: [allowed] }));
  await t("ro grant + working folder = the allowed folder", () => box(typeCmd(ctl), { work: allowed, ro: [allowed] }));
  const r83 = spawnSync("cmd.exe", ["/c", `for %I in (${q(allowed)}) do @echo %~sI`], { encoding: "utf8" }).stdout?.trim();
  if (r83 && r83 !== allowed && existsSync(r83)) await t("ro grant: 8.3 short path", () => box(typeCmd(join(r83, "control.txt")), { work, ro: [r83] }));
  // grant the user profile chain read-only (parent traverse)
  const chain = []; for (let p = dirname(base); p !== parse(p).root && chain.length < 4; p = dirname(p)) chain.push(p);
  await t("ro grant: folder + its parent chain (up to 4 levels)", () => box(typeCmd(ctl), { work, ro: [allowed, ...chain] }));
  // 3. Node
  const child = join(work, "child.mjs");
  writeFileSync(child, `console.log("child ok", process.version);\n`);
  const nodeCmd = (extra = "") => `${q(process.execPath)} ${extra} ${q(child)}`;
  await t("node child.mjs from rw work folder (no flags)", () => box(nodeCmd(), { work, ro: [nodeDir] }));
  await t("node child.mjs (flags --preserve-symlinks[-main])", () => box(nodeCmd("--preserve-symlinks --preserve-symlinks-main"), { work, ro: [nodeDir] }));
  await t("node child.mjs (flags) + parent chain readable", () => box(nodeCmd("--preserve-symlinks --preserve-symlinks-main"), { work, ro: [nodeDir, ...chain] }));
  await t("node child.mjs (no flags) + parent chain readable", () => box(nodeCmd(), { work, ro: [nodeDir, ...chain] }));
  const child2 = join(work, "child2.mjs");
  writeFileSync(child2, `import { readFileSync } from "node:fs"; console.log(readFileSync(${JSON.stringify(ctl)}, "utf8"));\n`);
  await t("node reads the ro-granted control.txt (flags)", () => box(`${q(process.execPath)} --preserve-symlinks --preserve-symlinks-main ${q(child2)}`, { work, ro: [nodeDir, allowed] }));
  // 4. what does the box see?
  const who = await box("cmd.exe /c whoami /all", { work });
  say(`  whoami inside: ${(who.out || who.err || who.error || "").split(/\r?\n/).filter((l) => /S-1-|User Name|AppContainer|Mandatory/i.test(l)).map((l) => l.trim().slice(0, 110)).slice(0, 6).join(" | ")}`);
  const dirp = await box(`cmd.exe /c dir ${q(dirname(base))}`, { work });
  say(`  dir of parent inside: ${ok(dirp) ? "listed" : why(dirp)}`);
  rmSync(base, { recursive: true, force: true });
}

say("");
say("SUMMARY (PASS counts per place)");
for (const [place] of places) {
  const r = rows.filter((x) => x.place === place && x.status !== "SKIP");
  if (r.length) say(`  ${place}: ${r.filter((x) => x.status === "PASS").length}/${r.length} pass; failing: ${r.filter((x) => x.status === "FAIL").map((x) => x.test).join("; ") || "none"}`);
}
say(`Windows: ${facts.windows}, edition ${facts.edition_id}, build ${facts.build}`);
'@
$NodeVersion = '24.21.0'
$SdkVersion = '1.0.1'
$work = Join-Path $env:LOCALAPPDATA 'halonic-mxc-diag'
New-Item -ItemType Directory -Force $work | Out-Null

Write-Host ''
Write-Host '=== Halonic MXC diagnosis ===' -ForegroundColor Cyan
Write-Host 'This tests whether Windows can keep a program inside a locked box (a "process container").'
Write-Host 'It uses a small private folder in your user profile and removes nothing outside it.'
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
  [IO.File]::WriteAllText("$sdk\diag.mjs", $CheckJs, (New-Object Text.UTF8Encoding($false)))
  Write-Host 'Step 3/3: running the checks (about 5 minutes)...'
  Write-Host ''
  $env:MXC_REPORT = Join-Path $work 'report.txt'
  Push-Location $sdk
  & $nodeExe diag.mjs
  Pop-Location
} catch {
  Write-Host ''
  Write-Host "COULD NOT RUN THE CHECK: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Please send this window (a photo or screenshot is fine) to the Halonic team.'
}
$report = Join-Path $work 'report.txt'
if (Test-Path $report) {
  $desk = [Environment]::GetFolderPath('Desktop')
  if ($desk -and (Test-Path $desk)) { Copy-Item $report (Join-Path $desk 'halonic-mxc-diag-report.txt') -Force; Write-Host "A copy of this report is on your Desktop: halonic-mxc-diag-report.txt" }
}
Write-Host "To remove everything this check downloaded, delete the folder: $work"
