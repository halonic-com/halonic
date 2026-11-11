// Phase 5 verdict probes (HAL-3776), part 2: ways around the native-srt file
// and process fence that the spike did not try. C1 starts WSL from inside srt
// (the README says the WSL service answers a sandboxed process), C2 reads a
// denied file through SMB to the machine's own shares, and C3 checks whether
// write grants of one session stay readable or writable in the next, and
// whether a deny stays behind. Report-only: results go to the job summary and to
// windows-isolation-results.json.
import { existsSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join, win32 } from "node:path";
import { createKit } from "./windows-probe-kit.mjs";

const kit = await createKit("isolation");
const { node, hidden, secret, port, settingsFor, inSrt, outsideSrt, record, tail, lastJson } = kit;

// ---- C1: WSL from inside srt ----------------------------------------------
const say = (r) => `exit ${r.code}: ${tail((r.out + r.err).replace(/\0/g, ""))}`;
async function wslCommand(label, command, denyExes) {
  const control = await outsideSrt(command);
  const inside = await inSrt(command);
  const denied = await inSrt(command, denyExes);
  const detail = `outside ${say(control)} | inside ${say(inside)} | inside with a deny on the WSL binaries ${say(denied)}`;
  record("C1 WSL", `${label} inside srt`, "INFO", detail);
  if (label.endsWith("--status")) return;
  if (control.code !== 0) {
    record(
      "C1 WSL",
      `${label}: a distro starts inside srt`,
      "NOT-TESTABLE",
      "no distro starts outside srt either",
    );
    return;
  }
  record(
    "C1 WSL",
    `${label}: a distro starts inside srt`,
    inside.code === 0 ? "FAIL" : "PASS",
    say(inside),
  );
  // srt refuses to start when it can't write a deny ACE (System32 files belong
  // to TrustedInstaller), so a non-zero exit alone doesn't show the deny held.
  const name = `${label}: a deny on the WSL binaries stops it`;
  if (/srt-win: error/.test(denied.out + denied.err)) {
    record(
      "C1 WSL",
      name,
      "INCONCLUSIVE",
      `srt could not apply the deny and did not start: ${say(denied)}`,
    );
    return;
  }
  record("C1 WSL", name, denied.code === 0 ? "FAIL" : "PASS", say(denied));
}
{
  const exes = kit
    .outsideSync("where", ["wsl.exe", "bash.exe", "wslhost.exe"])
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const distro = kit
    .outsideSync("wsl.exe", ["-l", "-q"], "utf16le")
    .split(/\r?\n/)
    .map((l) => l.replace(/\0/g, "").trim())
    .find(Boolean);
  record(
    "C1 WSL",
    "what the runner has",
    "INFO",
    `binaries: ${exes.join(", ") || "none"}; distro: ${distro ?? "none"}`,
  );
  if (exes.length === 0) {
    record("C1 WSL", "WSL from inside srt", "NOT-TESTABLE", "no wsl.exe on this runner");
  } else {
    const denyExes = settingsFor({ deny: [hidden, ...exes] });
    // Full paths: on the runner, PATH finds Git Bash's bash.exe before WSL's.
    const systemRoot = process.env.SystemRoot;
    if (!systemRoot) throw new Error("SystemRoot is not set");
    const system32 = win32.join(systemRoot, "System32");
    const wsl = win32.join(system32, "wsl.exe");
    const bash = win32.join(system32, "bash.exe");
    for (const command of [`${wsl} --status`, `${wsl} -e true`, `${bash} -c true`]) {
      await wslCommand(command, command, denyExes);
    }
    if (distro) {
      await kit.canaryProbe(
        "C1 WSL",
        "distro traffic to the canary",
        `${wsl} -u root -e bash -c "exec 3<>/dev/tcp/127.0.0.1/${port} && echo reached"`,
        "A WSL1 distro's socket is made by the WSL service, not the sandbox account.",
      );
    } else {
      record(
        "C1 WSL",
        "distro traffic to the canary",
        "NOT-TESTABLE",
        "no distro could be installed on this runner",
      );
    }
  }
}

// ---- C2: SMB to the machine's own shares ----------------------------------
function smbStatus(control, inside) {
  if (inside === "read") return "FAIL";
  return control === "read" ? "PASS" : "INCONCLUSIVE";
}
const lanman = await outsideSrt(
  `powershell -NoProfile -Command "(Get-Service LanmanServer).Status"`,
);
if (lanman.out.includes("Running")) {
  await outsideSrt(
    `powershell -NoProfile -Command "New-SmbShare -Name halonicprobe -Path '${hidden}' -ReadAccess Everyone | Out-Null"`,
  );
  const drive = win32.parse(secret).root.replace(/[:\\]/g, "");
  const rest = secret.slice(3);
  const ipv4 = Object.values(networkInterfaces())
    .flat()
    .find((i) => i.family === "IPv4" && !i.internal)?.address;
  const paths = {
    direct: secret,
    localhost: `\\\\localhost\\${drive}$\\${rest}`,
    "127.0.0.1": `\\\\127.0.0.1\\${drive}$\\${rest}`,
    "own IPv4": `\\\\${ipv4}\\${drive}$\\${rest}`,
    "::1 (ipv6-literal.net)": `\\\\--1.ipv6-literal.net\\${drive}$\\${rest}`,
    "a test share on the denied folder": "\\\\localhost\\halonicprobe\\secret.txt",
  };
  const smbChild = kit.script(
    "smb.mjs",
    `import { readFileSync } from "node:fs";
const paths = ${JSON.stringify(paths)}; const r = {};
for (const [k, p] of Object.entries(paths)) { try { r[k] = readFileSync(p, "utf8") === "hunter2" ? "read" : "other"; } catch (e) { r[k] = "blocked:" + e.code; } }
console.log(JSON.stringify(r));
`,
  );
  const control = lastJson((await outsideSrt(`"${node}" "${smbChild}"`)).out) ?? {};
  const raw = await inSrt(`"${node}" "${smbChild}"`);
  const inside = lastJson(raw.out);
  if (!inside) {
    record("C2 SMB loopback", "probe ran inside srt", "INCONCLUSIVE", tail(raw.err || raw.out));
  } else if (inside.direct === "read") {
    record(
      "C2 SMB loopback",
      "direct read of the denied file",
      "FAIL",
      "the deny itself does not hold",
    );
  } else {
    for (const k of Object.keys(paths).filter((k) => k !== "direct")) {
      const detail = `inside ${inside[k]}, control ${control[k]}`;
      record(
        "C2 SMB loopback",
        `read the denied file via ${k}`,
        smbStatus(control[k], inside[k]),
        detail,
      );
    }
  }
} else {
  record("C2 SMB loopback", "Server service", "NOT-TESTABLE", tail(lanman.err || lanman.out));
}

