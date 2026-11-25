import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fakeStudio } from "./fake-studio.test-helper.ts";
import { requirementFiles } from "./requirement-files.ts";
import { resultsMarkdown } from "./results.ts";
import { runSteps } from "./runner.ts";
import { clickTestSteps } from "./steps.ts";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));

verifies("studio-click-test.step-requirements", () => {
  describe("each step's requirements", () => {
    it.each(clickTestSteps)("$id names at least one requirement", (step) => {
      expect(step.requirements.length).toBeGreaterThan(0);
    });

    it("are requirement files in the repo that aren't retired", async () => {
      const ids = clickTestSteps.flatMap((step) => step.requirements);
      const files = await requirementFiles(repo, ids);
      const missing = ids.filter((id) => !files.has(id));
      const retired = ids.filter((id) => files.get(id)?.status === "retired");
      expect({ missing, retired }).toEqual({ missing: [], retired: [] });
    });
  });

  it("the results table shows them in a Requirements column, whatever the verdict", async () => {
    const results = await runSteps(
      [
        {
          id: "a",
          title: "Step a",
          requirements: ["messenger.not-connected", "studio.focused-app-window"],
          run: async () => ({ passed: false, code: "LIST_FAILED", note: "" }),
        },
        {
          id: "b",
          title: "Step b",
          requirements: ["connections.connection-row"],
          needs: ["a"],
          run: async () => ({ passed: true }),
        },
      ],
      fakeStudio().context,
      async () => undefined,
      async () => fakeStudio().context,
    );
    const table = resultsMarkdown(results, "main");
    expect(table).toContain("| # | Step | Requirements | Verdict |");
    expect(table).toContain(
      "| 1 | Step a | messenger.not-connected, studio.focused-app-window | ❌ failed |",
    );
    expect(table).toContain("| 2 | Step b | connections.connection-row | ⏭ skipped |");
  });
});
