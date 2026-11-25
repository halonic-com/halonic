// The Windows runner VM's job-started hook keeps everything but reviewed main code off the VM
// (HAL-18572, HAL-18585). These tests run its check against sample events, and the hook as shipped
// for the parts that only the process shows (the event path, the exit code).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { eventKind, MAIN, REPO, refusal } from "./image/job-started.mjs";

const here = new URL(".", import.meta.url).pathname;
const read = (file) => readFileSync(join(here, file), "utf8");
const WINDOWS_CHECK = `${REPO}/.github/workflows/windows-check.yml@${MAIN}`;
const repository = { full_name: REPO, fork: false };
const fork = { full_name: "someone/halonic", fork: true };
const SHA = "a".repeat(40);

const events = {
  pushMain: { ref: MAIN, after: SHA, pusher: { name: "halonic-dev" }, repository },
  pushBranch: {
    ref: "refs/heads/feature",
    after: SHA,
    pusher: { name: "halonic-dev" },
    repository,
  },
  dispatchMain: {
    ref: MAIN,
    inputs: {},
    workflow: ".github/workflows/windows-check.yml",
    repository,
  },
  dispatchBranch: {
    ref: "refs/heads/feature",
    inputs: {},
    workflow: ".github/workflows/windows-check.yml",
    repository,
  },
  schedule: { schedule: "0 3 * * *", workflow: ".github/workflows/windows-check.yml" },
  ownPr: {
    number: 7,
    pull_request: { head: { repo: { full_name: REPO } }, base: { ref: "main" } },
    repository,
  },
  forkPr: {
    number: 8,
    pull_request: { head: { repo: { full_name: fork.full_name } }, base: { ref: "main" } },
    repository,
  },
  mergeGroup: {
    merge_group: { base_ref: MAIN, head_ref: `refs/heads/gh-readonly-queue/main/pr-7-${SHA}` },
    repository,
  },
  forkPush: { ref: MAIN, after: SHA, pusher: { name: "someone" }, repository: fork },
};

const mainEnv = (name, overrides = {}) => ({
  GITHUB_REPOSITORY: REPO,
  GITHUB_EVENT_NAME: name,
  GITHUB_REF: MAIN,
  GITHUB_WORKFLOW_REF: WINDOWS_CHECK,
  ...overrides,
});

test("admits a push to main of halonic-com/halonic", () => {
  assert.equal(refusal(mainEnv("push"), events.pushMain), null);
});

test("admits a schedule and a manual run on main", () => {
  assert.equal(refusal(mainEnv("schedule"), events.schedule), null);
  assert.equal(refusal(mainEnv("workflow_dispatch"), events.dispatchMain), null);
});

test("refuses every pull request, our own and a fork's", () => {
  const ref = "refs/pull/7/merge";
  const workflow = `${REPO}/.github/workflows/windows-check.yml@${ref}`;
  const env = mainEnv("pull_request", { GITHUB_REF: ref, GITHUB_WORKFLOW_REF: workflow });
  assert.equal(refusal(env, events.ownPr), "event pull_request");
  assert.equal(refusal(env, events.forkPr), "event pull_request");
  assert.equal(
    refusal({ ...env, GITHUB_EVENT_NAME: "pull_request_target" }, events.forkPr),
    "event pull_request_target",
  );
});

