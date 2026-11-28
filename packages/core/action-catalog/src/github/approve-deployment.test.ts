import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkStepGate, routesOf } from "@halonicjs/action-steppers";
import { parse } from "@halonicjs/schema-kit";
import { FakeActionSender } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  parseGithubRecording,
  recordedAnswers,
  recordedCalls,
} from "../github-replay.test-helper.ts";
import { manualGuideFor } from "../guide.test-helper.ts";
import { definition } from "./approve-deployment.ts";

const seenCommit = "4f2c9e1b7a3d5c8e0f6a2b4d9c1e7f3a5b8d0c2e";
const parameters = {
  owner: "acme",
  repo: "app",
  run_id: 7001,
  environment: "production",
  environment_id: 42,
};
const expected = { head_sha: seenCommit };

/** The path's placeholders for one step, as the page sorts a request's values into them. */
function placeholdersFor(step: number, values: typeof parameters) {
  const repository = { owner: values.owner, repo: values.repo };
  if (step === 2) return { ...repository, environment: values.environment };
  return { ...repository, run_id: String(values.run_id) };
}
const folder = join(import.meta.dirname, "..", "..", "fixtures", "github-approve-deployment");

/** A fake sender signed in to GitHub as `acme-dev` that replays one recorded scenario. */
async function replay(scenario: string) {
  const text = readFileSync(join(folder, `${scenario}.json`), "utf8");
  const recording = parseGithubRecording(text);
  const sender = new FakeActionSender({
    routes: routesOf(definition),
    signInAs: { github: "acme-dev" },
    answer: recordedAnswers(recording),
  });
  await sender.signIn("github");
  return { sender, recorded: recordedCalls(recording) };
}

/** Runs the recorded checks in order, as the stepper does, and what each kept. */
async function runChecks(scenario: string, values = parameters, checks = 2) {
  const { sender, recorded } = await replay(scenario);
  const kept = new Map<number, Record<string, string | number | boolean | null>>();
  for (let step = 1; step <= checks; step++) {
    const gate = checkStepGate(definition, step, expected, kept, values);
    if (!gate.ok) break;
    const result = await sender.send({
      definition: definition.id,
      version: 1,
      step,
      placeholders: placeholdersFor(step, values),
    });
    if (result.outcome === "answered") kept.set(step, result.kept);
  }
  return { sender, recorded, kept };
}

