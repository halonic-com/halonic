import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { nextStep, pemToPkcs8, trustedRun, validSignature, wantedJob } from "./lib.mjs";

const repo = { full_name: "halonic-com/halonic" };
const queued = (over = {}) => ({
  action: "queued",
  repository: repo,
  workflow_job: { id: 7, run_id: 9, name: "Typecheck, lint, test, build", labels: ["cf-linux"] },
  ...over,
});

test("cf-runner takes only queued cf-linux jobs of halonic-com/halonic", () => {
  assert.deepEqual(wantedJob(queued()), {
    id: 7,
    runId: 9,
    name: "Typecheck, lint, test, build",
    queuedAt: undefined,
  });
  assert.equal(wantedJob(queued({ action: "completed" })), null);
  assert.equal(wantedJob(queued({ repository: { full_name: "someone/halonic" } })), null);
  assert.equal(
    wantedJob(queued({ workflow_job: { id: 7, run_id: 9, labels: ["ubuntu-24.04"] } })),
    null,
  );
  assert.equal(wantedJob({}), null);
});

test("cf-runner trusts only the merge queue of main and pushes to main, from the repo itself", () => {
  const run = (event, head_branch, head = repo) => ({
    event,
    head_branch,
    path: ".github/workflows/ci.yml",
    repository: repo,
    head_repository: head,
  });
  assert.equal(trustedRun(run("merge_group", "gh-readonly-queue/main/pr-3666-abc")), true);
  assert.equal(trustedRun(run("push", "main")), true);
  assert.equal(trustedRun(run("push", "release/1.0")), false);
  assert.equal(trustedRun(run("merge_group", "gh-readonly-queue/release/pr-1-abc")), false);
  assert.equal(trustedRun(run("pull_request", "main")), false);
  assert.equal(trustedRun(run("pull_request_target", "main")), false);
  assert.equal(trustedRun(run("push", "main", { full_name: "fork/halonic" })), false);
  assert.equal(trustedRun({ ...run("push", "main"), path: ".github/workflows/other.yml" }), false);
  assert.equal(trustedRun(null), false);
});

test("cf-runner starts again when another job took its runner, and stops an idle one", () => {
  const job = (status, runner_id = null) => ({ status, runner_id });
  const idle = { id: 5, busy: false };
  // A pull request's job took our runner (the hook failed it): ours is still queued.
  assert.equal(nextStep(job("queued"), null, 5), "relaunch");
  // Our runner is running our job, or just finished it.
  assert.equal(nextStep(job("in_progress", 5), { id: 5, busy: true }, 5), "keep");
  assert.equal(nextStep(job("completed", 5), null, 5), "keep");
  assert.equal(nextStep(job("completed", 5), idle, 5), "keep");
  // Still starting up, our job waiting for it.
  assert.equal(nextStep(job("queued"), idle, 5), "keep");
  // Ours was cancelled, or another runner took it, while ours sits idle.
  assert.equal(nextStep(job("completed"), idle, 5), "stop");
  assert.equal(nextStep(job("in_progress", 6), idle, 5), "stop");
  assert.equal(nextStep(null, idle, 5), "stop");
  // Our runner is busy with someone else's job: the hook fails it and the runner goes.
  assert.equal(nextStep(job("in_progress", 6), { id: 5, busy: true }, 5), "keep");
});

test("cf-runner checks the webhook signature", async () => {
  const body = JSON.stringify(queued());
  const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
  assert.equal(await validSignature("s3cret", body, sig), true);
  assert.equal(await validSignature("other", body, sig), false);
  assert.equal(await validSignature("s3cret", `${body} `, sig), false);
  assert.equal(await validSignature("s3cret", body, null), false);
  assert.equal(await validSignature(undefined, body, sig), false);
  assert.equal(await validSignature("s3cret", body, "sha256=zz"), false);
});

test("cf-runner reads GitHub's PKCS#1 app key", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  for (const type of ["pkcs1", "pkcs8"]) {
    const pem = privateKey.export({ type, format: "pem" });
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8(pem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    assert.equal(key.type, "private");
  }
});
