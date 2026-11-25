// The job-started hook is the boundary that keeps fork and pull request code off our CI
// server (HAL-14831, Julian's C1/C2). These tests run the hook as shipped against sample
// events (hook-run.mjs); C7's queue checks are in queue-gate.test.mjs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  CI_MAIN,
  CI_QUEUE,
  CONF_LINE,
  dir,
  EVENT_LINE,
  events,
  GATE_LINE,
  here,
  MOUNTS_LINE,
  POOL_QUEUE,
  REPO,
  read,
  refused,
  run,
  shipped,
} from "./hook-run.mjs";
// C7's queue checks and the fast pool's: imported so CI's fast job, which names only this file,
// runs them too.
import "./queue-gate.test.mjs";
import "./fast-pool.test.mjs";
import "./fast-lower.test.mjs";
import "./fast-admit.test.mjs";
import "./fast-scope.test.mjs";

test("the shipped hook has the four fixed paths these tests replace", () => {
  assert.equal(shipped.split(CONF_LINE).length, 2);
  assert.equal(shipped.split(EVENT_LINE).length, 2);
  assert.equal(shipped.split(GATE_LINE).length, 2);
  assert.equal(shipped.split(MOUNTS_LINE).length, 2);
  assert.match(shipped, /^set -euo pipefail$/m);
});

test("accepts ci.yml on a push to main", () => {
  const res = run({ event: events.pushMain });
  assert.equal(res.ok, true, res.out);
  assert.match(res.out, /halonic-ci: accepted push/);
});

test("merge groups are refused while the pool is push only, accepted once switched on", () => {
  const env = { GITHUB_EVENT_NAME: "merge_group", GITHUB_WORKFLOW_REF: CI_QUEUE };
  refused(run({ event: events.mergeGroup, env }), /event merge_group is off on this pool/);
  assert.equal(run({ pool: POOL_QUEUE, event: events.mergeGroup, env }).ok, true);
});

test("refuses every pull request outside the fast pool, even with pull_request in the pool's list", () => {
  const pool = 'ALLOWED_EVENTS="push merge_group pull_request"\n';
  const env = { GITHUB_EVENT_NAME: "pull_request" };
  refused(run({ pool, event: events.ownPr, env }), /pull request from halonic-com\/halonic/);
  refused(run({ pool, event: events.forkPr, env }), /pull request from someone\/halonic/);
});

test("a fork pull request can't pass as a merge group or a push", () => {
  for (const name of ["merge_group", "push"]) {
    refused(
      run({
        pool: POOL_QUEUE,
        event: events.forkPr,
        env: { GITHUB_EVENT_NAME: name, GITHUB_WORKFLOW_REF: CI_QUEUE },
      }),
      /does not match the event \(pull_request\)/,
    );
  }
});

