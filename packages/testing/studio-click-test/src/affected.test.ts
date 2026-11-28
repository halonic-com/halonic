import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chooseSteps } from "./affected.ts";
import { requirementFiles } from "./requirement-files.ts";
import { resultsMarkdown } from "./results.ts";
import type { Step } from "./runner.ts";
import { clickTestSteps } from "./steps.ts";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const requirements = await requirementFiles(
  repo,
  clickTestSteps.flatMap((step) => step.requirements),
);

function idsRun(changed: readonly string[] | undefined): string[] {
  return chooseSteps(clickTestSteps, changed, requirements).run.map((step) => step.id);
}

const shortCheck = ["engine-answers"];
const cardSteps = [
  "card-yes-no",
  "card-plan",
  "card-one-question",
  "card-checkbox",
  "card-verdicts",
  "card-suggested-tasks",
];
const everyStep = clickTestSteps.map((step) => step.id);

verifies("studio-click-test.affected-steps", () => {
  describe("chooseSteps on the real steps and requirement files", () => {
    it("runs the short check and the Messenger steps for a change only to Messenger", () => {
      const changed = ["packages/studio/features/messenger/src/view.tsx"];
      // Sending a message needs a connected Paperclip, so Connect Paperclip runs too.
      const run = [
        ...shortCheck,
        "messenger-empty",
        "connect-paperclip",
        "messenger-send",
        ...cardSteps,
      ];
      expect(idsRun(changed)).toEqual(run);
      // Every other step is named as left out, whatever steps main has added since.
      expect(
        chooseSteps(clickTestSteps, changed, requirements).notAffected.map((step) => step.id),
      ).toEqual(everyStep.filter((id) => !run.includes(id)));
    });

    it("runs only the short check for a change that touches no covered requirement", () => {
      expect(idsRun(["docs/guides/checks.md", "packages/core/engine/src/index.ts"])).toEqual(
        shortCheck,
      );
      expect(idsRun([])).toEqual(shortCheck);
    });

    // The card steps run nightly, and on a build only for the code their cards go through
    // (Liam on HAL-19002).
    it("runs the card steps for a change to the Inbox or the Paperclip provider, not to Settings", () => {
      const needs = [...shortCheck, "connect-paperclip"];
      expect(idsRun(["packages/studio/features/inbox/src/ui/agent-item-card.tsx"])).toEqual([
        ...needs,
        "inbox-answer",
        ...cardSteps,
        "places-open",
        "wait-card",
      ]);
      expect(idsRun(["packages/adapters/paperclip-client/src/cards.ts"])).toEqual(
        expect.arrayContaining([...needs, "card-one-question"]),
      );
      expect(idsRun(["packages/studio/features/settings/src/feature.ts"])).not.toEqual(
        expect.arrayContaining(["card-yes-no"]),
      );
    });

    it("runs a step whose requirement file changed", () => {
      expect(idsRun(["packages/studio/services/requirements/paperclip-restore.md"])).toEqual([
        ...shortCheck,
        "connect-paperclip",
        // The restart's requirement lives in the same package as one of Connect Paperclip's; Disconnect's is the shell's.
        "restart-keeps-sign-in",
      ]);
    });

    it("runs a step whose own step file changed, and only that one", () => {
      const step = "packages/testing/studio-click-test/src/steps/messenger-empty.ts";
      expect(idsRun([step])).toEqual([...shortCheck, "messenger-empty"]);
    });

    it("runs every step when the rest of the suite, its workflow or nothing is known", () => {
      expect(idsRun(["packages/testing/studio-click-test/src/screen.ts"])).toEqual(everyStep);
      expect(idsRun([".github/workflows/studio-preview.yml"])).toEqual(everyStep);
      expect(idsRun(undefined)).toEqual(everyStep);
    });

    it("leaves the suite's tests and README out of it", () => {
      expect(
        idsRun([
          "packages/testing/studio-click-test/src/steps.test.ts",
          "packages/testing/studio-click-test/README.md",
        ]),
      ).toEqual(shortCheck);
    });
  });

  describe("chooseSteps on made-up steps", () => {
    const step = (id: string, requirement: string, needs?: string[]): Step => ({
      id,
      title: `Step ${id}`,
      requirements: [requirement],
      ...(needs === undefined ? {} : { needs }),
      run: async () => ({ passed: true }),
    });
    const files = new Map([
      ["acme.a", { path: "packages/acme/a/requirements/a.md", status: "active" }],
      ["acme.b", { path: "packages/acme/b/requirements/b.md", status: "active" }],
      ["acme.c", { path: "packages/acme/c/requirements/c.md", status: "active" }],
    ]);
    const steps = [step("a", "acme.a"), step("b", "acme.b", ["a"]), step("c", "acme.c", ["b"])];

    it("runs the steps a touched step needs, down the whole chain", () => {
      const choice = chooseSteps(steps, ["packages/acme/c/src/c.ts"], files);
      expect(choice.run.map((chosen) => chosen.id)).toEqual(["a", "b", "c"]);
    });

    it("doesn't take a sibling folder whose name starts the same for the requirement's", () => {
      const choice = chooseSteps(steps, ["packages/acme/a-other/src/x.ts"], files);
      expect(choice.run).toEqual([]);
    });

    it("runs a step whose requirement has no file, rather than leave it out", () => {
      const choice = chooseSteps([step("d", "acme.missing")], ["anything/else.ts"], files);
      expect(choice.run.map((chosen) => chosen.id)).toEqual(["d"]);
    });
  });

  describe("the results table", () => {
    const row = {
      number: 1,
      id: "engine-answers",
      title: "The engine answers",
      requirements: ["shell.welcome-start"],
      verdict: "passed" as const,
    };

    it("names the steps the change didn't touch", () => {
      const table = resultsMarkdown([row], "abc1234", {
        since: "9115b95",
        steps: [{ id: "connect-paperclip", title: "Connect Paperclip" }],
      });
      expect(table).toContain(
        "Ran the short check and the steps this change touched since `9115b95`. Not touched, so not run: Connect Paperclip (`connect-paperclip`).",
      );
    });

    it("says every step ran when the change touched them all, and nothing on a full run", () => {
      const table = resultsMarkdown([row], "abc1234", { since: "9115b95", steps: [] });
      expect(table).toContain("touched since `9115b95`: every step.");
      expect(resultsMarkdown([row], "abc1234")).not.toContain("Ran the short check");
    });
  });
});
