// The job-started hook is the boundary that keeps fork and pull request code off our CI
// server (HAL-14831, Julian's C1/C2). These tests run the hook as shipped against sample
// events; only its two fixed paths are pointed at temporary files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const here = new URL(".", import.meta.url).pathname;
const read = (file) => readFileSync(join(here, file), "utf8");
const REPO = "halonic-com/halonic";
const CI_MAIN = `${REPO}/.github/workflows/ci.yml@refs/heads/main`;
const CI_QUEUE = `${REPO}/.github/workflows/ci.yml@refs/heads/gh-readonly-queue/main/pr-1-abc`;

const dir = mkdtempSync(join(tmpdir(), "halonic-ci-hook-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const conf = join(dir, "pool.conf");
const eventFile = join(dir, "event.json");

const CONF_LINE = "CONF=/etc/halonic-ci/pool.conf";
const EVENT_LINE = "EVENT_FILE=/home/runner/actions-runner/_work/_temp/_github_workflow/event.json"; // leak-guard: allow absolute-path the hook's event path inside the image
const shipped = read("vm/job-started.sh");
const hook = join(dir, "job-started.sh");
writeFileSync(
  hook,
  shipped.replace(CONF_LINE, `CONF=${conf}`).replace(EVENT_LINE, `EVENT_FILE=${eventFile}`),
);

const repository = { full_name: REPO, fork: false };
const events = {
  pushMain: { ref: "refs/heads/main", pusher: { name: "halonic-dev" }, repository },
  pushBranch: { ref: "refs/heads/feature", pusher: { name: "halonic-dev" }, repository },
  mergeGroup: {
    merge_group: {
      base_ref: "refs/heads/main",
      head_ref: "refs/heads/gh-readonly-queue/main/pr-1-abc",
    },
    repository,
  },
  mergeGroupRelease: {
    merge_group: {
      base_ref: "refs/heads/release/1",
      head_ref: "refs/heads/gh-readonly-queue/release/1/pr-1",
    },
    repository,
  },
  ownPr: { pull_request: { head: { repo: { full_name: REPO } } }, repository },
  forkPr: { pull_request: { head: { repo: { full_name: "someone/halonic" } } }, repository },
  forkRepoPush: {
    ref: "refs/heads/main",
    pusher: { name: "someone" },
    repository: { full_name: "someone/halonic", fork: true },
  },
  dispatch: { ref: "refs/heads/main", inputs: {}, repository },
};

const POOL_PUSH = 'ALLOWED_EVENTS="push"\nSMOKE_BRANCH=""\nSMOKE_WORKFLOW=""\n';
const POOL_QUEUE = 'ALLOWED_EVENTS="push merge_group"\nSMOKE_BRANCH=""\nSMOKE_WORKFLOW=""\n';

// Runs the hook. `event` is written to the fixed event path unless it's null; `env`
// overrides the variables the runner sets.
const run = ({ pool = POOL_PUSH, poolMode = 0o444, event, env = {}, path = process.env.PATH }) => {
  rmSync(conf, { force: true });
  rmSync(eventFile, { force: true });
  if (pool !== null) {
    writeFileSync(conf, pool);
    chmodSync(conf, poolMode);
  }
  if (event !== null) writeFileSync(eventFile, JSON.stringify(event));
  const res = spawnSync("/bin/bash", [hook], {
    encoding: "utf8",
    env: {
      PATH: path,
      GITHUB_EVENT_PATH: eventFile,
      GITHUB_REPOSITORY: REPO,
      GITHUB_EVENT_NAME: "push",
      GITHUB_WORKFLOW_REF: CI_MAIN,
      ...env,
    },
  });
  return { ok: res.status === 0, out: res.stdout + res.stderr };
};
const refused = (res, reason) => {
  assert.equal(res.ok, false, `expected a refusal, got: ${res.out}`);
  assert.match(res.out, /::error title=halonic-ci refused this job::/);
  assert.match(res.out, reason);
};

test("the shipped hook has the two fixed paths these tests replace", () => {
  assert.equal(shipped.split(CONF_LINE).length, 2);
  assert.equal(shipped.split(EVENT_LINE).length, 2);
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

test("refuses every pull request, even with pull_request in the pool's list", () => {
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
  const instructions = dockerfile.replace(/^#.*$/gm, "");
  assert.doesNotMatch(instructions, /\bsudo\b|docker\.io|docker-ce/);
});

test("each job container is capped and unprivileged (C5)", () => {
  const slot = read("vm/halonic-runner-slot.sh");
  for (const flag of [
    "--cap-drop ALL",
    "--security-opt no-new-privileges",
    '--memory-swap "$MEM"',
    "--pids-limit 8192",
    "--rm",
  ]) {
    assert.ok(slot.includes(flag), `slot script lacks ${flag}`);
  }
  assert.doesNotMatch(slot, /--privileged|--cap-add|docker\.sock|--device/);
  // The pool config is mounted read-only, the work dir is the one the hook expects.
  assert.ok(slot.includes("-v /etc/halonic-ci/pool:/etc/halonic-ci:ro"));
  assert.match(slot, /^JOB_WORK=\/home\/runner\/actions-runner\/_work /m);
  assert.ok(slot.includes('-v "$WORK:$JOB_WORK"'));
});

test("the slot script fails closed and never reads job files as root on the VM", () => {
  const slot = read("vm/halonic-runner-slot.sh");
  assert.ok(slot.includes(`stat -c '%u %a' "$KEY")" = "0 400"`), "App key must be checked as root 0400");
  assert.match(slot, /no dockremap range in \/etc\/subuid/);
  // The event file is job-controlled: read it inside the container, not through $WORK.
  assert.doesNotMatch(slot, /\$WORK\/_temp/);
  assert.ok(slot.includes('docker exec "hci-$SLOT" cat "$JOB_WORK/_temp/_github_workflow/event.json"'));
});

test("stopping the firewall unit never removes the CI VM's rules", () => {
  const unit = read("host/halonic-ci-nft.service");
  assert.doesNotMatch(unit, /^ExecStop/m);
  assert.match(unit, /^RequiredBy=libvirtd\.service$/m);
});
