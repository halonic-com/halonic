// Runs the job-started hook as shipped against sample events, for hook.test.mjs and
// queue-gate.test.mjs. Only its three fixed paths are pointed at temporary files, and the VM's
// queue gate is a stand-in that answers what a test tells it to.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";

export const here = new URL(".", import.meta.url).pathname;
export const read = (file) => readFileSync(join(here, file), "utf8");
export const REPO = "halonic-com/halonic";
export const CI_MAIN = `${REPO}/.github/workflows/ci.yml@refs/heads/main`;
export const SHA = "a".repeat(40);
export const BASE = "b".repeat(40);
export const QUEUE_REF = `refs/heads/gh-readonly-queue/main/pr-7-${BASE}`;
export const CI_QUEUE = `${REPO}/.github/workflows/ci.yml@${QUEUE_REF}`;

export const dir = mkdtempSync(join(tmpdir(), "halonic-ci-hook-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const conf = join(dir, "pool.conf");
const eventFile = join(dir, "event.json");

export const CONF_LINE = "CONF=/etc/halonic-ci/pool.conf";
export const EVENT_LINE =
  "EVENT_FILE=/home/runner/actions-runner/_work/_temp/_github_workflow/event.json"; // leak-guard: allow absolute-path the hook's event path inside the image
export const GATE_LINE = "GATE=/run/halonic-ci-gate/gate.sock";
export const shipped = read("vm/job-started.sh");
const gateSock = join(dir, "gate.sock");
const gateAnswer = join(dir, "gate-answer.json");
const hookWith = (name, sock) => {
  const file = join(dir, name);
  writeFileSync(
    file,
    shipped
      .replace(CONF_LINE, `CONF=${conf}`)
      .replace(EVENT_LINE, `EVENT_FILE=${eventFile}`)
      .replace(GATE_LINE, `GATE=${sock}`),
  );
  return file;
};
const hook = hookWith("job-started.sh", gateSock);
export const hookNoGate = hookWith("job-started-no-gate.sh", join(dir, "absent.sock"));

// A stand-in for the VM's queue gate, in its own process because spawnSync blocks this one. It
// answers every request with the status and body in gate-answer.json at that moment.
const gate = spawn(
  process.execPath,
  [
    "-e",
    `const fs = require("node:fs");
     require("node:http").createServer((req, res) => {
       const { status, body } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
       res.writeHead(status, { "Content-Type": "application/json" });
       res.end(body);
     }).listen(process.argv[1], () => console.log("ready"));`,
    gateSock,
    gateAnswer,
  ],
  { stdio: ["ignore", "pipe", "inherit"] },
);
after(() => gate.kill());
await new Promise((resolve, reject) => {
  gate.stdout.once("data", resolve);
  gate.once("exit", reject);
});

const repository = { full_name: REPO, fork: false };
export const events = {
  pushMain: { ref: "refs/heads/main", pusher: { name: "halonic-dev" }, repository },
  pushBranch: { ref: "refs/heads/feature", pusher: { name: "halonic-dev" }, repository },
  mergeGroup: {
    merge_group: { base_ref: "refs/heads/main", head_ref: QUEUE_REF, head_sha: SHA },
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

export const POOL_PUSH = 'ALLOWED_EVENTS="push"\nSMOKE_BRANCH=""\nSMOKE_WORKFLOW=""\n';
export const POOL_QUEUE = 'ALLOWED_EVENTS="push merge_group"\nSMOKE_BRANCH=""\nSMOKE_WORKFLOW=""\n';

// The merge queue as GitHub's GraphQL API returns it. Each entry: [number, head commit, the
// head repository's owner, isCrossRepository]; positions count from 1 in this order.
export const own = (number, oid = "c".repeat(40)) => [number, oid, "halonic-com", false];
export const queue = (...entries) =>
  JSON.stringify({
    data: {
      repository: {
        mergeQueue: {
          entries: {
            pageInfo: { hasNextPage: false },
            nodes: entries.map(([number, oid, login, cross], i) => ({
              position: i + 1,
              headCommit: { oid },
              pullRequest: { number, isCrossRepository: cross, headRepositoryOwner: { login } },
            })),
          },
        },
      },
    },
  });
export const QUEUE_OK = queue(own(5), own(7, SHA), [9, "d".repeat(40), "someone", true]);

// Runs the hook. `event` is written to the fixed event path unless it's null; `env`
// overrides the variables the runner sets; `gate` is the queue gate's answer.
export const run = ({
  pool = POOL_PUSH,
  poolMode = 0o444,
  event,
  env = {},
  path = process.env.PATH,
  gate = { status: 200, body: QUEUE_OK },
  script = hook,
}) => {
  writeFileSync(gateAnswer, JSON.stringify(gate));
  rmSync(conf, { force: true });
  rmSync(eventFile, { force: true });
  if (pool !== null) {
    writeFileSync(conf, pool);
    chmodSync(conf, poolMode);
  }
  if (event !== null) writeFileSync(eventFile, JSON.stringify(event));
  const res = spawnSync("/bin/bash", [script], {
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
export const refused = (res, reason) => {
  assert.equal(res.ok, false, `expected a refusal, got: ${res.out}`);
  assert.match(res.out, /::error title=halonic-ci refused this job::/);
  assert.match(res.out, reason);
};
