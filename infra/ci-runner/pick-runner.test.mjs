// The runner picker (HAL-17654): our fast pool only while it has room, GitHub's runners on any
// doubt. These tests run pick-runner.mjs against a stub of GitHub's REST API.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  countIdle,
  DEFAULT_MIN_IDLE,
  decide,
  inScope,
  main,
  parseMinIdle,
  parseTarget,
  pick,
} from "./pick-runner.mjs";

const FAST = '{"group":"halonic-ci","labels":["halonic-ci-fast"]}';
const runner = (name, { status = "online", busy = false, labels = ["halonic-ci-fast"] } = {}) => ({
  name,
  status,
  busy,
  labels: ["self-hosted", "Linux", ...labels].map((label) => ({ name: label })),
});
const idleRunners = (count) => Array.from({ length: count }, (_, i) => runner(`hci-fast-${i + 1}`));
// GitHub's API as the job sees it: the org's runner groups, then group 7's runners.
const github = (runners, { groupsStatus = 200, runnersStatus = 200 } = {}) => {
  const asked = [];
  const fetchImpl = async (url, options) => {
    asked.push({ url, auth: options.headers.authorization });
    const path = new URL(url).pathname;
    const reply = (status, body) => ({ status, json: async () => body });
    if (path === "/orgs/halonic-com/actions/runner-groups") {
      return reply(groupsStatus, {
        runner_groups: [
          { id: 1, name: "Default" },
          { id: 7, name: "halonic-ci" },
        ],
      });
    }
    if (path === "/orgs/halonic-com/actions/runner-groups/7/runners") {
      return reply(runnersStatus, { total_count: runners.length, runners });
    }
    return reply(404, {});
  };
  return { asked, fetchImpl };
};
const ENV = {
  CI_FAST_SCOPE: "",
  CI_FAST_MIN_IDLE: "",
  CI_RUNNER_FAST: FAST,
  PR_LABELS: '["fast-track"]',
  RUNNERS_TOKEN: "test-token",
  ORG: "halonic-com",
};

test("picker: the fast pool at or above the threshold, GitHub below it", async () => {
  for (const [idle, fast] of [
    [DEFAULT_MIN_IDLE - 1, false],
    [DEFAULT_MIN_IDLE, true],
    [DEFAULT_MIN_IDLE + 10, true],
    [0, false],
  ]) {
    const { fetchImpl } = github(idleRunners(idle));
    assert.equal((await pick({ env: ENV, fetchImpl })).fast, fast, `${idle} idle`);
  }
  const { fetchImpl } = github(idleRunners(5));
  assert.equal((await pick({ env: { ...ENV, CI_FAST_MIN_IDLE: "5" }, fetchImpl })).fast, true);
  assert.equal((await pick({ env: { ...ENV, CI_FAST_MIN_IDLE: "6" }, fetchImpl })).fast, false);
});

test("picker: counts only online, idle runners with every label of CI_RUNNER_FAST", () => {
  const runners = [
    runner("idle"),
    runner("busy", { busy: true }),
    runner("offline", { status: "offline" }),
    runner("large", { labels: ["halonic-ci-large"] }),
    { ...runner("busy-unknown"), busy: undefined },
    { name: "no-labels", status: "online", busy: false },
    null,
  ];
  assert.equal(countIdle(runners, ["halonic-ci-fast"]), 1);
  assert.equal(countIdle(runners, ["halonic-ci-fast", "gpu"]), 0);
});

test("picker: CI_FAST_SCOPE fast-track needs the label, all doesn't, anything else is fast-track", () => {
  assert.equal(inScope("fast-track", ["fast-track"]).ok, true);
  assert.equal(inScope("fast-track", ["ci", "Fast-Track"]).ok, false);
  assert.equal(inScope("", []).ok, false);
  assert.equal(inScope("all", []).ok, true);
  for (const scope of ["ALL", " all", "everyone", undefined]) {
    assert.equal(inScope(scope, []).ok, false, String(scope));
  }
  assert.equal(inScope("fast-track", null).ok, false);
});

