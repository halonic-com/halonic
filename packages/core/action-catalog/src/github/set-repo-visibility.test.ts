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
import { definition } from "./set-repo-visibility.ts";

const parameters = { owner: "acme", repo: "app", visibility: "public" };
const step = {
  definition: definition.id,
  version: 1,
  placeholders: { owner: "acme", repo: "app" },
};
const folder = join(import.meta.dirname, "..", "..", "fixtures", "github-set-repo-visibility");

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

verifies("action-catalog.github-set-repo-visibility", () => {
  describe("github.set-repo-visibility@1", () => {
    it("is irreversible, with a check that runs without the dialog and a guided change", () => {
      expect(definition.risk).toBe("irreversible");
      expect(routesOf(definition)).toMatchObject([
        { step: 1, kind: "call", method: "GET", risk: "routine", body: [] },
        { step: 2, kind: "guided", address: "https://github.com/{owner}/{repo}/settings" },
      ]);
    });

    it("reads today's visibility and previews what becomes public", async () => {
      const { sender, recorded } = await replay("read");
      const today = await sender.send({ ...step, step: 1 });
      expect(today).toEqual({ outcome: "answered", status: 200, kept: { visibility: "private" } });
      expect(definition.preview(parameters, { visibility: "private" })[1]).toBe(
        "acme/app is private today. After: public. Anyone on the internet can then see its code, its whole commit history, its issues, pull requests and releases, and fork it; making it private again doesn't take back what was public. Opens its settings on GitHub, where you change it and type acme/app to confirm.",
      );
      expect(sender.sent).toEqual(recorded);
    });

    it("says what making a repository private removes", () => {
      expect(definition.preview({ ...parameters, visibility: "private" })).toEqual([
        "Reads whether acme/app is public or private; it needs your GitHub sign-in to have the Administration permission there.",
        "Makes acme/app private. Only people with access can then see it: its stars and watchers are removed, and public forks stay public. Opens its settings on GitHub, where you change it and type acme/app to confirm.",
      ]);
    });

    it("gives a numbered manual guide on the settings page", () => {
      expect(manualGuideFor("github.set-repo-visibility@1", parameters, "Open-source acme")).toBe(
        [
          "`Open-source acme`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/settings",
          "2. Under **Danger Zone**, read **Change repository visibility**: it says whether the repository is public or private.",
          "3. Open https://github.com/acme/app/settings",
          "4. Under **Danger Zone**, click **Change visibility**, then **Change to `public`**.",
          "5. Read what GitHub says changes, type the repository name to confirm, and click the button below it.",
          "",
        ].join("\n"),
      );
    });

    it.each([
      { visibility: "internal" },
      { visibility: "Public" },
      { repo: "../secrets" },
      { path: "x" },
    ])("refuses %o", (change) => {
      expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
    });
  });
});
