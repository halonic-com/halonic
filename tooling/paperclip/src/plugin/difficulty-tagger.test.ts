import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { parseTaggerAnswer, taggerInput, taggerPrompt } from "../difficulty-tagger/prompt.ts";
import {
  answer,
  anthropicKey,
  tagEvent,
  taggedTask,
  taggerHarness,
} from "./difficulty-tagger.test-helper.ts";

verifies("paperclip.difficulty-tagger", () => {
  describe("labelling a task", () => {
    test("asks Haiku once with the board's prompt and labels a new code task", async () => {
      const task = taggedTask([]);
      const { tagger, asked, labels, logs } = taggerHarness(task, [answer("code", "D1", false)]);
      await tagger.onIssueEvent(tagEvent("issue.created"));
      expect(asked).toEqual([
        {
          url: "https://api.anthropic.com/v1/messages",
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: {
            model: "claude-haiku-5-5",
            max_tokens: 400,
            output_config: { effort: "low" },
            system: taggerPrompt,
            messages: [{ role: "user", content: taggerInput(task.title, task.description) }],
          },
        },
      ]);
      expect(labels()).toEqual(["D1"]);
      expect(logs).toEqual([{ level: "info", line: "Difficulty tagger: labelled HAL-1 D1." }]);
    });

    test("adds opus-only and keeps the task's other labels", async () => {
      const { tagger, labels } = taggerHarness(taggedTask(["studio"]), [
        answer("code", "D3", true),
      ]);
      await tagger.onIssueEvent(tagEvent("issue.created"));
      expect(labels()).toEqual(["studio", "D3", "opus-only"]);
    });

    test("reads only the first 4,000 characters of the description", () => {
      const input = taggerInput("A title", "x".repeat(5000));
      expect(input).toBe(`Title: A title\n\nDescription:\n${"x".repeat(4000)}`);
    });

    test("writes no label on work that isn't code, even with opus_only", async () => {
      const { tagger, labels, written } = taggerHarness(taggedTask([]), [
        answer("review", "D2", true),
      ]);
      await tagger.onIssueEvent(tagEvent("issue.created"));
      expect(labels()).toEqual([]);
      expect(written.map((metric) => metric.name)).toEqual(["difficulty_tagger.spend_micro_usd"]);
    });

    test("leaves Chief's label alone and makes no call", async () => {
      const { tagger, asked, labels } = taggerHarness(taggedTask(["d2"]), [
        answer("code", "D4", false),
      ]);
      await tagger.onIssueEvent(tagEvent());
      expect(asked).toEqual([]);
      expect(labels()).toEqual(["d2"]);
    });

    test("hands the task over once someone changes or removes its label", async () => {
      for (const changedTo of [["D4"], []]) {
        const task = taggedTask([]);
        const { tagger, asked, labels } = taggerHarness(task, [
          answer("code", "D1", false),
          answer("code", "D2", false),
        ]);
        await tagger.onIssueEvent(tagEvent("issue.created"));
        task.labels = changedTo.map((name) => ({ id: `label-${name}`, name }));
        task.title = "Fix the typo in the CLI help and the README";
        await tagger.onIssueEvent(tagEvent());
        expect(asked).toHaveLength(1);
        expect(labels()).toEqual(changedTo);
      }
    });

    test("stops at a hand label set while Haiku answered", async () => {
      const task = taggedTask([]);
      const handLabel = () => {
        task.labels = [{ id: "label-D3", name: "D3" }];
      };
      const { tagger, labels, logs } = taggerHarness(task, [
        { ...answer("code", "D1", false), meanwhile: handLabel },
      ]);
      await tagger.onIssueEvent(tagEvent("issue.created"));
      expect(labels()).toEqual(["D3"]);
      expect(logs).toEqual([]);
    });

    test("relabels its own label when the description changes", async () => {
      const task = taggedTask([]);
      const { tagger, labels } = taggerHarness(task, [
        answer("code", "D2", false),
        answer("code", "D4", false),
      ]);
      await tagger.onIssueEvent(tagEvent("issue.created"));
      task.description = "Rewrite the run scheduler to run steps in parallel.";
      await tagger.onIssueEvent(tagEvent());
      expect(labels()).toEqual(["D4"]);
    });

    test("makes no call when the title and description are what it read last", async () => {
      const { tagger, asked } = taggerHarness(taggedTask([]), [answer("code", "D2", false)]);
      await tagger.onIssueEvent(tagEvent("issue.created"));
      await tagger.onIssueEvent(tagEvent());
      await tagger.onIssueEvent(tagEvent());
      expect(asked).toHaveLength(1);
    });

    test("does nothing while the switch is empty or names another version", async () => {
      for (const version of ["", "0.0.1"]) {
        const settings = { difficultyTaggerForVersion: version };
        const { tagger, asked, written } = taggerHarness(taggedTask([]), [], settings);
        await tagger.onIssueEvent(tagEvent("issue.created"));
        expect(asked).toEqual([]);
        expect(written).toEqual([]);
      }
    });

    test("writes nothing for an answer that isn't the prompt's JSON", async () => {
      const { tagger, labels, logs } = taggerHarness(taggedTask([]), [{ text: "D2, I think." }]);
      await tagger.onIssueEvent(tagEvent("issue.created"));
      expect(labels()).toEqual([]);
      expect(logs[0]?.line).toContain("wasn't the JSON the prompt asks for");
      expect(
        parseTaggerAnswer('{"kind":"code","difficulty":"D9","opus_only":false}'),
      ).toBeUndefined();
    });

    test("reads the learned prompt's answer, which names no model (HAL-16990)", () => {
      expect(taggerPrompt).not.toContain('"model"');
      expect(taggerPrompt).toContain('"migration": true|false');
      expect(
        parseTaggerAnswer(
          '{"kind":"code","difficulty":"D3","opus_only":true,"security":true,"migration":false,"specified":true}',
        ),
      ).toEqual({ kind: "code", difficulty: "D3", opusOnly: true });
    });

    test("asks again after a label it couldn't write, without handing the task over", async () => {
      const task = taggedTask([]);
      const { tagger, labels, logs, listedLabels } = taggerHarness(task, [
        answer("code", "D2", false),
        answer("code", "D2", false),
      ]);
      const d2 = listedLabels.findIndex((label) => label.name === "D2");
      const [missing] = listedLabels.splice(d2, 1);
      await tagger.onIssueEvent(tagEvent("issue.created"));
      expect(labels()).toEqual([]);
      expect(logs[0]?.line).toBe("Difficulty tagger: couldn't label HAL-1, no company label D2.");
      listedLabels.push(missing as (typeof listedLabels)[number]);
      await tagger.onIssueEvent(tagEvent());
      expect(labels()).toEqual(["D2"]);
    });

    test("asks again after a refused call, without the task's text changing", async () => {
      const task = taggedTask([]);
      const { tagger, labels, asked } = taggerHarness(task, [
        { status: 500 },
        answer("code", "D2", false),
      ]);
      await tagger.onIssueEvent(tagEvent("issue.created"));
      expect(labels()).toEqual([]);
      await tagger.onIssueEvent(tagEvent());
      expect(asked).toHaveLength(2);
      expect(labels()).toEqual(["D2"]);
    });

    test("logs a refused call by its status, without the key or the task's text", async () => {
      const task = taggedTask([]);
      const { tagger, logs, written } = taggerHarness(task, [{ status: 401 }]);
      await tagger.onIssueEvent(tagEvent("issue.created"));
      expect(logs).toEqual([
        { level: "error", line: "Difficulty tagger: couldn't ask about HAL-1 (http_401)." },
      ]);
      expect(written).toEqual([
        {
          name: "difficulty_tagger.failed",
          value: 1,
          tags: { companyId: "acme", reason: "http_401" },
        },
      ]);
      const reported = JSON.stringify({ logs, written });
      expect(reported).not.toContain(anthropicKey);
      expect(reported).not.toContain(task.title);
    });
  });
});
