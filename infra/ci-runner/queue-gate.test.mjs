// C7 (HAL-15355): merge groups run on our CI server only when every pull request in them comes
// from halonic-com/halonic. These tests run the hook against a stand-in for the VM's queue gate
// (hook-run.mjs), and the gate's own script against a stub curl.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  BASE,
  CI_QUEUE,
  dir,
  events,
  here,
  hookNoGate,
  own,
  POOL_QUEUE,
  QUEUE_OK,
  queue,
  read,
  refused,
  run,
  SHA,
} from "./hook-run.mjs";

const QUEUE_ENV = { GITHUB_EVENT_NAME: "merge_group", GITHUB_WORKFLOW_REF: CI_QUEUE };
const group = (gate, event = events.mergeGroup) =>
  run({ pool: POOL_QUEUE, event, env: QUEUE_ENV, gate });
const fork = (number, oid = "e".repeat(40)) => [number, oid, "someone", true];

test("C7: a merge group of own pull requests is accepted; entries behind it don't count", () => {
  const res = group({ status: 200, body: QUEUE_OK });
  assert.equal(res.ok, true, res.out);
  assert.match(res.out, /halonic-ci: accepted merge_group/);
});

test("C7: refuses a group whose own pull request comes from a fork", () => {
  refused(group({ status: 200, body: queue(own(5), fork(7, SHA)) }), /outside halonic-com: #7\./);
});

test("C7: refuses a group with a fork pull request ahead of it in the queue", () => {
  refused(
    group({ status: 200, body: queue(own(3), fork(5), own(7, SHA)) }),
    /outside halonic-com: #5\./,
  );
});

test("C7: refuses a head repository owned outside halonic-com, even when not cross-repository", () => {
  refused(
    group({ status: 200, body: queue([5, "c".repeat(40), "someone", false], own(7, SHA)) }),
    /outside halonic-com: #5\./,
  );
  // A missing flag or owner is not a pass.
  refused(group({ status: 200, body: queue([7, SHA, null, null]) }), /outside halonic-com: #7\./);
});

test("C7: refuses when the pull request or its commit isn't in the queue", () => {
  refused(group({ status: 200, body: queue(own(5)) }), /#7 at a{40} not in the merge queue/);
  refused(
    group({ status: 200, body: queue(own(5), own(7, "f".repeat(40))) }),
    /#7 at a{40} not in the merge queue/,
  );
  const long = JSON.parse(queue(own(5)));
  long.data.repository.mergeQueue.entries.pageInfo.hasNextPage = true;
  refused(
    group({ status: 200, body: JSON.stringify(long) }),
    /#7 not in the first 100 queue entries/,
  );
});

test("C7: fails closed when the gate or GitHub's API fails", () => {
  const down = group({ status: 502, body: '{"error":"GitHub API call failed"}' });
  refused(
    down,
    /queue gate did not answer after 3 tries \(last: HTTP 502: GitHub API call failed\)/,
  );
  assert.equal(down.asked.length, 3);
  assert.match(down.out, /queue gate try 1 of 3 failed \(HTTP 502: GitHub API call failed\)/);
  refused(
    group({ status: 200, body: JSON.stringify({ errors: [{ message: "rate limited" }] }) }),
    /GitHub API errors/,
  );
  refused(
    group({ status: 200, body: JSON.stringify({ data: { repository: { mergeQueue: null } } }) }),
    /no merge queue for main/,
  );
  refused(group({ status: 200, body: "not json" }), /queue gate answer unreadable/);
  refused(
    run({ pool: POOL_QUEUE, event: events.mergeGroup, env: QUEUE_ENV, script: hookNoGate }),
    /queue gate not available/,
  );
});

test("C7: a gate that fails once or twice is asked again, and its answer then decides", () => {
  const fail = { status: 502, body: '{"error":"GitHub API call failed"}' };
  const res = group([fail, fail, { status: 200, body: QUEUE_OK }]);
  assert.equal(res.ok, true, res.out);
  assert.equal(res.asked.length, 3);
  assert.match(res.out, /queue gate try 2 of 3 failed/);
  assert.match(res.out, /halonic-ci: accepted merge_group/);
  // After a retry, a fork in the group is still refused.
  const forked = group([fail, { status: 200, body: queue(own(5), fork(7, SHA)) }]);
  refused(forked, /outside halonic-com: #7\./);
  assert.equal(forked.asked.length, 2);
});

test("C7: an answer from the gate is never retried, so its refusal stands at once", () => {
  for (const [body, reason] of [
    [queue(own(3), fork(5), own(7, SHA)), /outside halonic-com: #5\./],
    [queue(own(5)), /#7 at a{40} not in the merge queue/],
    [JSON.stringify({ errors: [{ message: "rate limited" }] }), /GitHub API errors/],
    ["not json", /queue gate answer unreadable/],
  ]) {
    const res = group([
      { status: 200, body },
      { status: 200, body: QUEUE_OK },
    ]);
    refused(res, reason);
    assert.equal(res.asked.length, 1);
  }
});

test("C7: refuses a malformed group ref or commit, or a workflow from another ref", () => {
  const mg = events.mergeGroup.merge_group;
  for (const [patch, reason] of [
    [{ head_ref: "refs/heads/gh-readonly-queue/main/pr-7-abc" }, /merge group ref /],
    [{ head_ref: `refs/heads/gh-readonly-queue/main/pr-7-${BASE}/x` }, /merge group ref /],
    [{ head_sha: "a".repeat(39) }, /merge group commit /],
    [{ head_sha: undefined }, /merge group commit /],
  ]) {
    refused(group(undefined, { ...events.mergeGroup, merge_group: { ...mg, ...patch } }), reason);
  }
  refused(
    run({
      pool: POOL_QUEUE,
      event: events.mergeGroup,
      env: { ...QUEUE_ENV, GITHUB_WORKFLOW_REF: CI_QUEUE.replace("pr-7", "pr-8") },
    }),
    /workflow /,
  );
});

// Runs the VM's queue gate with a stub curl that logs its arguments and the config it was
// given, and answers with `answer` (null: the call fails).
const gateRun = ({ token = "github_pat_TEST123", answer = QUEUE_OK }) => {
  const bin = mkdtempSync(join(dir, "gate-bin-"));
  const creds = mkdtempSync(join(dir, "gate-creds-"));
  if (token !== null) writeFileSync(join(creds, "github-token"), `${token}\n`);
  const log = join(bin, "curl.log");
  writeFileSync(log, "");
  writeFileSync(
    join(bin, "curl"),
    `#!/bin/bash
echo "argv: $*" >> ${log}
while [ $# -gt 0 ]; do [ "$1" = --config ] && echo "config: $(cat "$2")" >> ${log}; shift; done
${answer === null ? "exit 22" : `printf '%s' '${answer}'`}
`,
    { mode: 0o755 },
  );
  const res = spawnSync("/bin/bash", [join(here, "vm/halonic-ci-gate.sh")], {
    encoding: "utf8",
    input: "GET /queue HTTP/1.1\r\nHost: halonic-ci-gate\r\n\r\n",
    env: { PATH: `${bin}:${process.env.PATH}`, CREDENTIALS_DIRECTORY: creds },
  });
  assert.equal(res.status, 0, res.stderr);
  return { out: res.stdout, err: res.stderr, calls: readFileSync(log, "utf8") };
};

test("C7: the gate answers main's queue and keeps the token off every command line", () => {
  const res = gateRun({});
  assert.match(res.out, /^HTTP\/1\.0 200 OK\r\n/);
  assert.ok(res.out.endsWith(`\r\n\r\n${QUEUE_OK}\n`), res.out);
  const argv = res.calls.split("\n").find((line) => line.startsWith("argv: "));
  assert.doesNotMatch(argv, /github_pat_TEST123/);
  assert.match(argv, /--max-time 10 /);
  assert.match(argv, /mergeQueue\(branch: \\"main\\"\)/);
  assert.match(argv, /https:\/\/api\.github\.com\/graphql$/);
  assert.match(res.calls, /^config: header = "Authorization: bearer github_pat_TEST123"$/m);
  assert.doesNotMatch(res.out + res.err, /github_pat_TEST123/);
});

test("C7: the gate fails closed without a token or an answer from GitHub", () => {
  for (const [opts, reason] of [
    [{ token: null }, /no github-token credential/],
    [{ token: "x y" }, /not a token/],
    [{ answer: null }, /GitHub API call failed/],
    [{ answer: "not json" }, /not JSON/],
  ]) {
    const res = gateRun(opts);
    assert.match(res.out, /^HTTP\/1\.0 502 Bad Gateway\r\n/);
    // The reason is in the answer too, for the job's log; never the token.
    const body = JSON.parse(res.out.split("\r\n\r\n")[1]);
    assert.match(body.error, reason);
    assert.doesNotMatch(res.out, /github_pat_TEST123|x y/);
    assert.doesNotMatch(res.out, /200 OK/);
    assert.match(res.err, reason);
  }
});

test("C7: the gate runs on the VM with the token as a credential; jobs get its socket read-only", () => {
  const unit = read("vm/halonic-ci-gate@.service");
  assert.match(unit, /^LoadCredential=github-token:\/etc\/halonic-ci\/queue-token$/m);
  assert.match(unit, /^DynamicUser=yes$/m);
  assert.match(unit, /^StandardInput=socket$/m);
  const socket = read("vm/halonic-ci-gate.socket");
  assert.match(socket, /^ListenStream=\/run\/halonic-ci-gate\/gate\.sock$/m);
  const slot = read("vm/halonic-runner-slot.sh");
  // Every slot but a fast one gets this socket; a fast slot gets its own (fast-pool.test.mjs).
  assert.ok(slot.includes("SANDBOX=(); GATE_DIR=/run/halonic-ci-gate\n"));
  assert.ok(slot.includes('-v "$GATE_DIR:/run/halonic-ci-gate:ro"'));
  // The token stays outside the pool folder, the only part of /etc/halonic-ci a job sees.
  assert.doesNotMatch(slot, /queue-token/);
});