test("picker: an unlabelled pull request under fast-track never asks GitHub", async () => {
  const { asked, fetchImpl } = github(idleRunners(40));
  const result = await pick({ env: { ...ENV, PR_LABELS: "[]" }, fetchImpl });
  assert.equal(result.fast, false);
  assert.deepEqual(asked, []);
  // Under "all" the same pull request goes to the fast pool when it has room.
  const all = await pick({ env: { ...ENV, PR_LABELS: "[]", CI_FAST_SCOPE: "all" }, fetchImpl });
  assert.equal(all.fast, true);
  assert.equal(asked.length, 2);
  assert.equal(asked[0].auth, "Bearer test-token");
});

test("picker: falls back to GitHub, never our pool, when the API fails or answers oddly", async () => {
  const many = idleRunners(40);
  const cases = [
    github(many, { groupsStatus: 403 }).fetchImpl,
    github(many, { runnersStatus: 500 }).fetchImpl,
    async () => {
      throw new Error("network down");
    },
    async () => ({ status: 200, json: async () => ({ runner_groups: "nope" }) }),
    async () => ({ status: 200, json: async () => ({ runner_groups: [] }) }),
    async () => ({
      status: 200,
      json: async () => ({ runner_groups: [{ id: "7", name: "halonic-ci" }] }),
    }),
    async (url) => ({
      status: 200,
      json: async () =>
        url.includes("/runners")
          ? { runners: null }
          : { runner_groups: [{ id: 7, name: "halonic-ci" }] },
    }),
  ];
  for (const fetchImpl of cases) {
    const result = await pick({ env: ENV, fetchImpl });
    assert.equal(result.fast, false, result.why);
    assert.match(result.why, /couldn't be read/);
  }
});

test("picker: falls back to GitHub without a token, an organisation or a readable setting", async () => {
  const { asked, fetchImpl } = github(idleRunners(40));
  for (const env of [
    { ...ENV, RUNNERS_TOKEN: "" },
    { ...ENV, RUNNERS_TOKEN: undefined },
    { ...ENV, ORG: "" },
    { ...ENV, ORG: "halonic-com/../x" },
    { ...ENV, CI_RUNNER_FAST: "" },
    { ...ENV, CI_RUNNER_FAST: '{"labels":["halonic-ci-fast"]}' },
    { ...ENV, CI_RUNNER_FAST: '{"group":"halonic-ci","labels":[]}' },
    { ...ENV, CI_FAST_MIN_IDLE: "lots" },
    { ...ENV, CI_FAST_MIN_IDLE: "0" },
    { ...ENV, CI_FAST_MIN_IDLE: "101" },
    { ...ENV, PR_LABELS: "not json" },
  ]) {
    assert.equal((await pick({ env, fetchImpl })).fast, false, JSON.stringify(env));
  }
  assert.deepEqual(asked, []);
});

test("picker: the settings' parsers", () => {
  assert.equal(parseMinIdle(""), DEFAULT_MIN_IDLE);
  assert.equal(parseMinIdle(undefined), DEFAULT_MIN_IDLE);
  assert.equal(parseMinIdle(" 20 "), 20);
  assert.equal(parseMinIdle("100"), 100);
  for (const raw of ["0", "-3", "1.5", "1e2", "101", "x"])
    assert.equal(parseMinIdle(raw), null, raw);
  assert.deepEqual(parseTarget(FAST), { group: "halonic-ci", labels: ["halonic-ci-fast"] });
  for (const raw of [
    "",
    "null",
    "[]",
    '{"group":"","labels":["a"]}',
    '{"group":"g","labels":[""]}',
  ]) {
    assert.equal(parseTarget(raw), null, raw);
  }
  assert.equal(decide({ scope: "all", labels: [], minIdle: 3, idle: undefined }).fast, false);
});

test("picker: the job's step writes its answer and never throws", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "pick-runner-")), "output");
  const busy = github(idleRunners(2)).fetchImpl;
  const result = await main({ env: { ...ENV, GITHUB_OUTPUT: out }, fetchImpl: busy });
  assert.equal(result.fast, false);
  const free = github(idleRunners(20)).fetchImpl;
  await main({ env: { ...ENV, GITHUB_OUTPUT: out }, fetchImpl: free });
  const broken = async () => {
    throw new TypeError("boom");
  };
  await main({ env: { ...ENV, GITHUB_OUTPUT: out }, fetchImpl: broken });
  assert.equal(readFileSync(out, "utf8"), "fast=false\nfast=true\nfast=false\n");
});
