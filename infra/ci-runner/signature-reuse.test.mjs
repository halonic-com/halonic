// The signature-only push check (HAL-17896): a push that only adds or replaces the decision note's
// signature lines reuses the previous head's results; anything else runs in full. These tests run
// signature-reuse.mjs against a stub of GitHub's REST API.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  BASE_TESTS_JOB,
  checkJobs,
  checkPush,
  decide,
  MAY_FAIL,
  MERGE_BASE_TITLE,
  main,
  parseMergeBase,
  parseReuse,
  REUSE_TITLE,
} from "./signature-reuse.mjs";

const BEFORE = "a".repeat(40);
const AFTER = "b".repeat(40);
const BRANCH = "acme/HAL-1-widget";
const NOTE = `decisions/${BRANCH}.md`;
const SIG = (key) => `- Signature: ed25519:sha256:${key}:c2lnbmF0dXJl+/==`;
const MERGE_BASE = `sha=${"c".repeat(40)} built-on=${"d".repeat(40)} results-id=900 results-sha256=${"e".repeat(64)}`;
const SHARDS = "core ./packages/core/*\n    app-studio @halonicjs/app-studio\n";

const patch = (...lines) =>
  [`@@ -3,2 +3,${lines.length} @@`, " - Kind: internal", ...lines, " "].join("\n");
const compareOf = ({
  files,
  parents = [BEFORE],
  ahead = 1,
  behind = 0,
  status = "ahead",
} = {}) => ({
  status,
  ahead_by: ahead,
  behind_by: behind,
  commits: [{ sha: AFTER, parents: parents.map((sha) => ({ sha })) }],
  files: files ?? [{ filename: NOTE, status: "modified", patch: patch(`+${SIG("liam")}`) }],
});
const job = (name, conclusion = "success", id = name.length) => ({
  name,
  conclusion,
  check_run_url: `https://api.github.com/repos/acme/widgets/check-runs/${id}`,
});
const fullRun = (overrides = {}) => [
  job("Changed areas"),
  job("Typecheck, lint, test, build (core)"),
  job("Typecheck, lint, test, build (app-studio)"),
  job("Merge base's tests (no cache)", "success", 501),
  job("Requirements and the requirement guard (merge base's copy)", "failure"),
  job("Studio end-to-end (Playwright)", "skipped"),
  job("Cancel the run on the first failure"),
  job("ci-ok", "failure"),
  ...Object.entries(overrides).map(([name, conclusion]) => job(name, conclusion)),
];
const artifacts = (expired = false) => [
  { id: 11, name: "test-results-core", expired },
  { id: 12, name: "test-results-app-studio", expired: false },
  { id: 900, name: "merge-base-test-results", expired: false },
];

// GitHub's API as the job sees it: the compare, the runs of BEFORE, their jobs, annotations and
// artifacts. `runs` maps a run id to its jobs; run 70 is BEFORE's newest.
const github = ({
  compare = compareOf(),
  runs = { 70: fullRun() },
  annotations = {},
  kept = artifacts(),
} = {}) => {
  const asked = [];
  const fetchImpl = async (url, options) => {
    asked.push(url);
    assert.equal(options.headers.authorization, "Bearer test-token");
    const path = new URL(url).pathname;
    const reply = (body, status = 200) => ({ status, json: async () => body });
    if (path === `/repos/acme/widgets/compare/${BEFORE}...${AFTER}`) return reply(compare);
    if (path === "/repos/acme/widgets/actions/workflows/ci.yml/runs") {
      const run = (id, created, extra = {}) => ({
        id,
        head_sha: BEFORE,
        head_branch: BRANCH,
        status: "completed",
        created_at: created,
        ...extra,
      });
      return reply({
        workflow_runs: [
          run(60, "2026-11-24T10:00:00Z"),
          run(71, "2026-11-24T12:00:00Z", { display_title: "A label was added: nothing to run" }),
          run(70, "2026-11-24T11:00:00Z"),
          run(72, "2026-11-24T13:00:00Z", { status: "in_progress" }),
        ],
      });
    }
    const jobs = /^\/repos\/acme\/widgets\/actions\/runs\/(\d+)\/jobs$/.exec(path);
    if (jobs) return runs[jobs[1]] ? reply({ jobs: runs[jobs[1]] }) : reply({}, 404);
    const kept_ = /^\/repos\/acme\/widgets\/actions\/runs\/(\d+)\/artifacts$/.exec(path);
    if (kept_) return reply({ artifacts: kept });
    const notes = /^\/repos\/acme\/widgets\/check-runs\/(\d+)\/annotations$/.exec(path);
    if (notes) {
      const id = notes[1];
      const fallback = id === "501" ? [{ title: MERGE_BASE_TITLE, message: MERGE_BASE }] : [];
      return reply(annotations[id] ?? fallback);
    }
    return reply({}, 404);
  };
  return { asked, fetchImpl };
};
const ENV = {
  SWITCH: "",
  ATTEMPT: "1",
  DRAFT: "false",
  BEFORE,
  AFTER,
  HEAD_REF: BRANCH,
  REPO: "acme/widgets",
  RUN_ID: "80",
  GH_TOKEN: "test-token",
  BUILD_SHARDS: SHARDS,
};

