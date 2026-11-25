// The fast pool's snapshot of the shared caches (HAL-16032, Julian's N1 on HAL-15972): a fast
// slot's overlay reads a generation nothing changes while it's mounted, never the live
// /cache/trusted. These tests run vm/halonic-ci-fast-lower.sh as shipped, with only its fixed paths
// pointed at temporary folders and stubs for what needs root (setpriv, install -o, chown) or XFS
// (cp --reflink).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { read } from "./hook-run.mjs";

const root = mkdtempSync(join(tmpdir(), "halonic-ci-fast-lower-"));
after(() => rmSync(root, { recursive: true, force: true }));
const shipped = read("vm/halonic-ci-fast-lower.sh");

// A fresh VM: /cache/trusted with a pnpm entry and a Turbo entry (no Playwright folder yet), an
// empty /cache/fast-lower, no mounts. `settle` replaces SETTLE (negative: every file counts as old).
const vm = ({ settle = -60, evilLink = false } = {}) => {
  const box = mkdtempSync(join(root, "vm-"));
  const trusted = join(box, "trusted");
  const lower = join(box, "fast-lower");
  const bin = join(box, "bin");
  const log = join(box, "calls.log");
  for (const folder of [join(trusted, "pnpm-store/v10"), join(trusted, "turbo/a"), bin]) {
    mkdirSync(folder, { recursive: true });
  }
  writeFileSync(join(trusted, "pnpm-store/v10/index.json"), "{}");
  writeFileSync(join(trusted, "turbo/a/x.tar.zst"), "entry");
  writeFileSync(join(box, "subuid"), "dockremap:100000:65536\n");
  writeFileSync(join(box, "mountinfo"), "");
  mkdirSync(join(box, "outside"));
  writeFileSync(join(box, "outside/x.tar.zst"), "a VM file");
  const stub = (name, body) =>
    writeFileSync(join(bin, name), `#!/bin/bash\necho "${name} $*" >> ${log}\n${body}\n`, {
      mode: 0o755,
    });
  stub("setpriv", 'while [ "$1" != -- ]; do shift; done; shift; exec "$@"');
  stub("chown", "exit 0");
  stub(
    "install",
    `a=(); while [ $# -gt 0 ]; do case "$1" in -o|-g) shift 2;; *) a+=("$1"); shift;; esac; done; exec /usr/bin/install "\${a[@]}"`,
  );
  // No reflinks on a test runner's disk. With evilLink, the copy finds turbo/a swapped for a link
  // to a VM folder, as a job could do mid-copy.
  const evil = evilLink
    ? `if [[ "$*" == */turbo* ]]; then rm -rf "\${@: -1}/a"; ln -s ${join(box, "outside")} "\${@: -1}/a"; fi`
    : "";
  stub(
    "cp",
    `a=(); for x in "$@"; do [ "$x" = --reflink=always ] || a+=("$x"); done\n/usr/bin/cp "\${a[@]}" || exit $?\n${evil}`,
  );
  const script = join(box, "fast-lower.sh");
  writeFileSync(
    script,
    shipped
      .replace("TRUSTED=/cache/trusted", `TRUSTED=${trusted}`)
      .replace("LOWER=/cache/fast-lower", `LOWER=${lower}`)
      .replace("MOUNTS=/proc/self/mountinfo", `MOUNTS=${join(box, "mountinfo")}`)
      .replace("SUBUID=/etc/subuid", `SUBUID=${join(box, "subuid")}`)
      .replace("SETTLE=120", `SETTLE=${settle}`)
      .replace("SLOTS=/etc/halonic-ci/slots", `SLOTS=${join(box, "slots")}`)
      .replace(
        "MAINT_LOCK=/run/lock/halonic-ci-maint.lock",
        `MAINT_LOCK=${join(box, "maint.lock")}`,
      ),
  );
  const run = (...args) => {
    const res = spawnSync("/bin/bash", [script, ...args], {
      encoding: "utf8",
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    return { ...res, out: res.stdout + res.stderr };
  };
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8") : "");
  return { box, trusted, lower, run, calls };
};
const generations = (lower) => readdirSync(lower).filter((name) => /^[0-9]+$/.test(name));

test("fast lower: refresh copies the shared caches into a generation and makes it current", () => {
  const { trusted, lower, run } = vm();
  const res = run("refresh");
  assert.equal(res.status, 0, res.out);
  const gen = readlinkSync(join(lower, "current"));
  assert.match(gen, /^[0-9]+$/);
  assert.equal(readFileSync(join(lower, gen, "pnpm-store/v10/index.json"), "utf8"), "{}");
  assert.equal(readFileSync(join(lower, gen, "turbo/a/x.tar.zst"), "utf8"), "entry");
  assert.deepEqual(readdirSync(join(lower, gen, "ms-playwright")), []);
  assert.deepEqual(generations(lower), [gen]);
  // What a job writes afterwards stays out of the generation an overlay may have mounted.
  writeFileSync(join(trusted, "turbo/a/x.tar.zst"), "half-writ");
  writeFileSync(join(trusted, "turbo/a/y.tar.zst"), "new");
  assert.equal(readFileSync(join(lower, gen, "turbo/a/x.tar.zst"), "utf8"), "entry");
  assert.equal(existsSync(join(lower, gen, "turbo/a/y.tar.zst")), false);
  const current = run("current");
  assert.equal(current.status, 0, current.out);
  assert.equal(current.stdout.trim(), join(lower, gen));
});

test("fast lower: copies with reflinks only, as the cache's uid, never as root", () => {
  const { run, calls } = vm();
  assert.equal(run("refresh").status, 0);
  const log = calls();
  assert.match(
    log,
    /^setpriv --reuid=101001 --regid=101001 --clear-groups -- cp -a --reflink=always /m,
  );
  assert.match(log, /^setpriv --reuid=101001 --regid=101001 --clear-groups -- find \. /m);
  assert.match(log, /^setpriv --reuid=101001 --regid=101001 --clear-groups -- bash -c /m);
  assert.doesNotMatch(log, /^cp (?!-a --reflink=always )/m);
  // Without a dockremap range there is no uid to copy as: no copy at all.
  const bare = vm();
  writeFileSync(join(bare.box, "subuid"), "");
  const res = bare.run("refresh");
  assert.notEqual(res.status, 0);
  assert.match(res.out, /no dockremap range/);
  assert.doesNotMatch(bare.calls(), /^cp /m);
});

test("fast lower: leaves out what changed just before or during the copy", () => {
  const { lower, run } = vm({ settle: 120 });
  assert.equal(run("refresh").status, 0);
  const gen = readlinkSync(join(lower, "current"));
  // Both files were written seconds ago, so either may have been copied half-written.
  assert.equal(existsSync(join(lower, gen, "turbo/a/x.tar.zst")), false);
  assert.equal(existsSync(join(lower, gen, "pnpm-store/v10/index.json")), false);
  assert.equal(existsSync(join(lower, gen, "turbo/a")), true);
});

test("fast lower: a link swapped in mid-copy can't make the clean-up delete outside the generation", () => {
  const { box, lower, run } = vm({ settle: 120, evilLink: true });
  const res = run("refresh");
  assert.equal(res.status, 0, res.out);
  assert.equal(readFileSync(join(box, "outside/x.tar.zst"), "utf8"), "a VM file");
  assert.ok(generations(lower).length === 1);
});

test("fast lower: refresh deletes old generations unless an overlay still mounts them", () => {
  const { box, lower, run } = vm();
  for (const gen of ["100", "200"]) mkdirSync(join(lower, gen, "turbo"), { recursive: true });
  writeFileSync(
    join(box, "mountinfo"),
    `801 790 0:61 / /run/halonic-ci-ovl/fast-1/turbo rw - overlay overlay rw,lowerdir=${lower}/200/turbo,upperdir=x\n`,
  );
  assert.equal(run("refresh").status, 0);
  const gen = readlinkSync(join(lower, "current"));
  assert.deepEqual(generations(lower).sort(), ["200", gen].sort());
  assert.equal(
    readdirSync(lower).some((name) => name.startsWith(".new-")),
    false,
  );
});

test("fast lower: current makes the first generation, and refuses a current that isn't one", () => {
  const { lower, run } = vm();
  const first = run("current");
  assert.equal(first.status, 0, first.out);
  assert.equal(first.stdout.trim(), join(lower, readlinkSync(join(lower, "current"))));
  rmSync(join(lower, "current"));
  mkdirSync(join(lower, "x"));
  symlinkSync("x", join(lower, "current"));
  const res = run("current");
  assert.notEqual(res.status, 0);
  assert.match(res.out, /is not a generation/);
  assert.equal(run("nonsense").status, 2);
});

test("fast lower: fast slots mount a generation, never /cache/trusted", () => {
  const slot = read("vm/halonic-runner-slot.sh");
  assert.ok(slot.includes('"lowerdir=$LOWER_GEN/$c,upperdir=$OVL/$c/upper,workdir=$OVL/$c/work"'));
  assert.doesNotMatch(slot, /lowerdir=\$TRUSTED/);
  // The generation is read and mounted under the shared lock refresh takes to delete one.
  assert.match(slot, /\(\n {4}flock -s 9\n {4}LOWER_GEN=\$\("\$FAST_LOWER" current\)\n/);
  assert.ok(slot.includes(') 9>"$FAST_LOWER_LOCK"'));
  assert.ok(slot.includes("FAST_LOWER_LOCK=/cache/fast-lower/.lock"));
  assert.ok(shipped.includes('9>"$LOWER/.lock"'));
});

test("fast lower: refreshed every 5 minutes on its own timer, by the script's timer command (HAL-18424)", () => {
  assert.match(read("vm/halonic-ci-fast-lower.timer"), /^OnCalendar=\*:0\/5$/m);
  assert.match(
    read("vm/halonic-ci-fast-lower.service"),
    /^ExecStart=\/usr\/local\/sbin\/halonic-ci-fast-lower\.sh timer$/m,
  );
  // One refresher only: the hourly check no longer copies too.
  assert.doesNotMatch(read("vm/halonic-ci-maint.sh"), /fast-lower\.sh refresh/);
});

test("fast lower: the timer refreshes once fast slots are listed, and says why it skipped otherwise", () => {
  const { box, lower, run } = vm();
  const none = run("timer");
  assert.equal(none.status, 0, none.out);
  assert.match(none.out, /refresh skipped: no fast slot in /);
  assert.equal(existsSync(join(lower, "current")), false);
  writeFileSync(join(box, "slots"), "halonic-runner@large-1 halonic-runner@fast-1\n");
  const res = run("timer");
  assert.equal(res.status, 0, res.out);
  assert.match(res.out, /generation [0-9]+ is current/);
  assert.equal(generations(lower).length, 1);
});

test("fast lower: the timer skips while the cache check holds its lock, and fails once the snapshot is stale", async () => {
  const { box, lower, run } = vm();
  writeFileSync(join(box, "slots"), "halonic-runner@fast-1\n");
  const lock = join(box, "maint.lock");
  // The hourly check, holding the lock until its stdin closes.
  const holder = spawn("flock", ["-x", lock, "-c", "echo held; read -r _"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  await new Promise((resolve) => holder.stdout.once("data", resolve));
  try {
    const fresh = String(Math.floor(Date.now() / 1000) - 60);
    mkdirSync(join(lower, fresh, "turbo"), { recursive: true });
    symlinkSync(fresh, join(lower, "current"));
    const skipped = run("timer");
    assert.equal(skipped.status, 0, skipped.out);
    assert.match(
      skipped.out,
      /refresh skipped: the weekly cleanup or the hourly cache check holds /,
    );
    assert.deepEqual(generations(lower), [fresh]);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    mkdirSync(join(lower, old, "turbo"), { recursive: true });
    rmSync(join(lower, "current"));
    symlinkSync(old, join(lower, "current"));
    const stale = run("timer");
    assert.notEqual(stale.status, 0);
    assert.match(stale.out, /current generation is [0-9]+s old \(limit 1800s\)/);
  } finally {
    holder.stdin.end();
    await new Promise((resolve) => holder.once("exit", resolve));
  }
});

test("fast lower: only an idle fast slot leaves a stale snapshot, and only once GitHub let its runner go (HAL-18424)", () => {
  const slot = read("vm/halonic-runner-slot.sh");
  const check = slot.slice(
    slot.indexOf("idle_on_stale_snapshot() {"),
    slot.indexOf("release_idle_runner() {"),
  );
  assert.ok(check.includes('[ "$LABEL" = halonic-ci-fast ] && [ "$JOB_START" = 0 ] || return 1'));
  assert.ok(check.includes('[ $((now - MOUNTED_GEN)) -gt "$STALE_GEN_S" ] || return 1'));
  assert.ok(check.includes('[ "$cur" -gt "$MOUNTED_GEN" ]'));
  assert.ok(slot.includes("STALE_GEN_S=600; WARN_GEN_S=1800;"));
  assert.ok(check.includes("warning: idle on snapshot $MOUNTED_GEN"));
  // The runner is deleted first (GitHub refuses while it holds a job); the container stops only after.
  assert.ok(
    slot.includes(
      'if idle_on_stale_snapshot && release_idle_runner; then\n    echo "slot $SLOT: idle on snapshot $MOUNTED_GEN, restarting on a newer one"\n    docker rm -f "hci-$SLOT"',
    ),
  );
  assert.match(slot, /release_idle_runner\(\) \{[^}]*curl -fsS -o \/dev\/null -X DELETE/);
});
