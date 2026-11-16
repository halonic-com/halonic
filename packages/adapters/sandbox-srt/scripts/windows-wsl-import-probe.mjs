// Who owns the files of the WSL import mount, and does one import work (HAL-10927,
// for HAL-10926). Imports a small Windows git folder into a WSL 2 distro with
// the real `importWindowsProject` (src/wsl-import.ts), so the mount is the real
// `ro,noexec,nosuid,nodev,umask=077` mount with no `uid=`. Before that, on a
// mount of the same kind, as root: the owner and mode of `.git`, and the
// `git clone` and `git fetch` of the import run WITHOUT `safe.directory`, to see
// whether either fails with "detected dubious ownership".
// Report-only: results go to the job summary and to the log.
//
// Needs HALONIC_PROBE_ROOTFS: a small Linux root file system (.tar.gz).
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { importWindowsProject } from "../src/wsl-import.ts";
import { withImportMount } from "../src/wsl-mounts.ts";

const systemRoot = process.env.SystemRoot;
if (!systemRoot) throw new Error("SystemRoot is not set");
const wsl = win32.join(systemRoot, "System32", "wsl.exe");
const rootfs = process.env.HALONIC_PROBE_ROOTFS;
const DISTRO = "halonic-import-probe";
const lines = [];
const say = (text) => {
  lines.push(text);
  console.log(text);
};
const clean = (s) => s.replace(/[\0\r]/g, "").trim();

function exec(file, args) {
  return new Promise((done) => {
    const child = spawn(file, args, { windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      err += d;
    });
    child.on("error", (e) => done({ code: 127, out, err: String(e) }));
    child.on("close", (code) => done({ code: code ?? 1, out, err }));
  });
}

// WslRoot: argv as root in the distro, no shell. Every command's result is kept.
const trace = [];
const root = {
  async run(argv) {
    const r = await exec(wsl, ["-d", DISTRO, "-u", "root", "--exec", ...argv]);
    trace.push({ argv, ...r });
    return { code: r.code, stdout: r.out };
  },
};
const rootRaw = async (argv) => {
  const r = await exec(wsl, ["-d", DISTRO, "-u", "root", "--exec", ...argv]);
  return { ...r, text: clean(`${r.out}\n${r.err}`) };
};

const dubious = (text) => /dubious ownership/i.test(text);

say("# WSL import: who owns the mount's files (HAL-10927)\n");
if (!existsSync(wsl) || !rootfs || !existsSync(rootfs)) {
  say(`NOT-TESTABLE: wsl.exe present: ${existsSync(wsl)}; HALONIC_PROBE_ROOTFS: ${rootfs ?? "not set"}`);
  finish();
  process.exit(0);
}

const base = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), "halonic-import-probe-"));
const imported = await exec(wsl, ["--import", DISTRO, join(base, "distro"), rootfs, "--version", "2"]);
say(`- distro import (WSL 2): exit ${imported.code} ${clean(imported.out + imported.err).slice(-300)}`);
if (imported.code !== 0) {
  say("\nWSL 2 does not start on this runner: this is a real-PC test.");
  finish();
  process.exit(0);
}

try {
  const version = await rootRaw(["uname", "-r"]);
  say(`- kernel in the distro: ${version.text}`);
  const setup = await rootRaw([
    "sh",
    "-c",
    "apk add --no-cache git >/dev/null 2>&1; adduser -D halonic; git --version; id halonic",
  ]);
  say(`- distro set-up (git, user halonic): exit ${setup.code} ${setup.text.replace(/\n/g, " | ")}`);

  // A small Windows git repository: a commit, a second branch, one uncommitted change, one untracked file.
  const source = join(base, "source");
  mkdirSync(source);
  const git = (...args) => spawnSync("git", args, { cwd: source, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "probe@example.com");
  git("config", "user.name", "probe");
  writeFileSync(join(source, "a.txt"), "one\n");
  git("add", ".");
  git("commit", "-q", "-m", "first");
  git("branch", "other");
  writeFileSync(join(source, "a.txt"), "two\n");
  writeFileSync(join(source, "new.txt"), "untracked\n");
  say(`- source repository on Windows: ${source}\n`);

  // Part 1: the mount, as root, and the import's git commands without safe.directory.
  say("## 1. On the import mount, as root");
  try {
    await withImportMount(root, source, async (mount) => {
      const opts = await rootRaw(["sh", "-c", `grep " ${mount} " /proc/mounts`]);
      say(`- mount: \`${opts.text}\``);
      const stat = await rootRaw(["stat", "-c", "%U %a", `${mount}/.git`]);
      say(`- **\`stat -c '%U %a' <mount>/.git\`: \`${stat.text}\`** (exit ${stat.code})`);
      const ids = await rootRaw(["stat", "-c", "uid=%u gid=%g", `${mount}/.git`, `${mount}/a.txt`]);
      say(`- uid/gid of .git and a.txt: \`${ids.text.replace(/\n/g, " ; ")}\``);
      const dest = posix.join(mount, "..", "probe-clone");
      
      const rp = await rootRaw(["git", "-C", mount, "rev-parse", "--is-inside-work-tree"]);
      say(
        `- \`git -C <mount> rev-parse\` without safe.directory: exit ${rp.code}, dubious ownership: **${dubious(rp.text)}** (${rp.text.slice(0, 200)})`,
      );
      const clone = await rootRaw(["git", "clone", "--no-hardlinks", "--", mount, dest]);
      say(
        `- \`git clone\` without safe.directory: exit ${clone.code}, dubious ownership: **${dubious(clone.text)}** (${clone.text.slice(0, 200).replace(/\n/g, " | ")})`,
      );
      const fetch = await rootRaw([
        "git",
        "-C",
        dest,
        "fetch",
        "--update-head-ok",
        "--no-tags",
        "--",
        mount,
        "+refs/heads/*:refs/heads/*",
      ]);
      say(
        `- \`git fetch\` without safe.directory: exit ${fetch.code}, dubious ownership: **${dubious(fetch.text)}** (${fetch.text.slice(0, 200).replace(/\n/g, " | ")})`,
      );
      await rootRaw(["rm", "-rf", dest]);
    });
  } catch (error) {
    say(`- the mount step failed: ${String(error)}`);
  }

  // Part 2: one import end to end with the code of this branch.
  say("\n## 2. One import end to end (importWindowsProject)");
  trace.length = 0;
  try {
    const skipped = [];
    const where = await importWindowsProject(root, source, "probe-project", (r) => skipped.push(r));
    say(`- import: **succeeded**, project at \`${where}\`, skipped remotes: ${skipped.length}`);
    const check = await rootRaw([
      "sh",
      "-c",
      `cd ${where} && git -c safe.directory=${where} branch --list && cat a.txt new.txt && stat -c '%U:%G' .`,
    ]);
    say(`- the project: \`${check.text.replace(/\n/g, " | ")}\``);
  } catch (error) {
    say(`- import: **failed**: ${String(error)}`);
  }
  const bad = trace.filter((t) => t.code !== 0 || dubious(t.err));
  for (const t of bad)
    say(
      `  - exit ${t.code}: \`${t.argv.join(" ").slice(0, 160)}\`: ${clean(t.err).slice(0, 240).replace(/\n/g, " | ")}`,
    );
  say(`- any command of the import with "dubious ownership": **${trace.some((t) => dubious(t.err))}**`);
} finally {
  await exec(wsl, ["--unregister", DISTRO]);
  finish();
}

function finish() {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `${lines.join("\n")}\n`);
}
