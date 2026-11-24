import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { clarifyDescription } from "../thin-spec/clarify.ts";
import { fittedModel } from "../thin-spec/model.ts";
import { parseReading, readingInstruction, readingSchema } from "../thin-spec/reading.ts";
import { featureRow, usableModel } from "../thin-spec/score.ts";
import {
  anthropicKey,
  checkEvent,
  checkedTask,
  checkHarness,
  checkSwitchOn,
  paperclipKey,
  reading,
} from "./thin-spec-check.test-helper.ts";
import { dayLogKey } from "./thin-spec-check.ts";

const vague = reading(1);
const exact = reading(5);

function dayLog(saved: Map<string, unknown>) {
  return saved.get(JSON.stringify(dayLogKey("acme", "2026-11-23")));
}

verifies("paperclip.thin-spec-check", () => {
  describe("a flagged task", () => {
    test("asks Haiku once with the trial's prompt and schema", async () => {
      const { check, asked } = checkHarness(checkedTask(), [vague]);
      await check.onIssueEvent(checkEvent("issue.created"));
      expect(asked).toHaveLength(1);
      const body = asked[0]?.body as {
        model: string;
        messages: { content: string }[];
        output_config: unknown;
      };
      expect(body.model).toBe("claude-haiku-5-5");
      expect(body.output_config).toEqual({
        effort: "low",
        format: { type: "json_schema", schema: readingSchema },
      });
      expect(body.messages[0]?.content).toContain(readingInstruction);
      expect(body.messages[0]?.content).toContain(
        "<task>\nMake the export faster\n\nIt is slow.\n</task>",
      );
      expect(asked[0]?.headers).toMatchObject({ "x-api-key": anthropicKey });
    });

    test("gets a clarify task for its creator and waits for it", async () => {
      const { check, sent, logs } = checkHarness(checkedTask(), [vague]);
      await check.onIssueEvent(checkEvent());
      expect(sent).toEqual([
        { method: "GET", path: "/api/issues/task-1", body: undefined },
        {
          method: "POST",
          path: "/api/companies/acme/issues",
          body: {
            parentId: "task-1",
            title: "Clarify acceptance criteria: HAL-1 Make the export faster",
            description: clarifyDescription({ identifier: "HAL-1" }, 0.8808),
            assigneeAgentId: "agent-chief",
            projectId: "project-studio",
            goalId: "goal-1",
            status: "todo",
          },
        },
        {
          method: "PATCH",
          path: "/api/issues/task-1",
          body: { status: "blocked", blockedByIssueIds: ["clarify-1"] },
        },
      ]);
      expect(logs).toEqual([
        { level: "info", line: "Thin-spec check: HAL-1 flagged, score 0.88." },
      ]);
    });

    test("keeps the blockers the task already had", async () => {
      const { check, sent } = checkHarness(checkedTask(), [vague], { blockedBy: ["task-7"] });
      await check.onIssueEvent(checkEvent());
      expect(sent.at(-1)?.body).toEqual({
        status: "blocked",
        blockedByIssueIds: ["task-7", "clarify-1"],
      });
    });

    test("goes to the board's clarifier when a person created it", async () => {
      const { check, sent } = checkHarness(checkedTask({ createdByAgentId: null }), [vague]);
      await check.onIssueEvent(checkEvent());
      expect(sent[1]?.body).toMatchObject({ assigneeAgentId: "agent-pm" });
    });

    test("adds nothing when the writer started while Haiku was answering", async () => {
      const { check, sent, saved, written } = checkHarness(checkedTask(), [vague], {
        statusOnRead: "in_progress",
      });
      await check.onIssueEvent(checkEvent());
      expect(sent).toEqual([{ method: "GET", path: "/api/issues/task-1", body: undefined }]);
      expect(dayLog(saved)).toMatchObject([
        { identifier: "HAL-1", flagged: true, clarifyFailure: "writer_started" },
      ]);
      expect(written.some((metric) => metric.name === "thin_spec.failed")).toBe(false);
    });

    test("is logged without a clarify task when there is no clarifier", async () => {
      const settings = { ...checkSwitchOn, thinSpecClarifier: "" };
      const { check, sent, saved, written } = checkHarness(
        checkedTask({ createdByAgentId: null }),
        [vague],
        {
          settings,
        },
      );
      await check.onIssueEvent(checkEvent());
      expect(sent).toEqual([]);
      expect(dayLog(saved)).toMatchObject([
        { identifier: "HAL-1", flagged: true, clarifyFailure: "no_clarifier" },
      ]);
      expect(written).toContainEqual({
        name: "thin_spec.failed",
        value: 1,
        tags: { companyId: "acme", reason: "no_clarifier" },
      });
    });
  });

  describe("an unflagged task", () => {
    test("is left alone and logged", async () => {
      const { check, sent, saved, logs } = checkHarness(checkedTask(), [exact]);
      await check.onIssueEvent(checkEvent());
      expect(sent).toEqual([]);
      expect(dayLog(saved)).toEqual([
        {
          taskId: "task-1",
          identifier: "HAL-1",
          checkedAt: "2026-11-23T12:00:00.000Z",
          flagged: false,
          score: expect.any(Number),
        },
      ]);
      expect(logs).toEqual([{ level: "info", line: "Thin-spec check: HAL-1 clear, score 0.00." }]);
    });
  });

  describe("which tasks it checks", () => {
    test("checks a task once, however often it changes", async () => {
      const { check, asked } = checkHarness(checkedTask(), [exact, exact]);
      await check.onIssueEvent(checkEvent());
      await check.onIssueEvent(checkEvent());
      expect(asked).toHaveLength(1);
    });

    test.each([
      ["no D label", { labels: [{ id: "label-docs", name: "docs" }] }],
      ["no agent", { assigneeAgentId: null }],
      ["already started", { status: "in_progress" }],
      ["two days old", { createdAt: "2026-11-21T11:00:00Z" }],
      ["a clarify task", { title: "Clarify acceptance criteria: HAL-0 Something" }],
    ])("skips a task with %s", async (_name, changes) => {
      const { check, asked } = checkHarness(checkedTask(changes), [vague]);
      await check.onIssueEvent(checkEvent());
      expect(asked).toEqual([]);
    });

    test("is off when the switch names another version or no model is built in", async () => {
      const off = { ...checkSwitchOn, thinSpecCheckForVersion: "0.0.1" };
      for (const options of [{ settings: off }, { model: undefined }]) {
        const { check, asked, saved } = checkHarness(checkedTask(), [vague], options);
        await check.onIssueEvent(checkEvent());
        expect(asked).toEqual([]);
        expect(saved.size).toBe(0);
      }
    });
  });

  describe("failures", () => {
    test("asks again after a failed call, and logs no key or task text", async () => {
      const { check, asked, sent, logs, written } = checkHarness(checkedTask(), [500, vague]);
      await check.onIssueEvent(checkEvent());
      expect(sent).toEqual([]);
      await check.onIssueEvent(checkEvent());
      expect(asked).toHaveLength(2);
      expect(sent).toHaveLength(3);
      const told = JSON.stringify([logs, written]);
      for (const secret of [anthropicKey, paperclipKey, "It is slow."]) {
        expect(told).not.toContain(secret);
      }
    });

    test("treats an answer outside the schema as unreadable", () => {
      expect(parseReading("not json")).toBeUndefined();
      expect(parseReading(JSON.stringify({ spec_precision: 2 }))).toBeUndefined();
      expect(parseReading(vague)).toBeDefined();
    });
  });

  test("builds the trial's 25 features in its order", () => {
    const parsed = parseReading(reading(2));
    expect(parsed && featureRow(parsed)).toEqual([
      2,
      3,
      Math.log1p(2),
      Math.log1p(1),
      0,
      1,
      2,
      4,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
  });

  test("carries the exported model, which fits the feature row", () => {
    const parsed = parseReading(reading(2));
    expect(fittedModel && usableModel(fittedModel)).toBe(true);
    expect(parsed && featureRow(parsed).length).toBe(fittedModel?.weights.length);
  });
});