test("signature reuse: a push that only adds the signature line reuses the previous run", async () => {
  const result = await decide({ env: ENV, fetchImpl: github().fetchImpl });
  assert.equal(result.reuse, true, result.why);
  assert.equal(result.run, "70");
  assert.deepEqual(result.base, {
    sha: "c".repeat(40),
    builtOn: "d".repeat(40),
    resultsId: "900",
    resultsSha256: "e".repeat(64),
  });
});

test("signature reuse: a guardian's second line, or a replaced line, reuses too", async () => {
  for (const lines of [
    [`+${SIG("julian")}`],
    [`-${SIG("liam-old")}`, `+${SIG("liam")}`],
    [` ${SIG("liam")}`, `+${SIG("julian")}`],
  ]) {
    const compare = compareOf({
      files: [{ filename: NOTE, status: "modified", patch: patch(...lines) }],
    });
    const result = await decide({ env: ENV, fetchImpl: github({ compare }).fetchImpl });
    assert.equal(result.reuse, true, `${lines.join(" | ")}: ${result.why}`);
  }
});

test("signature reuse: a second line after a reuse run reuses the run that has the results", async () => {
  const reuseRun = [
    job(REUSE_TITLE, "success", 601),
    job("Typecheck, lint, test, build (core)", "skipped"),
    job("Merge base's tests (no cache)", "skipped"),
    job("Requirements and the requirement guard (merge base's copy)", "failure"),
    job("ci-ok", "failure"),
  ];
  const annotations = {
    601: [{ title: REUSE_TITLE, message: "only … changed, so this run reuses … run=55." }],
  };
  const { fetchImpl, asked } = github({ runs: { 70: reuseRun, 55: fullRun() }, annotations });
  const result = await decide({ env: ENV, fetchImpl });
  assert.equal(result.reuse, true, result.why);
  assert.equal(result.run, "55");
  assert.ok(asked.some((url) => url.includes("/actions/runs/55/artifacts")));
  // The run it points at has to pass the same rule.
  const broken = github({
    runs: { 70: reuseRun, 55: fullRun({ "Leak guard": "failure" }) },
    annotations,
  });
  assert.equal((await decide({ env: ENV, fetchImpl: broken.fetchImpl })).reuse, false);
});

test("signature reuse: any other changed line in the note runs everything", async () => {
  for (const lines of [
    ["+- Kind: user-visible"],
    [`+${SIG("liam")}`, "+One more sentence."],
    ["-- Approval: https://example.test/HAL-1"],
    ["+  - Signature: ed25519:indented"],
    ["+- Signature: rsa:sha256:other"],
    [],
  ]) {
    const compare = compareOf({
      files: [{ filename: NOTE, status: "modified", patch: patch(...lines) }],
    });
    const result = await decide({ env: ENV, fetchImpl: github({ compare }).fetchImpl });
    assert.equal(result.reuse, false, lines.join(" | "));
  }
});

test("signature reuse: a second file, another note, or a new note runs everything", async () => {
  const signed = { filename: NOTE, status: "modified", patch: patch(`+${SIG("liam")}`) };
  for (const files of [
    [signed, { filename: "packages/core/app/src/index.ts", status: "modified", patch: "+x" }],
    [{ ...signed, filename: "decisions/acme/HAL-2-other.md" }],
    [{ ...signed, status: "added" }],
    [{ ...signed, patch: undefined }],
    [],
  ]) {
    const result = await decide({
      env: ENV,
      fetchImpl: github({ compare: compareOf({ files }) }).fetchImpl,
    });
    assert.equal(result.reuse, false, JSON.stringify(files.map((file) => file.filename)));
  }
});

