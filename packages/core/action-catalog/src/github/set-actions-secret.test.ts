import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkChangedAfterStart, routesOf } from "@halonicjs/action-steppers";
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
import { secretFields } from "../guided-test-support.ts";
import { definition } from "./set-actions-secret.ts";

const parameters = { owner: "acme", repo: "app", name: "DEPLOY_TOKEN" };
const folder = join(import.meta.dirname, "..", "..", "fixtures", "github-set-actions-secret");

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
// When the stepper opened, from the shell's own clock.
const startedAt = "2026-11-27T09:00:00Z";

/** Runs the recorded check and judges its `updated_at` against the stepper's start. */
async function checkAfterStart(scenario: string) {
  const { sender, recorded } = await replay(scenario);
  const result = await sender.send({
    definition: definition.id,
    version: 1,
    step: 2,
    placeholders: parameters,
  });
  expect(sender.sent).toEqual(recorded);
  const kept = result.outcome === "answered" ? result.kept : {};
  return { result, judged: checkChangedAfterStart(kept, "updated_at", startedAt) };
}

verifies("action-catalog.github-set-actions-secret", () => {
  describe("github.set-actions-secret@1", () => {
    it("has no parameter, input, result or kept field that can carry the value", () => {
      expect(secretFields(definition)).toEqual([]);
      expect(definition.steps.map((step) => step.kind)).toEqual(["guided", "check"]);
      expect(definition.steps[0]).not.toHaveProperty("result");
      expect(definition.steps[1]).toMatchObject({
        keep: ["name", "updated_at"],
        changedAfterStart: "updated_at",
      });
      expect(parse(definition.parameters, parameters).ok).toBe(true);
      for (const extra of ["value", "secret", "encrypted_value"]) {
        expect(parse(definition.parameters, { ...parameters, [extra]: "x" }).ok).toBe(false);
      }
      expect(
        routesOf(definition).every((route) => route.kind !== "call" || route.body.length === 0),
      ).toBe(true);
    });

    it("passes the check when GitHub saved the secret after the stepper opened", async () => {
      const { result, judged } = await checkAfterStart("updated-after-start");
      expect(result).toEqual({
        outcome: "answered",
        status: 200,
        kept: { name: "DEPLOY_TOKEN", updated_at: "2026-11-27T09:03:41Z" },
      });
      expect(judged).toEqual({ ok: true });
    });

    it("fails the check when the secret wasn't saved since the stepper opened", async () => {
      const { judged } = await checkAfterStart("not-updated");
      expect(judged).toEqual({
        ok: false,
        message: "It hasn't changed since this stepper opened.",
      });
    });

    it("fails the check when GitHub has no such secret", async () => {
      const { result, judged } = await checkAfterStart("not-found-404");
      expect(result).toMatchObject({ status: 404, kept: {}, error: "Not Found" });
      expect(judged.ok).toBe(false);
    });

    it("opens the secrets page, then reads the secret with a routine GET", () => {
      expect(routesOf(definition)).toMatchObject([
        {
          step: 1,
          kind: "guided",
          address: "https://github.com/{owner}/{repo}/settings/secrets/actions",
        },
        {
          step: 2,
          method: "GET",
          risk: "routine",
          path: "/repos/{owner}/{repo}/actions/secrets/{name}",
          keep: ["name", "updated_at"],
        },
      ]);
      expect(definition.preview(parameters)).toEqual([
        "Opens the Actions secrets of acme/app on GitHub, where you type the value of `DEPLOY_TOKEN` yourself. Halonic never sees it.",
        "Then checks on GitHub that `DEPLOY_TOKEN` was saved after this stepper opened.",
      ]);
    });

    it("gives a numbered manual guide on the secrets page", () => {
      expect(
        manualGuideFor("github.set-actions-secret@1", parameters, "Rotate the deploy token"),
      ).toBe(
        [
          "`Rotate the deploy token`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/settings/secrets/actions",
          "2. On the **Secrets** tab, under **Repository secrets**, find `DEPLOY_TOKEN` and click its pencil icon. If it isn't listed, click **New repository secret** and set **Name** to `DEPLOY_TOKEN`.",
          "3. Paste or type the value into **Secret** (or **Value**). Type it only there, never in a chat or a request.",
          "4. Click **Update secret** (or **Add secret**).",
          "5. Open https://github.com/acme/app/settings/secrets/actions",
          "6. Check that `DEPLOY_TOKEN` is listed under **Repository secrets** and was updated just now.",
          "",
        ].join("\n"),
      );
    });

    it.each([{ name: "DEPLOY TOKEN" }, { name: "../x" }, { repo: "../secrets" }])(
      "refuses %o",
      (change) => {
        expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
      },
    );
  });
});