// ---- C3: write grants kept across sessions --------------------------------
{
  const a = kit.dir("project-a");
  const b = kit.dir("project-b");
  const never = kit.dir("never-granted");
  writeFileSync(join(never, "c.txt"), "never");
  const rw = kit.script(
    "rw.mjs",
    `import { readFileSync, rmSync, writeFileSync } from "node:fs";
const [op, path] = process.argv.slice(2);
try {
  if (op === "write") { writeFileSync(path, "x"); console.log("ok"); }
  else if (op === "delete") { rmSync(path); console.log("ok"); }
  else console.log("read:" + readFileSync(path, "utf8"));
}
catch (e) { console.log("blocked:" + e.code); }
`,
  );
  const acl = () =>
    kit
      .outsideSync("icacls", [a])
      .split(/\r?\n/)
      .filter((l) => !l.includes("processed"))
      .map((l) => l.replace(a, "").trim())
      .filter(Boolean)
      .join("; ");
  const op = async (settings, cwd, what, path) =>
    (await inSrt(`"${node}" "${rw}" ${what} "${path}"`, settings, cwd)).out
      .trim()
      .split(/\r?\n/)
      .pop();
  const sessionA = settingsFor({ read: [a], write: [a] });
  const sessionB = settingsFor({ read: [b], write: [b] });
  const sessionBDenyA = settingsFor({ read: [b], write: [b], deny: [hidden, a] });
  const aclBefore = acl();
  const s1 = await op(sessionA, a, "write", join(a, "a.txt"));
  const acl1 = acl();
  const s2 = await op(sessionB, b, "read", join(a, "a.txt"));
  const s2never = await op(sessionB, b, "read", join(never, "c.txt"));
  // HAL-5432: A keeps sandbox-runtime-users (M) after session 1, so a session
  // on B could also write there unless srt's write-restricted token stops it.
  // Before the deny session, whose deny stays on A and would block it anyway.
  // Checked from outside too, so a quiet success can't pass as a block.
  writeFileSync(join(a, "victim.txt"), "keep");
  const s2w = await op(sessionB, b, "write", join(a, "b-wrote.txt"));
  const s2d = await op(sessionB, b, "delete", join(a, "victim.txt"));
  const wroteA = existsSync(join(a, "b-wrote.txt"));
  const deletedA = !existsSync(join(a, "victim.txt"));
  const aclWrite = acl();
  const s2b = await op(sessionBDenyA, b, "read", join(a, "a.txt"));
  const acl2b = acl();
  const s3 = await op(sessionA, a, "write", join(a, "a3.txt"));
  const acl3 = acl();
  if (s1 === "ok") {
    // A read of the never-granted folder too means reads are open beyond the
    // grants, not only for roots an earlier session kept.
    const detail = `session on B reads A: ${s2}; reads a never-granted folder: ${s2never}`;
    record(
      "C3 kept grants",
      "kept-roots-readable: a session on B reads A",
      s2?.startsWith("read:") ? "FAIL" : "PASS",
      detail,
    );
    const writeDetail = `write: ${s2w}, file in A: ${wroteA}; delete: ${s2d}, file gone: ${deletedA}`;
    record(
      "C3 kept grants",
      "kept-roots-writable: a session on B writes in A",
      s2w === "ok" || wroteA ? "FAIL" : "PASS",
      writeDetail,
    );
    record(
      "C3 kept grants",
      "kept-roots-writable: a session on B deletes in A",
      s2d === "ok" || deletedA ? "FAIL" : "PASS",
      writeDetail,
    );
    record(
      "C3 kept grants",
      "a deny on A in session B blocks A",
      s2b?.startsWith("read:") ? "FAIL" : "PASS",
      s2b,
    );
    const deny = /\(DENY\)|\(N\)/;
    const denyStays = deny.test(acl3) && !deny.test(acl1);
    const status = s3 === "ok" && !denyStays ? "PASS" : "FAIL";
    record(
      "C3 kept grants",
      "a later session on A still writes after the deny",
      status,
      `write: ${s3}; deny left on A: ${denyStays}`,
    );
  } else {
    record("C3 kept grants", "session 1 writes in A", "INCONCLUSIVE", s1);
  }
  const acls = `before: ${aclBefore} || after 1: ${acl1} || after 2 writes: ${aclWrite} || after 2b: ${acl2b} || after 3: ${acl3}`;
  record("C3 kept grants", "A's ACL per step", "INFO", acls);
}

kit.finish(
  "Native srt on Windows: verdict probes, WSL, SMB and kept grants (HAL-3776)",
  "windows-isolation-results.json",
);
