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
import { definition } from "./set-actions-variable.ts";

const parameters = { owner: "acme", repo: "app", name: "RELEASE_CHANNEL", value: "stable" };
const placeholders = { owner: "acme", repo: "app", name: "RELEASE_CHANNEL" };
const folder = join(import.meta.dirname, "..", "..", "fixtures", "github-set-actions-variable");

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

verifies("action-catalog.github-set-actions-variable", () => {
  describe("github.set-actions-variable@1", () => {
    it("reads the variable, previews before and after, then sends only the new value", async () => {
      const { sender, recorded } = await replay("read-and-change");
      const step = { definition: definition.id, version: 1, placeholders };
      const today = await sender.send({ ...step, step: 1 });
      const kept = { name: "RELEASE_CHANNEL", value: "beta" };
      expect(today).toEqual({ outcome: "answered", status: 200, kept });
      expect(definition.preview(parameters, kept)[1]).toBe(
        "`RELEASE_CHANNEL` today: `beta`. After: `stable`.",
      );
      const change = await sender.send({ ...step, step: 2, body: { value: "stable" } });
      expect(change).toEqual({ outcome: "answered", status: 204, kept: {} });
      expect(sender.sent).toEqual(recorded);
    });

    it("hands back GitHub's 404 for a variable that doesn't exist, and says to create it", async () => {
      const { sender } = await replay("not-found-404");
      const step = { definition: definition.id, version: 1, step: 1, placeholders };
      expect(await sender.send(step)).toEqual({
        outcome: "answered",
        status: 404,
        kept: {},
        error: "Not Found",
      });
      expect(definition.preview(parameters)).toEqual([
        'Reads the Actions variable `RELEASE_CHANNEL` of acme/app. If GitHub answers "not found", it doesn\'t exist yet: then use "Create an Actions variable".',
        "Sets the Actions variable `RELEASE_CHANNEL` of acme/app to `stable`.",
      ]);
    });

    it("builds a check that runs without the dialog and an admin PATCH", () => {
      expect(routesOf(definition)).toMatchObject([
        { step: 1, kind: "call", method: "GET", risk: "routine", body: [] },
        {
          step: 2,
          method: "PATCH",
          risk: "admin",
          path: "/repos/{owner}/{repo}/actions/variables/{name}",
          body: [{ name: "value", kind: "string", pattern: "^[ -~]{1,1000}$" }],
        },
      ]);
    });

    it("gives a numbered manual guide on the variables page", () => {
      expect(manualGuideFor("github.set-actions-variable@1", parameters, "Ship stable")).toBe(
        [
          "`Ship stable`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/settings/variables/actions",
          "2. On the **Variables** tab, find `RELEASE_CHANNEL` and read its value.",
          "3. If `RELEASE_CHANNEL` isn't listed, use **Create an Actions variable** instead.",
          "4. Open https://github.com/acme/app/settings/variables/actions",
          "5. Click the pencil icon next to `RELEASE_CHANNEL`.",
          "6. Set **Value** to `stable`, then click **Update variable**.",
          "",
        ].join("\n"),
      );
    });

    it.each([
      { name: "1ST" },
      { name: "RELEASE-CHANNEL" },
      { value: "" },
      { value: "two\nlines" },
      { repo: "../secrets" },
      { path: "x" },
    ])("refuses %o", (change) => {
      expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
    });
  });
});
