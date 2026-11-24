import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { clarifyDescription } from "../thin-spec/clarify.ts";
import { doneWhenComment, doneWhenMissing, specTemplateLink } from "../thin-spec/done-when.ts";
import { checkEvent, checkedTask, checkHarness, reading } from "./thin-spec-check.test-helper.ts";
import { dayLogKey } from "./thin-spec-check.ts";

const vague = reading(1);
const exact = reading(5);

verifies("paperclip.done-when-lint", () => {
  describe("the detector", () => {
    test.each([
      ["no Done when line", "Make the export faster. It is slow."],
      ["a Done when line that names nothing checkable", "Fix it.\n\nDone when: works"],
      ["an empty Done when heading", "Fix it.\n\n## Done when\n\nScope: export."],
    ])("flags %s", (_name, description) => {
      expect(doneWhenMissing(description)).toBe(true);
    });

    test("flags a task without a description", () => {
      expect(doneWhenMissing(null)).toBe(true);
    });

    test.each([
      ["a test path", "Done when: src/export.test.ts passes."],
      ["a spec path", "**Done when:** flow.spec.tsx is green in CI."],
      ["a named test", 'Done when: the test "exports twice" passes.'],
      ["a backticked command", "Done when: `pnpm check` passes on main."],
      ["what the user sees", "Done when: the user sees the export finish in 2 s."],
      ["what the CLI prints", "Done when: halonic run prints the run id and exits 0."],
      ["a Done when heading", "## Done when\n\nThe screen shows the new label."],
    ])("passes %s", (_name, description) => {
      expect(doneWhenMissing(`Fix the export.\n\n${description}`)).toBe(false);
    });

    test("comments in one sentence with the template link", () => {
      expect(doneWhenComment()).toContain(specTemplateLink);
      expect(doneWhenComment().split(". ")).toHaveLength(1);
    });
  });

  describe("in the thin-spec check", () => {
    const noDoneWhen = checkedTask({ description: "It is slow." });

    test("comments, adds the clarify task and logs doneWhenMissing on a clear score", async () => {
      const { check, sent, saved, logs } = checkHarness(noDoneWhen, [exact]);
      await check.onIssueEvent(checkEvent());
      expect(sent[0]).toEqual({
        method: "POST",
        path: "/api/issues/task-1/comments",
        body: { body: doneWhenComment() },
      });
      expect(sent[2]?.body).toMatchObject({
        description: clarifyDescription({ identifier: "HAL-1" }, { doneWhenMissing: true }),
      });
      const log = saved.get(JSON.stringify(dayLogKey("acme", "2026-11-23")));
      expect(log).toMatchObject([
        { flagged: false, doneWhenMissing: true, clarifyId: "clarify-1" },
      ]);
      expect(logs).toEqual([
        {
          level: "info",
          line: "Thin-spec check: HAL-1 clear, score 0.00, no checkable Done when.",
        },
      ]);
    });

    test("adds only one clarify task when the score flags it too", async () => {
      const { check, sent } = checkHarness(noDoneWhen, [vague]);
      await check.onIssueEvent(checkEvent());
      const created = sent.filter((request) => request.path === "/api/companies/acme/issues");
      expect(created).toHaveLength(1);
      expect(created[0]?.body).toMatchObject({
        description: clarifyDescription(
          { identifier: "HAL-1" },
          { score: 0.8808, doneWhenMissing: true },
        ),
      });
    });

    test("leaves a task with a checkable Done when line and a clear score alone", async () => {
      const { check, sent } = checkHarness(checkedTask(), [exact]);
      await check.onIssueEvent(checkEvent());
      expect(sent).toEqual([]);
    });
  });
});