verifies("action-catalog.github-approve-deployment", () => {
  describe("github.approve-deployment@1", () => {
    it("is irreversible, and approves only after both checks with GitHub's environment name", async () => {
      expect(definition.risk).toBe("irreversible");
      const { sender, recorded, kept } = await runChecks("approve");
      expect(kept.get(1)).toEqual({
        status: "waiting",
        head_sha: seenCommit,
        head_branch: "main",
        "head_repository.full_name": "acme/app",
        "triggering_actor.login": "acme-dev",
      });
      expect(kept.get(2)).toEqual({ id: 42, name: "production" });
      expect(checkStepGate(definition, 3, expected, kept, parameters)).toEqual({ ok: true });
      const approval = await sender.send({
        definition: definition.id,
        version: 1,
        step: 3,
        placeholders: placeholdersFor(3, parameters),
        body: { environment_ids: [42] },
      });
      expect(approval).toEqual({ outcome: "answered", status: 200, kept: {} });
      expect(sender.sent).toEqual(recorded);
      const current = { ...kept.get(1), ...kept.get(2) };
      expect(definition.preview(parameters, current)).toEqual([
        "Run 7001 of acme/app: commit `4f2c9e1` on `main`, started by `acme-dev`.",
        "Environment `production` (id 42).",
        "Approves run 7001 of acme/app for the environment `production`. This starts the deployment and can't be undone.",
      ]);
    });

    it("is refused when the run's head commit differs from the request's expect", async () => {
      const { kept } = await runChecks("head-changed");
      expect(checkStepGate(definition, 3, expected, kept, parameters)).toMatchObject({
        ok: false,
        check: 1,
        cause: "expect",
        changes: [
          {
            name: "head_sha",
            expected: seenCommit,
            current: "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b",
          },
        ],
      });
    });

    it("is refused when the run is no longer waiting", async () => {
      const { kept } = await runChecks("no-longer-waiting");
      expect(checkStepGate(definition, 3, expected, kept, parameters)).toEqual({
        ok: false,
        check: 1,
        cause: "requires",
        changes: [],
        message: "This run is no longer waiting for approval, so there is nothing to approve.",
      });
    });

    it("is refused when the request doesn't say which commit it saw", () => {
      const kept = new Map([[1, { status: "waiting", head_sha: seenCommit }]]);
      expect(checkStepGate(definition, 3, {}, kept, parameters)).toMatchObject({
        ok: false,
        check: 1,
        cause: "missing-expect",
      });
    });

    it("is refused when the environment's name and id don't belong together", async () => {
      // The request names `staging` but sends production's id: GitHub's id for staging is 41.
      const mismatched = { ...parameters, environment: "staging" };
      const { sender, recorded, kept } = await runChecks("environment-id-mismatch", mismatched);
      expect(sender.sent).toEqual(recorded);
      expect(checkStepGate(definition, 3, expected, kept, mismatched)).toEqual({
        ok: false,
        check: 2,
        cause: "requires",
        changes: [],
        message: "GitHub's environment by this name isn't the one this request approves.",
      });
    });

    it("names the fork a pull request's run comes from, whose branch the fork chose", async () => {
      // outsider/app opened a pull request from its own branch called `main`.
      const { kept } = await runChecks("fork-run");
      expect(kept.get(1)?.["head_repository.full_name"]).toBe("outsider/app");
      const current = { ...kept.get(1), ...kept.get(2) };
      expect(definition.preview(parameters, current)[0]).toBe(
        "Run 7001 of acme/app: commit `4f2c9e1` on `main` of the fork `outsider/app`, started by `outsider`.",
      );
    });

    it("doesn't call the request's own repository a fork when only the case differs", () => {
      const current = {
        head_sha: seenCommit,
        head_branch: "main",
        "head_repository.full_name": "Acme/App",
      };
      expect(definition.preview(parameters, current)[0]).toBe(
        "Run 7001 of acme/app: commit `4f2c9e1` on `main`.",
      );
    });

    it("says so when GitHub names no repository for the commit, as for a deleted fork", () => {
      const current = { head_sha: seenCommit, head_branch: "main" };
      expect(definition.preview(parameters, current)[0]).toBe(
        "Run 7001 of acme/app: commit `4f2c9e1` on `main` of a repository GitHub didn't name.",
      );
    });

    it("doesn't pair GitHub's environment name with another environment's id", async () => {
      const mismatched = { ...parameters, environment: "staging" };
      const { kept } = await runChecks("environment-id-mismatch", mismatched);
      const preview = definition.preview(mismatched, { ...kept.get(1), ...kept.get(2) });
      expect(preview.slice(1)).toEqual([
        "GitHub's environment `staging` has id 41, not 42, the id this request approves.",
        "Approves run 7001 of acme/app for the environment id 42. This starts the deployment and can't be undone.",
      ]);
    });

    it("never shows the request's environment name before GitHub has read it", () => {
      const preview = definition.preview({ ...parameters, environment: "staging" }).join(" ");
      expect(preview).not.toContain("staging");
      expect(preview).toContain("id 42");
    });

    it("builds two checks and an irreversible POST with a one-item id list", () => {
      expect(routesOf(definition)).toMatchObject([
        {
          step: 1,
          method: "GET",
          risk: "routine",
          path: "/repos/{owner}/{repo}/actions/runs/{run_id}",
        },
        { step: 2, method: "GET", risk: "routine" },
        {
          step: 3,
          method: "POST",
          risk: "irreversible",
          path: "/repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments",
          body: [
            { name: "environment_ids", kind: "integer-list" },
            { name: "state", kind: "constant", value: "approved" },
            { name: "comment", kind: "constant", value: "Approved in Halonic." },
          ],
          target: "{owner}/{repo} run {run_id}",
        },
      ]);
    });

    it("gives a numbered manual guide on the run's page", () => {
      expect(manualGuideFor("github.approve-deployment@1", parameters, "Release 1.4")).toBe(
        [
          "`Release 1.4`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/actions/runs/7001",
          "2. Check that the run says **Waiting** and that its commit is the one in the request.",
          "3. Open https://github.com/acme/app/settings/environments",
          "4. Check that `production` is listed.",
          "5. Open https://github.com/acme/app/actions/runs/7001",
          "6. Click **Review deployments**.",
          "7. Tick `production` only, then click **Approve and deploy**.",
          "",
        ].join("\n"),
      );
    });

    it.each([
      { run_id: 0 },
      { environment_id: "42" },
      { environment: "prod/../main" },
      { environment: "two words" },
      { environment: "." },
      { environment: ".." },
      { state: "rejected" },
    ])("refuses %o", (change) => {
      expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
    });
  });
});
