import { glob, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fakeStudio } from "./fake-studio.test-helper.ts";
import { resultsMarkdown } from "./results.ts";
import { runSteps } from "./runner.ts";
import { clickTestSteps } from "./steps.ts";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));

/** The status of every requirement file whose name ends one of the ids, by its id. */
async function requirementStatuses(ids: readonly string[]): Promise<Map<string, string>> {
  // An id ends with its file's name, so only those files need reading.
  const names = new Set(ids.map((id) => `${id.split(".").at(-1)}.md`));
  const statuses = new Map<string, string>();
  const files = glob("**/requirements/*.md", {
    cwd: repo,
    exclude: (path) => basename(path) === "node_modules" || basename(path) === ".git",
  });
  for await (const file of files) {
    if (!names.has(basename(file))) continue;
    const text = await readFile(`${repo}${file}`, "utf8");
    const id = /^# (\S+)/.exec(text)?.[1];
    const status = /^- Status: (\S+)/m.exec(text)?.[1];
    if (id !== undefined) statuses.set(id, status ?? "unknown");
  }
  return statuses;
}

verifies("studio-click-test.step-requirements", () => {
  describe("each step's requirements", () => {
    it.each(clickTestSteps)("$id names at least one requirement", (step) => {
      expect(step.requirements.length).toBeGreaterThan(0);
    });

    it("are requirement files in the repo that aren't retired", async () => {
      const ids = clickTestSteps.flatMap((step) => step.requirements);
      const statuses = await requirementStatuses(ids);
      const missing = ids.filter((id) => !statuses.has(id));
      const retired = ids.filter((id) => statuses.get(id) === "retired");
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
