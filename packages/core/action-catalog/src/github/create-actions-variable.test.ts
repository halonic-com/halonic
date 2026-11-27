import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routesOf } from "@halonicjs/action-steppers";
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
import { definition } from "./create-actions-variable.ts";

const parameters = { owner: "acme", repo: "app", name: "RELEASE_CHANNEL", value: "stable" };
const folder = join(import.meta.dirname, "..", "..", "fixtures", "github-create-actions-variable");

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
const create = {
  definition: definition.id,
  version: 1,
  step: 1,
  placeholders: { owner: "acme", repo: "app" },
  body: { name: "RELEASE_CHANNEL", value: "stable" },
};

verifies("action-catalog.github-create-actions-variable", () => {
  describe("github.create-actions-variable@1", () => {
    it("sends the name and the value in one POST", async () => {
      const { sender, recorded } = await replay("create");
      expect(await sender.send(create)).toEqual({ outcome: "answered", status: 201, kept: {} });
      expect(sender.sent).toEqual(recorded);
    });

    it("hands back GitHub's 409 for a name in use, and the preview says to change it instead", async () => {
      const { sender } = await replay("already-exists-409");
      expect(await sender.send(create)).toEqual({
        outcome: "answered",
        status: 409,
        kept: {},
        error: "Already exists - Variable already exists",
      });
      expect(definition.preview(parameters)).toEqual([
        'Creates the Actions variable `RELEASE_CHANNEL` in acme/app with the value `stable`. If GitHub answers that it already exists, use "Change an Actions variable" instead.',
      ]);
    });

    it("builds one admin POST with both fields checked by their parameters", () => {
      expect(routesOf(definition)).toMatchObject([
        {
          step: 1,
          method: "POST",
          risk: "admin",
          path: "/repos/{owner}/{repo}/actions/variables",
          body: [
            { name: "name", kind: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]{0,99}$" },
            { name: "value", kind: "string", pattern: "^[ -~]{1,1000}$" },
          ],
        },
      ]);
    });

    it("gives a numbered manual guide on the new variable page", () => {
      expect(manualGuideFor("github.create-actions-variable@1", parameters, "Add a channel")).toBe(
        [
          "`Add a channel`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/settings/variables/actions/new",
          "2. Set **Name** to `RELEASE_CHANNEL` and **Value** to `stable`.",
          "3. Click **Add variable**. If GitHub says the name is already in use, use **Change an Actions variable** instead.",
          "",
        ].join("\n"),
      );
    });

    it.each([{ name: "" }, { name: "A B" }, { value: "x".repeat(1001) }, { path: "x" }])(
      "refuses %o",
      (change) => {
        expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
      },
    );
  });
});