test("refuses a merge group", () => {
  const ref = events.mergeGroup.merge_group.head_ref;
  const env = mainEnv("merge_group", {
    GITHUB_REF: ref,
    GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ci.yml@${ref}`,
  });
  assert.equal(refusal(env, events.mergeGroup), "event merge_group");
});

test("refuses a manual run or a push on a branch", () => {
  const branch = "refs/heads/feature";
  const workflow = `${REPO}/.github/workflows/windows-check.yml@${branch}`;
  const env = (name) => mainEnv(name, { GITHUB_REF: branch, GITHUB_WORKFLOW_REF: workflow });
  assert.equal(refusal(env("workflow_dispatch"), events.dispatchBranch), `ref ${branch}`);
  assert.equal(refusal(env("push"), events.pushBranch), `ref ${branch}`);
  // The environment's ref alone isn't trusted: the event's must say main too.
  assert.equal(
    refusal(mainEnv("workflow_dispatch"), events.dispatchBranch),
    `ref ${branch} in the event`,
  );
});

test("refuses a fork, by the environment's repository or the event's", () => {
  const forkEnv = mainEnv("push", {
    GITHUB_REPOSITORY: fork.full_name,
    GITHUB_WORKFLOW_REF: `${fork.full_name}/.github/workflows/windows-check.yml@${MAIN}`,
  });
  assert.equal(refusal(forkEnv, events.forkPush), "repository someone/halonic");
  assert.equal(
    refusal(mainEnv("push"), events.forkPush),
    "repository someone/halonic in the event",
  );
  const forkFlag = { ...events.pushMain, repository: { full_name: REPO, fork: true } };
  assert.equal(refusal(mainEnv("push"), forkFlag), "fork repository");
  const noFlag = { ...events.pushMain, repository: { full_name: REPO } };
  assert.equal(refusal(mainEnv("push"), noFlag), "fork repository");
});

test("refuses a workflow file taken from anywhere but main", () => {
  for (const workflow of [
    `${REPO}/.github/workflows/windows-check.yml@refs/heads/feature`,
    `${REPO}/.github/workflows/windows-check.yml@refs/heads/main-old`,
    `${REPO}/.github/workflows/windows-check.yml@refs/tags/v1`,
    `someone/halonic/.github/workflows/windows-check.yml@${MAIN}`,
    `${REPO}/.github/workflows/../x.yml@${MAIN}`,
  ]) {
    assert.equal(
      refusal(mainEnv("push", { GITHUB_WORKFLOW_REF: workflow }), events.pushMain),
      `workflow ${workflow}`,
    );
  }
  assert.equal(
    refusal(mainEnv("push", { GITHUB_WORKFLOW_REF: undefined }), events.pushMain),
    "workflow unset",
  );
});

test("a pull request or a merge group can't pass as a push, a schedule or a manual run", () => {
  for (const name of ["push", "schedule", "workflow_dispatch"]) {
    assert.equal(
      refusal(mainEnv(name), events.forkPr),
      `event name ${name} does not match the event (pull_request)`,
    );
    assert.equal(
      refusal(mainEnv(name), events.mergeGroup),
      `event name ${name} does not match the event (merge_group)`,
    );
  }
  assert.equal(eventKind(null), "unreadable");
  assert.equal(eventKind([]), "unreadable");
  assert.equal(eventKind({ ref: MAIN }), "unknown");
});

test("refuses other repositories and missing values", () => {
  assert.equal(
    refusal(mainEnv("push", { GITHUB_REPOSITORY: "halonic-com/website" }), events.pushMain),
    "repository halonic-com/website",
  );
  assert.equal(refusal({}, events.pushMain), "repository unset");
  assert.equal(refusal(mainEnv("push", { GITHUB_REF: undefined }), events.pushMain), "ref unset");
  const elsewhere = {
    ...events.schedule,
    repository: { full_name: "someone/halonic", fork: true },
  };
  assert.equal(refusal(mainEnv("schedule"), elsewhere), "repository someone/halonic in the event");
});

const dir = mkdtempSync(join(tmpdir(), "halonic-win-hook-"));
after(() => rmSync(dir, { recursive: true, force: true }));

test("the shipped hook fails the job on an event file outside the runner's work folder", () => {
  const eventFile = join(dir, "event.json");
  writeFileSync(eventFile, JSON.stringify(events.pushMain));
  const res = spawnSync(process.execPath, [join(here, "image/job-started.mjs")], {
    encoding: "utf8",
    env: { ...mainEnv("push"), GITHUB_EVENT_PATH: eventFile },
  });
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /::error title=halonic-win refused this job::unexpected event path/);
});

test("the image wires the hook in: run-job.ps1 sets it, job-started.ps1 runs the .mjs", () => {
  assert.match(
    read("image/run-job.ps1"),
    /ACTIONS_RUNNER_HOOK_JOB_STARTED = Join-Path \$env:SystemDrive 'halonic-win\\job-started\.ps1'/,
  );
  assert.match(
    read("image/job-started.ps1"),
    /^& 'C:\\Program Files\\nodejs\\node\.exe' "\$PSScriptRoot\\job-started\.mjs".*\r?\nexit \$LASTEXITCODE/m, // leak-guard: allow absolute-path the image's fixed Node path
  );
  assert.match(
    read("host/build-image.sh"),
    /image\/job-started\.mjs" "\$HERE\/image\/job-started\.ps1"/,
  );
});

test("job-started.ps1 drops every NODE_* variable before Node starts, and takes nothing from the job's env", () => {
  const hook = read("image/job-started.ps1");
  const code = hook.replace(/#.*$/gm, "");
  const drop = code.search(
    /if \(\$name -like 'NODE_\*'\) \{ \[Environment\]::SetEnvironmentVariable\(\$name, \$null\) \}/,
  );
  assert.ok(drop >= 0, "removes NODE_* variables");
  assert.match(
    code,
    /foreach \(\$name in @\(\[Environment\]::GetEnvironmentVariables\(\)\.Keys\)\)/,
  );
  assert.ok(drop < code.indexOf("node.exe"), "removes them before starting Node");
  // A job's env: can set any of these, so the hook names neither a variable nor a cmdlet.
  assert.doesNotMatch(code, /\$env:/i);
  assert.doesNotMatch(code, /Join-Path|Remove-Item|Get-ChildItem/i);
});

test("win-runner-cycle.sh keeps tokens off curl's command line and checks runner.env", () => {
  const cycle = read("host/win-runner-cycle.sh");
  assert.doesNotMatch(cycle, /-H "Authorization/);
  assert.match(cycle, /api -H @<\(printf 'Authorization: Bearer %s\\n' "\$bearer"\)/);
  assert.ok(
    cycle.indexOf('stat -c %u "$ENV_FILE"') < cycle.indexOf('. "$ENV_FILE"'),
    "checks runner.env's owner before sourcing it",
  );
});
