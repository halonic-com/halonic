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
import { definition } from "./configure-environment.ts";

const parameters = {
  owner: "acme",
  repo: "app",
  environment: "production",
  reviewer: "acme-lead",
  wait_timer: 10,
  branches: "Protected branches only",
};
const placeholders = { owner: "acme", repo: "app", environment: "production" };
const folder = join(import.meta.dirname, "..", "..", "fixtures", "github-configure-environment");
// When the stepper opened, from the shell's own clock.
const startedAt = "2026-11-27T09:00:00Z";

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

const kept = (result: Awaited<ReturnType<FakeActionSender["send"]>>) =>
  result.outcome === "answered" ? result.kept : {};

verifies("action-catalog.github-configure-environment", () => {
  describe("github.configure-environment@1", () => {
    it("reads the environment, previews today's branches, then checks it was saved", async () => {
      const { sender, recorded } = await replay("before-and-after");
      const step = { definition: definition.id, version: 1, placeholders };
      const before = kept(await sender.send({ ...step, step: 1 }));
      expect(before).toEqual({ name: "production", can_admins_bypass: false });
      expect(definition.preview(parameters, before)).toEqual([
        "Today, `production` of acme/app deploys from any branch.",
        'Opens the environment settings on GitHub, where you add `acme-lead` as required reviewer, set the wait timer to 10 minutes and choose "Protected branches only".',
        "Then checks on GitHub that `production` of acme/app was saved after this stepper opened.",
      ]);
      const after = kept(await sender.send({ ...step, step: 3 }));
      expect(after).toMatchObject({
        "deployment_branch_policy.protected_branches": true,
        "deployment_branch_policy.custom_branch_policies": false,
      });
      expect(checkChangedAfterStart(after, "updated_at", startedAt)).toEqual({ ok: true });
      expect(sender.sent).toEqual(recorded);
    });

    it("fails the last check when the environment wasn't saved since the stepper opened", async () => {
      const { sender } = await replay("not-saved");
      const step = { definition: definition.id, version: 1, placeholders, step: 3 };
      const after = kept(await sender.send(step));
      expect(checkChangedAfterStart(after, "updated_at", startedAt)).toMatchObject({ ok: false });
    });

    it("is an admin guided step between two checks, with no call to change the environment", () => {
      expect(definition.risk).toBe("admin");
      expect(definition.steps.map((each) => each.kind)).toEqual(["check", "guided", "check"]);
      const calls = routesOf(definition).filter((route) => route.kind === "call");
      expect(calls.map((route) => route.method)).toEqual(["GET", "GET"]);
    });

    it("gives a numbered manual guide on the environments page", () => {
      expect(
        manualGuideFor("github.configure-environment@1", parameters, "Protect production"),
      ).toBe(
        [
          "`Protect production`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/settings/environments",
          "2. Click `production` and note its protection rules.",
          "3. Open https://github.com/acme/app/settings/environments",
          "4. Click `production`.",
          "5. Under **Deployment protection rules**, tick **Required reviewers** and add `acme-lead`.",
          "6. Tick **Wait timer** and set it to `10` minutes, or untick it for 0.",
          "7. Click **Save protection rules**.",
          "8. Under **Deployment branches and tags**, choose `Protected branches only`.",
          "9. Open https://github.com/acme/app/settings/environments",
          "10. Click `production` and check the rules you just set are shown.",
          "",
        ].join("\n"),
      );
    });

    it.each([
      { wait_timer: 43_201 },
      { branches: "Selected branches" },
      { reviewer: "-acme" },
      { environment: "a/b" },
    ])("refuses %o", (change) => {
      expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
    });
  });
});