test("signature reuse: a rebase, a merge or more than one commit runs everything", async () => {
  for (const compare of [
    compareOf({ parents: ["f".repeat(40)] }),
    compareOf({ parents: [BEFORE, "f".repeat(40)] }),
    compareOf({ ahead: 2 }),
    compareOf({ behind: 3, status: "diverged" }),
  ]) {
    assert.equal(
      (await decide({ env: ENV, fetchImpl: github({ compare }).fetchImpl })).reuse,
      false,
    );
  }
});

test("signature reuse: a previous run with another failed, cancelled or missing job runs everything", async () => {
  for (const runs of [
    { 70: fullRun({ "Leak guard": "failure" }) },
    { 70: fullRun({ "Sandbox fence (Seatbelt)": "cancelled" }) },
    { 70: fullRun({ "Fast gates": "timed_out" }) },
    {
      70: fullRun().map((entry) =>
        entry.name === "ci-ok" ? { ...entry, name: "ci-ok (draft, light run)" } : entry,
      ),
    },
  ]) {
    assert.equal((await decide({ env: ENV, fetchImpl: github({ runs }).fetchImpl })).reuse, false);
  }
  // Jobs GitHub won't list: the step answers a full run instead of failing.
  assert.equal((await main({ env: ENV, fetchImpl: github({ runs: {} }).fetchImpl })).reuse, false);
});

test("signature reuse: expired results or an unreported merge base run everything", async () => {
  assert.equal(
    (await decide({ env: ENV, fetchImpl: github({ kept: artifacts(true) }).fetchImpl })).reuse,
    false,
  );
  const noNotice = github({ annotations: { 501: [] } });
  assert.equal((await decide({ env: ENV, fetchImpl: noNotice.fetchImpl })).reuse, false);
});

test("signature reuse: attempt 2, a draft, the switch or a missing head never asks GitHub", async () => {
  const { asked, fetchImpl } = github();
  for (const env of [
    { ...ENV, ATTEMPT: "2" },
    { ...ENV, DRAFT: "true" },
    { ...ENV, SWITCH: "off" },
    { ...ENV, BEFORE: "0".repeat(40) },
    { ...ENV, BEFORE: "" },
    { ...ENV, AFTER: "nope" },
    { ...ENV, HEAD_REF: "" },
    { ...ENV, GH_TOKEN: "" },
  ]) {
    assert.equal((await decide({ env, fetchImpl })).reuse, false, JSON.stringify(env));
  }
  assert.deepEqual(asked, []);
});

test("signature reuse: the parsers and the rules on their own", () => {
  assert.deepEqual(parseMergeBase(MERGE_BASE)?.resultsId, "900");
  for (const message of ["", "sha=abc", MERGE_BASE.replace("results-id=900", "results-id=x")]) {
    assert.equal(parseMergeBase(message), null, message);
  }
  assert.equal(parseReuse("reuses the results of run=123."), "123");
  assert.equal(parseReuse("no run here"), null);
  assert.equal(checkJobs(MAY_FAIL.map((name) => job(name, "failure"))).reuse, true);
  assert.equal(checkPush({ compare: null, before: BEFORE, after: AFTER, note: NOTE }).reuse, false);
});

test("signature reuse: the job's step writes its outputs and never throws", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "signature-reuse-")), "output");
  await main({ env: { ...ENV, GITHUB_OUTPUT: out }, fetchImpl: github().fetchImpl });
  const broken = async () => {
    throw new TypeError("boom");
  };
  const result = await main({ env: { ...ENV, GITHUB_OUTPUT: out }, fetchImpl: broken });
  assert.equal(result.reuse, false);
  assert.equal(
    readFileSync(out, "utf8"),
    `run=70\nsha=${"c".repeat(40)}\nbuilt-on=${"d".repeat(40)}\nresults-id=900\nresults-sha256=${"e".repeat(64)}\n`,
  );
});

test("signature reuse: the job, notice and job names match ci.yml's", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
  const names = [...workflow.matchAll(/^ {4}name: (.+)$/gm)].map((match) => match[1]);
  // A later push finds the reuse job by its name and reads its notice by the same title.
  for (const name of [REUSE_TITLE, BASE_TESTS_JOB, ...MAY_FAIL.filter((job) => job !== "ci-ok")]) {
    assert.ok(names.includes(name), name);
  }
  assert.ok(workflow.includes(`::notice title=${MERGE_BASE_TITLE}::sha=$SHA built-on=$BUILT_ON `));
  assert.ok(workflow.includes("        run: node infra/ci-runner/signature-reuse.mjs\n"));
});