test("refuses pushes to other branches, other workflows and other events", () => {
  refused(run({ event: events.pushBranch }), /push to refs\/heads\/feature/);
  refused(
    run({
      event: events.pushMain,
      env: { GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/release.yml@refs/heads/main` },
    }),
    /workflow .*release\.yml/,
  );
  refused(
    run({
      pool: POOL_QUEUE,
      event: events.mergeGroup,
      env: { GITHUB_EVENT_NAME: "merge_group", GITHUB_WORKFLOW_REF: CI_MAIN },
    }),
    /workflow /,
  );
  refused(
    run({
      pool: POOL_QUEUE,
      event: events.mergeGroupRelease,
      env: { GITHUB_EVENT_NAME: "merge_group", GITHUB_WORKFLOW_REF: CI_QUEUE },
    }),
    /merge group not for main/,
  );
  refused(
    run({ event: events.dispatch, env: { GITHUB_EVENT_NAME: "workflow_dispatch" } }),
    /event type not allowed/,
  );
});

test("refuses another repository or a fork, in the event or the environment", () => {
  refused(run({ event: events.forkRepoPush }), /repository someone\/halonic/);
  refused(
    run({ event: events.pushMain, env: { GITHUB_REPOSITORY: "someone/halonic" } }),
    /repository someone\/halonic/,
  );
  refused(
    run({ event: { ...events.pushMain, repository: { full_name: REPO, fork: true } } }),
    /fork repository/,
  );
});

test("fails closed: moved or missing event file, missing or writable pool config, no jq", () => {
  refused(
    run({ event: events.pushMain, env: { GITHUB_EVENT_PATH: join(dir, "elsewhere.json") } }),
    /unexpected event path/,
  );
  refused(run({ event: null }), /event file missing/);
  refused(run({ pool: null, event: events.pushMain }), /pool config missing/);
  if (process.getuid?.() !== 0) {
    refused(run({ poolMode: 0o644, event: events.pushMain }), /pool config is writable/);
  }
  const bin = join(dir, "bin");
  spawnSync("mkdir", ["-p", bin]);
  for (const tool of ["sed", "tail", "tr"]) {
    const which = spawnSync("/bin/sh", ["-c", `command -v ${tool}`], {
      encoding: "utf8",
    }).stdout.trim();
    symlinkSync(which, join(bin, tool));
  }
  refused(run({ event: events.pushMain, path: bin }), /jq missing/);
});

test("the smoke switch admits only its own workflow on its own branch", () => {
  const pool =
    'ALLOWED_EVENTS="push"\nSMOKE_BRANCH="ci/self-hosted-smoke"\nSMOKE_WORKFLOW="self-hosted-smoke.yml"\n';
  const event = { ...events.pushMain, ref: "refs/heads/ci/self-hosted-smoke" };
  const wf = `${REPO}/.github/workflows/self-hosted-smoke.yml@refs/heads/ci/self-hosted-smoke`;
  assert.equal(run({ pool, event, env: { GITHUB_WORKFLOW_REF: wf } }).ok, true);
  refused(
    run({ pool, event, env: { GITHUB_WORKFLOW_REF: wf.replace("smoke.yml", "rogue.yml") } }),
    /workflow /,
  );
  refused(
    run({ event, env: { GITHUB_WORKFLOW_REF: wf } }),
    /push to refs\/heads\/ci\/self-hosted-smoke/,
  );
});

test("the shipped pool config is push only with the smoke switch off", () => {
  const pool = read("vm/pool.conf");
  assert.match(pool, /^ALLOWED_EVENTS="push"$/m);
  assert.match(pool, /^SMOKE_BRANCH=""$/m);
  assert.match(pool, /^SMOKE_WORKFLOW=""$/m);
});

test("the image runs the hook and has no Docker or sudo (C5)", () => {
  const dockerfile = read("vm/Dockerfile");
  assert.match(dockerfile, /ACTIONS_RUNNER_HOOK_JOB_STARTED=\/opt\/halonic-ci\/job-started\.sh/);
  assert.match(dockerfile, /--chown=root:root --chmod=0555 job-started\.sh/);
  assert.match(dockerfile, /sha256sum -c/);
  assert.match(dockerfile, /^USER runner$/m);
  // Node on PATH for steps that run `node` directly, checked like every other download.
  assert.match(
    dockerfile,
    /tar -xJf node-v\$\{CI_NODE_VERSION\}-linux-x64\.tar\.xz -C \/usr\/local/,
  );
  const instructions = dockerfile.replace(/^#.*$/gm, "");
  assert.doesNotMatch(instructions, /\bsudo\b|docker\.io|docker-ce/);
});

test("each job container is capped and unprivileged (C5)", () => {
  const slot = read("vm/halonic-runner-slot.sh");
  for (const flag of [
    "--cap-drop ALL",
    "--security-opt no-new-privileges",
    '--memory-swap "$MEM_START"',
    "--pids-limit 8192",
    "--rm",
  ]) {
    assert.ok(slot.includes(flag), `slot script lacks ${flag}`);
  }
  assert.doesNotMatch(slot, /--privileged|--cap-add|docker\.sock|--device/);
  // Each job sees only its own CPUs, or test runners size their workers for the whole VM.
  assert.ok(slot.includes('--cpuset-cpus "$CPUSET"'), "slot script lacks --cpuset-cpus");
  assert.match(slot, /--tmpfs "\/tmp:rw,exec,nosuid,nodev,/);
  // The pool config is mounted read-only, the work dir is the one the hook expects.
  assert.ok(slot.includes('-v "$POOL_DIR:/etc/halonic-ci:ro"'));
  assert.match(slot, /^ {2}\*\) {6}POOL_DIR=\/etc\/halonic-ci\/pool$/m);
  assert.match(slot, /^JOB_WORK=\/home\/runner\/actions-runner\/_work /m);
  assert.ok(slot.includes('-v "$WORK:$JOB_WORK"'));
});

test("a job container starts at MEM_START and grows only up to MEM, with swap kept equal", () => {
  const slot = read("vm/halonic-runner-slot.sh");
  // Large slots start at 6 GB (fast-1..10 at 4 GB since HAL-17574, fast jobs peak at 4.4 GB) and grow
  // 4 GB every 2 s up to 16 GB: no OOM since 22 Nov 08:07
  // UTC with this, and #4976 cut the biggest job (Fast gates) to under 1 GB. A fixed 10 GB start on
  // 19 large slots would allow 190 GB on a 128 GB VM with no free-memory check below 10 GB.
  assert.match(slot, /^ {2}large-\*\).* MEM=16g; MEM_START=6g; /m);
  assert.match(slot, /^ {2}fast-\[1-9\]\|fast-10\).* MEM=16g; MEM_START=4g; /m);
  // fast-11..40 (HAL-17463, HAL-17574): GitHub's runner size, 4 CPUs, starting at 4 GB (fast jobs
  // peaked at 4.4 GB over 24 h) and growing to 12 GB at most.
  assert.match(
    slot,
    /^ {2}fast-1\[1-9\]\|fast-\[23\]\[0-9\]\|fast-40\).* CPUS=4; MEM=12g; MEM_START=4g; /m,
  );
  assert.match(slot, /^ {2}small-\*\).* MEM=3g; {2}MEM_START=2g; /m);
  assert.ok(slot.includes('--memory "$MEM_START" --memory-swap "$MEM_START"'));
  assert.doesNotMatch(slot, /--memory "\$MEM" /);
  // Growth: never past MEM, swap raised with the limit, and only while the VM keeps its reserve.
  assert.ok(slot.includes('[ "$new" -gt "$MAX_B" ] && new=$MAX_B'));
  assert.ok(slot.includes('docker update --memory "$new" --memory-swap "$new" "hci-$SLOT"'));
  assert.ok(slot.includes('if [ "${avail:-0}" -gt $((STEP_B + RESERVE_B)) ]; then'));
  for (const field of ["mem_anon_peak:$anon", "mem_start:$memstart", "mem_grows:$grows"]) {
    assert.ok(slot.includes(field), `jobs.jsonl lacks ${field}`);
  }
});

test("the slot script fails closed on the App key and userns-remap, and caps the shared caches", () => {
  const slot = read("vm/halonic-runner-slot.sh");
  assert.ok(slot.includes(`[ "$(stat -c '%u %a' "$KEY")" = "0 400" ] || fail`));
  assert.ok(slot.includes('[ ! -L "$KEY" ] || fail'));
  assert.ok(slot.includes('[[ "$BASE" =~ ^[1-9][0-9]*$ ]] || fail'));
  assert.ok(slot.includes('[ "$TOKEN" != null ] || fail'));
  assert.ok(slot.includes("limit -p bhard=$TRUSTED_QUOTA $TRUSTED_PROJ"));
});

test("the slot script reads the job's event file inside the container, never as root on the VM", () => {
  const slot = read("vm/halonic-runner-slot.sh");
  assert.ok(
    slot.includes(
      'timeout 10 docker exec "hci-$SLOT" timeout 5 head -c 1048576 "$JOB_WORK/_temp/_github_workflow/event.json"',
    ),
  );
  assert.doesNotMatch(slot, /\$WORK\/_temp/);
});

// Runs the shipped slot script with its pause path pointed at a temporary file and every outside
// command it could call replaced by a stub that logs, so a test sees whether it went on to
// register a runner. systemd doesn't re-check the unit's ConditionPathExists on a restart.
const PAUSED_LINE = "PAUSED=/etc/halonic-ci/paused";
// Fast slots' gate sockets live in a temporary folder too; each slot gets one unless `noGate`.
const GATES_LINE = "FAST_GATES=/run/halonic-ci-gate-fast";
const slotCycle = ({ paused, args = ["large-1"], docker = "", systemctl = "exit 3", noGate }) => {
  const bin = mkdtempSync(join(dir, "slot-bin-"));
  const gates = join(bin, "gates");
  if (!noGate) {
    mkdirSync(join(gates, args[0]), { recursive: true });
    // Bound by a relative name from its own folder: a full temporary path can pass the 108 bytes
    // a Unix socket's path may have. The socket file stays after the process exits.
    const listen = "require('net').createServer().listen('gate.sock', () => process.exit(0))";
    const res = spawnSync(process.execPath, ["-e", listen], { cwd: join(gates, args[0]) });
    assert.equal(res.status, 0, String(res.stderr));
  }
  const log = join(bin, "calls.log");
  const pausedFile = join(bin, "paused");
  writeFileSync(log, "");
  if (paused) writeFileSync(pausedFile, "");
  const bodies = { docker, systemctl };
  for (const name of [
    "curl",
    "openssl",
    "docker",
    "jq",
    "stat",
    "xfs_quota",
    "sleep",
    "systemctl",
  ]) {
    const body = bodies[name] ?? "";
    writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> ${log}\n${body}\n`, {
      mode: 0o755,
    });
  }
  const slot = read("vm/halonic-runner-slot.sh");
  assert.equal(slot.split(PAUSED_LINE).length, 2);
  assert.equal(slot.split(GATES_LINE).length, 2);
  const script = join(bin, "slot.sh");
  const patched = slot
    .replace(PAUSED_LINE, `PAUSED=${pausedFile}`)
    .replace(GATES_LINE, `FAST_GATES=${gates}`);
  writeFileSync(script, patched);
  const res = spawnSync("/bin/bash", [script, ...args], { encoding: "utf8", env: { PATH: bin } });
  return { ...res, calls: readFileSync(log, "utf8") };
};

test("a slot registers no runner while the pause file exists", () => {
  const res = slotCycle({ paused: true });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /slot large-1: paused/);
  assert.equal(res.calls, "sleep 30\n");
  // Not paused, the cycle goes on (here it stops at the VM's pool.env, which the test has none of).
  const live = slotCycle({ paused: false });
  assert.doesNotMatch(live.stdout, /paused/);
  assert.match(live.stderr, /pool\.env/);
  // The stop-time cleanup still removes stale registrations while paused.
  const cleanup = slotCycle({ paused: true, args: ["large-1", "--cleanup"] });
  assert.doesNotMatch(cleanup.stdout, /paused/);
  assert.match(cleanup.stderr, /pool\.env/);
});

test("a fast slot starts only under gVisor and on its own network without container traffic (C8)", () => {
  // `docker info` lists the runtimes; `docker network inspect` the network's enable_icc option.
  const docker = ({ runtimes, icc }) =>
    `case "$1" in info) echo "${runtimes}";; network) [ -n "${icc}" ] && echo "${icc}" || exit 1;; esac`;
  const net = "192.168.241.0/24";
  const fast = (setup) => slotCycle({ paused: false, args: ["fast-1"], docker: docker(setup) });
  const noRunsc = fast({ runtimes: "io.containerd.runc.v2 runc ", icc: "false" });
  assert.equal(noRunsc.status, 1);
  assert.match(noRunsc.stderr, /Docker has no runsc runtime \(gVisor\)/);
  for (const icc of ["", "true"]) {
    const res = fast({ runtimes: "runc runsc ", icc: icc && `${icc} ${net}` });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Docker network halonic-ci-fast missing or lets containers reach/);
  }
  // Without its own gate socket (HAL-17473), a fast slot doesn't start either.
  const ready = {
    paused: false,
    args: ["fast-1"],
    docker: docker({ runtimes: "runsc ", icc: `false ${net}` }),
  };
  const noGate = slotCycle({ ...ready, noGate: true });
  assert.equal(noGate.status, 1);
  assert.match(
    noGate.stderr,
    /no gate socket of its own; enable halonic-ci-gate-fast@fast-1\.socket/,
  );
  // One address per fast container (HAL-17574): Docker's default /28 held the pool at 13 jobs.
  for (const icc of ["false 172.30.0.0/28", "false 172.30.0.0/27", "false ", "false fd00::/64"]) {
    const res = fast({ runtimes: "runc runsc ", icc });
    assert.equal(res.status, 1, icc);
    assert.match(res.stderr, /too small for 40 fast containers/, icc);
  }
  // All in place, the cycle goes on (and stops at the VM's pool.env, which the test has none of).
  assert.match(fast({ runtimes: "runc runsc ", icc: "false 172.30.0.0/26" }).stderr, /pool\.env/);
  const ok = fast({ runtimes: "runc runsc ", icc: `false ${net}` });
  assert.doesNotMatch(ok.stderr, /runsc|halonic-ci-fast/);
  assert.match(ok.stderr, /pool\.env/);
  // A large slot doesn't ask.
  assert.doesNotMatch(slotCycle({ paused: false }).calls, /^docker /m);
});

test("a fast slot and the large slot whose CPUs it takes never run at once", () => {
  const ready = 'case "$1" in info) echo "runsc ";; network) echo false 192.168.241.0/24;; esac';
  const both = { paused: false, docker: ready, systemctl: "exit 0" };
  const fast = slotCycle({ ...both, args: ["fast-1"] });
  assert.equal(fast.status, 1);
  assert.match(fast.stderr, /large-11 runs on the same CPUs/);
  assert.match(fast.calls, /^systemctl is-active -q halonic-runner@large-11\.service$/m);
  assert.match(slotCycle({ ...both, args: ["large-9"] }).stderr, /fast-3 runs on the same CPUs/);
  // Other large slots have no twin, and an idle twin doesn't stop a slot.
  assert.match(slotCycle({ ...both, args: ["large-8"] }).stderr, /pool\.env/);
  assert.match(slotCycle({ paused: false, docker: ready, args: ["fast-2"] }).stderr, /pool\.env/);
  // fast-11..40 have no twin (HAL-17463, HAL-17574): they start whatever runs (and stop at
  // pool.env here).
  for (const slot of ["fast-11", "fast-24", "fast-25", "fast-40"]) {
    assert.match(slotCycle({ ...both, args: [slot] }).stderr, /pool\.env/, slot);
  }
});

test("stopping the firewall unit leaves the CI VM's rules in place", () => {
  const unit = read("host/halonic-ci-nft.service");
  assert.doesNotMatch(unit, /^ExecStop/m);
  assert.match(unit, /^RequiredBy=libvirtd\.service$/m);
  assert.match(read("host/halonic-ci.nft"), /^delete table inet halonic_ci$/m);
});

// Runs the shipped maintenance script with every command it calls replaced by a stub that logs
// its arguments, so nothing touches the real /cache or /etc. `cachePct` is /cache's use,
// `quota` the project report line for the shared caches (null: no project 300 yet).
const maint = ({ args = [], cachePct = 40, quota = null }) => {
  const bin = mkdtempSync(join(dir, "maint-bin-"));
  const log = join(bin, "calls.log");
  writeFileSync(log, "");
  for (const tool of ["awk", "tail", "tr"]) {
    const which = spawnSync("/bin/sh", ["-c", `command -v ${tool}`], { encoding: "utf8" });
    symlinkSync(which.stdout.trim(), join(bin, tool));
  }
  const stub = (name, body = "") =>
    writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> ${log}\n${body}\n`, {
      mode: 0o755,
    });
  for (const name of ["docker", "systemctl", "logger", "touch", "rm", "seq", "sleep", "jq"]) {
    stub(name);
  }
  stub("cat", "echo halonic-runner@large-1.service");
  stub("df", `printf 'Use%%\\n %d%%\\n' ${cachePct}`);
  stub("xfs_quota", quota === null ? "" : `echo '${quota}'`);
  const res = spawnSync("/bin/bash", [join(here, "vm/halonic-ci-maint.sh"), ...args], {
    encoding: "utf8",
    env: { PATH: bin },
  });
  assert.equal(res.status, 0, res.stderr);
  return readFileSync(log, "utf8");
};
const EMPTIED =
  "rm -rf /cache/trusted/pnpm-store/* /cache/trusted/turbo/* /cache/trusted/ms-playwright/*";
const GB20 = 20 * 1024 * 1024; // KiB

test("the cache check empties the shared caches past 80 % of their quota, not before", () => {
  const low = maint({ args: ["--caches"], quota: `#300 ${GB20 / 2} 0 ${GB20} 00 [--------]` });
  assert.ok(!low.includes(EMPTIED), low);
  assert.match(low, /caches 50% of quota/);
  const high = maint({ args: ["--caches"], quota: `#300 ${GB20 * 0.85} 0 ${GB20} 00 [--------]` });
  assert.ok(high.includes("touch /etc/halonic-ci/paused"), high);
  assert.ok(high.includes(EMPTIED), high);
  assert.ok(high.includes("rm -f /etc/halonic-ci/paused"), high);
  assert.ok(high.includes("systemctl start halonic-runner@large-1.service"), high);
  // The hourly check only checks: no pruning.
  assert.doesNotMatch(high, /^docker /m);
});

test("the weekly cleanup prunes, and empties the caches when /cache passes 75 %", () => {
  const calm = maint({});
  assert.match(calm, /^docker image prune -f$/m);
  assert.ok(!calm.includes(EMPTIED), calm);
  assert.ok(maint({ cachePct: 80 }).includes(EMPTIED));
});

test("the cache check runs hourly and never alongside the weekly cleanup", () => {
  assert.match(read("vm/halonic-ci-cache-check.timer"), /^OnCalendar=hourly$/m);
  // Waits up to 10 minutes rather than lose its hour to a snapshot refresh (HAL-18424).
  const lock = "/usr/bin/flock -w 600 -E 0 /run/lock/halonic-ci-maint.lock";
  assert.ok(
    read("vm/halonic-ci-cache-check.service").includes(
      `${lock} /usr/local/sbin/halonic-ci-maint.sh --caches`,
    ),
  );
  assert.ok(
    read("vm/halonic-ci-maint.service").includes("/usr/bin/flock /run/lock/halonic-ci-maint.lock "),
  );
});
