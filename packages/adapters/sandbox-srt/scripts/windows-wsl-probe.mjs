// Phase 5 security review probes (HAL-5407), the two WSL questions the spike
// left open. D1: can srt's sandbox account register a WSL distro of its own
// with `wsl --import`, and if so, do the distro's files and network get past
// the fence? If it can, native srt stays experimental for good (HAL-3779,
// section 3). D2: does WSL 2 start on this runner at all, that is, can it host
// the `srt-wsl` attack suite (section 8)? D3 (HAL-7130): Studio's relay listens
// on Windows' 127.0.0.1 so the agent host in our distro listens on no port (W9).
// Can another distro reach such a port under mirrored networking, and not under
// NAT? Report-only: results go to the job summary and to windows-wsl-results.json.
//
// Needs HALONIC_PROBE_ROOTFS: a small Linux root file system (.tar.gz) for this
// runner's architecture, checked by the workflow against a pinned hash.
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, win32 } from "node:path";
import { createKit } from "./windows-probe-kit.mjs";

const kit = await createKit("wsl");
const { work, secret, port, canary, inSrt, outsideSrt, record, tail } = kit;
const say = (r) => `exit ${r.code}: ${tail((r.out + r.err).replace(/\0/g, ""))}`;

const systemRoot = process.env.SystemRoot;
if (!systemRoot) throw new Error("SystemRoot is not set");
const wsl = win32.join(systemRoot, "System32", "wsl.exe");
const rootfsSource = process.env.HALONIC_PROBE_ROOTFS;

// The root file system goes into the work folder: the sandbox account may read
// only what the profile grants.
const rootfs = join(work, "rootfs.tar.gz");
const haveInputs = existsSync(wsl) && rootfsSource !== undefined && existsSync(rootfsSource);
if (haveInputs) copyFileSync(rootfsSource, rootfs);

// ---- D1: a distro of the sandbox account's own ------------------------------
// Both WSL versions: WSL 1 needs no virtualisation, WSL 2 is what the sandbox
// account's own settings default to. Each runs outside srt first as the
// control: an import that fails for the runner's user too proves nothing.
// The distro's disk goes into the work folder (which the session may write),
// then the session's own temp and local app data folders, expanded by cmd
// inside the session: the WSL service may treat them differently.
const locations = (name) => [join(work, name), `%TEMP%\\${name}`, `%LOCALAPPDATA%\\${name}`];

async function importInside(name, version) {
  const tries = [];
  for (const location of locations(name)) {
    const imported = await inSrt(
      `cmd /c "${wsl} --import ${name} ${location} ${rootfs} --version ${version}"`,
    );
    tries.push(`${location}: ${say(imported)}`);
    if (imported.code === 0 || kit.srtFailed(imported)) return { imported, tries };
  }
  return { imported: { code: 1, out: "", err: "" }, tries };
}

async function sandboxDistro(version) {
  const group = `D1 sandbox-account distro (WSL ${version})`;
  const controlName = `halonic-control-v${version}`;
  const control = await outsideSrt(
    `${wsl} --import ${controlName} ${join(work, controlName)} ${rootfs} --version ${version}`,
  );
  if (control.code === 0) await outsideSrt(`${wsl} --unregister ${controlName}`);
  const name = `halonic-sandbox-v${version}`;
  const { imported, tries } = await importInside(name, version);
  const started = await inSrt(`${wsl} -d ${name} -e /bin/true`);
  const registered = imported.code === 0 && started.code === 0;
  const detail = `control ${say(control)} | import ${tries.join(" / ")} | start ${say(started)}`;
  const question = "the sandbox account registers and starts a distro of its own";
  if (registered) {
    record(group, question, "FAIL", detail);
  } else if (control.code !== 0 || kit.srtFailed(imported)) {
    record(group, question, "INCONCLUSIVE", detail);
    return;
  } else {
    record(group, question, "PASS", detail);
    return;
  }

  // The distro started, so test what it can reach: the denied secret through
  // the Windows drive, and the loopback canary.
  const drive = secret[0].toLowerCase();
  const linuxSecret = `/mnt/${drive}${secret.slice(2).replace(/\\/g, "/")}`;
  const read = await inSrt(`${wsl} -d ${name} -e cat ${linuxSecret}`);
  record(
    group,
    "the distro reads the denied secret through the Windows drive",
    read.out.includes("hunter2") ? "FAIL" : "PASS",
    say(read),
  );
  const before = canary.connections;
  const traffic = await inSrt(`${wsl} -d ${name} -e nc -w 3 127.0.0.1 ${port}`);
  const reached = canary.connections - before;
  record(
    group,
    "the distro reaches the loopback canary",
    reached === 0 ? "PASS" : "FAIL",
    `${reached} connection(s). ${say(traffic)}`,
  );
  // A WSL 2 distro's loopback is the VM's, not Windows', so also try a public
  // address that isn't on the allow list.
  const outside = await inSrt(
    `${wsl} -d ${name} -e sh -c "nc -z -w 5 1.1.1.1 443 && echo reached"`,
  );
  record(
    group,
    "the distro reaches a public address off the allow list",
    outside.out.includes("reached") ? "FAIL" : "PASS",
    say(outside),
  );
  const removed = await inSrt(`${wsl} --unregister ${name}`);
  record(group, "wsl --unregister inside srt", "INFO", say(removed));
}

