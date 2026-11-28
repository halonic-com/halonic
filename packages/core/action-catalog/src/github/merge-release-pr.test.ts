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
import { definition } from "./merge-release-pr.ts";

const approvedHead = "4f2c9e1b7a3d5c8e0f6a2b4d9c1e7f3a5b8d0c2e";
const movedHead = "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b";
const parameters = {
  owner: "acme",
  repo: "app",
  pull_number: 12,
  sha: approvedHead,
  release_card: "ACME-12",
};
const expected = { sha: approvedHead };
const placeholders = { owner: "acme", repo: "app", pull_number: "12" };
// The page sends the parameters only; the shell adds the constant `merge_method` itself.
const mergeBody = { sha: approvedHead };
const folder = join(import.meta.dirname, "..", "..", "fixtures", "github-merge-release-pr");

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
async function runChecks(scenario: string, expect = expected, values = parameters) {
  const { sender, recorded } = await replay(scenario);
  const kept = new Map<number, Record<string, string | number | boolean | null>>();
  for (let step = 1; step <= 2; step++) {
    const gate = checkStepGate(definition, step, expect, kept, values);
    if (!gate.ok) break;
    const result = await sender.send({ definition: definition.id, version: 1, step, placeholders });
    if (result.outcome === "answered") kept.set(step, result.kept);
  }
  return { sender, recorded, kept };
}

const merge = (sender: FakeActionSender) =>
  sender.send({ definition: definition.id, version: 1, step: 3, placeholders, body: mergeBody });

verifies("action-catalog.github-merge-release-pr", () => {
  describe("github.merge-release-pr@1", () => {
    it("is irreversible, and merges at the approved head only after both checks", async () => {
      expect(definition.risk).toBe("irreversible");
      const { sender, recorded, kept } = await runChecks("merge");
      expect(kept.get(1)).toEqual({
        state: "open",
        merged: false,
        "head.ref": "release/1.4.0",
        "base.ref": "main",
      });
      expect(kept.get(2)).toEqual({ sha: approvedHead });
      expect(checkStepGate(definition, 3, expected, kept, parameters)).toEqual({ ok: true });
      expect(await merge(sender)).toEqual({
        outcome: "answered",
        status: 200,
        kept: { merged: true, sha: "7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b" },
      });
      expect(sender.sent).toEqual(recorded);
      expect(definition.preview(parameters, { ...kept.get(1), ...kept.get(2) })).toEqual([
        "Pull request #12 of acme/app: `release/1.4.0` into `main`.",
        "Its head commit is `4f2c9e1`, the commit release card `ACME-12` approved.",
        "Merges pull request #12 of acme/app as one squashed commit, at commit `4f2c9e1` only, as release card `ACME-12` approved; GitHub refuses the merge if the head moved. A merge can't be undone.",
      ]);
    });

    it('stops with "This changed since the request" when the head differs from expect', async () => {
      const { kept } = await runChecks("head-changed");
      expect(checkStepGate(definition, 3, expected, kept, parameters)).toEqual({
        ok: false,
        check: 2,
        cause: "expect",
        changes: [{ name: "sha", expected: approvedHead, current: movedHead }],
        message: 'This changed since the request: "sha".',
      });
    });

    it("stops when the request's expect matches GitHub but the merge would send another sha", async () => {
      const values = { ...parameters, sha: movedHead };
      const { kept } = await runChecks("head-changed", { sha: movedHead }, values);
      expect(checkStepGate(definition, 3, { sha: movedHead }, kept, parameters)).toEqual({
        ok: false,
        check: 2,
        cause: "requires",
        changes: [],
        message: "The pull request's head commit isn't the one this request merges.",
      });
    });

    it("stops when the pull request is no longer open, before reading its head", async () => {
      const { sender, recorded, kept } = await runChecks("closed");
      expect(sender.sent).toEqual(recorded);
      expect(checkStepGate(definition, 3, expected, kept, parameters)).toEqual({
        ok: false,
        check: 1,
        cause: "requires",
        changes: [],
        message: "This pull request is no longer open, so there is nothing to merge.",
      });
    });

    it("is refused when the request doesn't say which head it saw", () => {
      const kept = new Map([
        [1, { state: "open" }],
        [2, { sha: approvedHead }],
      ]);
      expect(checkStepGate(definition, 3, {}, kept, parameters)).toMatchObject({
        ok: false,
        check: 2,
        cause: "missing-expect",
      });
    });

    it("shows GitHub's refusal when the head moves between the check and the merge", async () => {
      const { sender, recorded, kept } = await runChecks("head-moved-409");
      expect(checkStepGate(definition, 3, expected, kept, parameters)).toEqual({ ok: true });
      expect(await merge(sender)).toEqual({
        outcome: "answered",
        status: 409,
        kept: {},
        error: "Head branch was modified. Review and try the merge again.",
      });
      expect(sender.sent).toEqual(recorded);
    });

    it("names the release card in the preview before anything is read", () => {
      expect(definition.preview(parameters)).toEqual([
        "Reads pull request #12 of acme/app on GitHub. It stops unless the pull request is still open.",
        "Reads the pull request's head commit, and stops unless it is `4f2c9e1`, the commit release card `ACME-12` approved.",
        "Merges pull request #12 of acme/app as one squashed commit, at commit `4f2c9e1` only, as release card `ACME-12` approved; GitHub refuses the merge if the head moved. A merge can't be undone.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "github", kind: "pull request", name: "acme/app pull 12" },
      ]);
    });

    it("builds two checks and an irreversible PUT that sends the approved sha", () => {
      expect(routesOf(definition)).toMatchObject([
        {
          step: 1,
          method: "GET",
          risk: "routine",
          path: "/repos/{owner}/{repo}/pulls/{pull_number}",
        },
        {
          step: 2,
          method: "GET",
          risk: "routine",
          path: "/repos/{owner}/{repo}/commits/pull/{pull_number}/head",
        },
        {
          step: 3,
          method: "PUT",
          risk: "irreversible",
          path: "/repos/{owner}/{repo}/pulls/{pull_number}/merge",
          body: [
            { name: "sha", kind: "string", pattern: "^[0-9a-f]{40}$" },
            { name: "merge_method", kind: "constant", value: "squash" },
          ],
          target: "{owner}/{repo} pull {pull_number}",
        },
      ]);
    });

    it("gives a numbered manual guide on the pull request's page", () => {
      expect(manualGuideFor("github.merge-release-pr@1", parameters, "Release 1.4.0")).toBe(
        [
          "`Release 1.4.0`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/pull/12",
          "2. Check that the pull request says **Open**.",
          "3. Open https://github.com/acme/app/pull/12/commits",
          `4. Check that the newest commit is \`${approvedHead}\`.`,
          "5. Open https://github.com/acme/app/pull/12",
          "6. Choose **Squash and merge** on the merge button, then click it.",
          "7. Click **Confirm squash and merge**.",
          "",
        ].join("\n"),
      );
    });

    it.each([
      { pull_number: 0 },
      { sha: "4f2c9e1" },
      { sha: approvedHead.toUpperCase() },
      { merge_method: "rebase" },
      { release_card: "../main" },
      { release_card: "acme-12" },
      { owner: "acme/other" },
    ])("refuses %o", (change) => {
      expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
    });
  });
});
