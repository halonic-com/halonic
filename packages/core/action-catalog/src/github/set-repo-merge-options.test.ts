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
import { definition } from "./set-repo-merge-options.ts";

const parameters = {
  owner: "acme",
  repo: "app",
  allow_merge_commit: "off",
  allow_squash_merge: "on",
  allow_rebase_merge: "off",
  allow_auto_merge: "on",
};
const folder = join(import.meta.dirname, "..", "..", "fixtures", "github-set-repo-merge-options");

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

verifies("action-catalog.github-set-repo-merge-options", () => {
  describe("github.set-repo-merge-options@1", () => {
    it("reads today's merge settings and previews them before and after", async () => {
      const { sender, recorded } = await replay("read");
      const placeholders = { owner: "acme", repo: "app" };
      const today = await sender.send({
        definition: definition.id,
        version: 1,
        step: 1,
        placeholders,
      });
      const kept = {
        allow_merge_commit: true,
        allow_squash_merge: true,
        allow_rebase_merge: false,
        allow_auto_merge: false,
      };
      expect(today).toEqual({ outcome: "answered", status: 200, kept });
      expect(definition.preview(parameters, kept)[1]).toBe(
        "Today: merge commits on, squash merging on, rebase merging off, auto-merge off. After: merge commits off, squash merging on, rebase merging off, auto-merge on. Opens the settings of acme/app on GitHub, where you set them by hand.",
      );
      expect(sender.sent).toEqual(recorded);
    });

    it("without a reading, previews only the settings it asks for", () => {
      expect(definition.preview(parameters)[1]).toBe(
        "Opens the settings of acme/app on GitHub, where you set merge commits off, squash merging on, rebase merging off, auto-merge on by hand.",
      );
    });

    it("builds a check that runs without the dialog, then a guided step on github.com", () => {
      expect(definition.risk).toBe("admin");
      expect(routesOf(definition)).toMatchObject([
        { step: 1, kind: "call", method: "GET", risk: "routine", path: "/repos/{owner}/{repo}" },
        { step: 2, kind: "guided", address: "https://github.com/{owner}/{repo}/settings" },
      ]);
    });

    it("gives a numbered manual guide on the settings page", () => {
      expect(manualGuideFor("github.set-repo-merge-options@1", parameters, "Squash only")).toBe(
        [
          "`Squash only`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/settings",
          "2. Under **Pull Requests**, read whether **Allow merge commits**, **Allow squash merging**, **Allow rebase merging** and **Allow auto-merge** are ticked.",
          "3. Open https://github.com/acme/app/settings",
          "4. Under **Pull Requests**, turn **Allow merge commits** `off`, **Allow squash merging** `on` and **Allow rebase merging** `off`. GitHub keeps at least one of them on.",
          "5. Turn **Allow auto-merge** `on`.",
          "6. GitHub saves each box as you change it: check that it says the setting was saved.",
          "",
        ].join("\n"),
      );
    });

    it.each([
      { allow_auto_merge: "true" },
      { allow_merge_commit: true },
      { repo: "../secrets" },
      { path: "x" },
    ])("refuses %o", (change) => {
      expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
    });
  });
});