// ---- D2: WSL 2 on this runner ----------------------------------------------
async function wsl2() {
  const group = "D2 WSL 2 on this runner";
  const facts = await outsideSrt(
    `powershell -NoProfile -Command "$cs = Get-CimInstance Win32_ComputerSystem; $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1; $vmp = Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform; 'model=' + $cs.Model + ' hypervisor=' + $cs.HypervisorPresent + ' vt-firmware=' + $cpu.VirtualizationFirmwareEnabled + ' vm-platform=' + $vmp.State"`,
  );
  record(group, "machine facts", "INFO", say(facts));
  const name = "halonic-probe-wsl2";
  const imported = await outsideSrt(
    `${wsl} --import ${name} ${join(work, "wsl2-distro")} ${rootfs} --version 2`,
  );
  const started = await outsideSrt(`${wsl} -d ${name} -e uname -r`);
  // INFO, not PASS/FAIL: this answers whether CI can host the srt-wsl suite.
  const works = imported.code === 0 && started.code === 0;
  record(
    group,
    works ? "WSL 2 runs here: the srt-wsl suite can run on this runner" : "WSL 2 does not run here",
    "INFO",
    `import ${say(imported)} | start ${say(started)}`,
  );
  if (imported.code === 0) await outsideSrt(`${wsl} --unregister ${name}`);
}

// ---- D3: another distro and a Windows loopback port, per networking mode ---
// The canary on Windows' 127.0.0.1 stands in for Studio's relay. A distro that
// isn't ours (not `halonic`) tries it in NAT mode (the control) and in mirrored
// mode. No srt here: this is the person's own distro, outside every sandbox.
const wslconfig = process.env.USERPROFILE && join(process.env.USERPROFILE, ".wslconfig");

async function networkMode(mode) {
  const group = `D3 another distro, ${mode} networking`;
  writeFileSync(wslconfig, `[wsl2]\nnetworkingMode=${mode}\n`);
  await outsideSrt(`${wsl} --shutdown`);
  const name = "other-distro";
  const imported = await outsideSrt(
    `${wsl} --import ${name} ${join(work, `other-${mode}`)} ${rootfs} --version 2`,
  );
  const facts = await outsideSrt(
    `${wsl} -d ${name} -e sh -c "wslinfo --networking-mode 2>&1; ip -4 -o addr 2>&1 | head -4"`,
  );
  record(group, "networking mode in the distro", "INFO", `import ${say(imported)} | ${say(facts)}`);
  const question = "another distro reaches a port on Windows' 127.0.0.1";
  if (imported.code !== 0 || facts.code !== 0) {
    record(group, question, "NOT-TESTABLE", "the distro did not start");
  } else {
    const before = canary.connections;
    const traffic = await outsideSrt(`${wsl} -d ${name} -e nc -w 3 127.0.0.1 ${port}`);
    const reached = canary.connections - before;
    // wslinfo reports the mode WSL actually used: a result in the wrong mode
    // answers nothing.
    let status = reached === 0 ? "PASS" : "FAIL";
    if (!facts.out.includes(mode)) status = "INCONCLUSIVE";
    record(group, question, status, `${reached} connection(s). ${say(traffic)}`);
  }
  if (imported.code === 0) await outsideSrt(`${wsl} --unregister ${name}`);
}

async function mirrored() {
  if (!wslconfig) {
    record("D3 another distro", "networking modes", "NOT-TESTABLE", "USERPROFILE is not set");
    return;
  }
  const saved = existsSync(wslconfig) ? readFileSync(wslconfig) : undefined;
  try {
    await networkMode("nat");
    await networkMode("mirrored");
  } finally {
    if (saved === undefined) rmSync(wslconfig, { force: true });
    else writeFileSync(wslconfig, saved);
    await outsideSrt(`${wsl} --shutdown`);
  }
}

if (haveInputs) {
  await sandboxDistro(1);
  await sandboxDistro(2);
  await wsl2();
  await mirrored();
} else {
  record(
    "D WSL",
    "WSL probes",
    "NOT-TESTABLE",
    `wsl.exe present: ${existsSync(wsl)}; HALONIC_PROBE_ROOTFS: ${rootfsSource ?? "not set"}`,
  );
}

kit.finish("WSL probes (HAL-5407)", "windows-wsl-results.json");
