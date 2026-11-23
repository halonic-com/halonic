import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { taggerPrompt } from "../task-tagger/verdict.ts";
import {
  anthropicKey,
  codeVerdict,
  haikuSays,
  paperclipKey,
  tagEvent,
  taggedTask,
  taggerHarness,
  taggerOn,
} from "./task-tagger.test-helper.ts";

verifies("paperclip.task-tagger", () => {
  describe("tagging a task's difficulty", () => {
    test("asks Haiku about a new task and puts the D2 label on it", async () => {
      const task = taggedTask(["docs"]);
      const harness = taggerHarness(task);
      harness.answers.push(haikuSays(codeVerdict("D2")));
      await harness.tagger.onIssueEvent(tagEvent("issue.created"));
      const [call] = harness.haikuCalls();
      expect(call).toEqual({
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: {
          model: "claude-haiku-5-5",
          max_tokens: 400,
          thinking: { type: "disabled" },
          system: taggerPrompt,
          messages: [
            { role: "user", content: `Title: ${task.title}\n\nDescription:\n${task.description}` },
          ],
        },
      });
      expect(harness.labels()).toEqual(["docs", "D2"]);
      expect(harness.logs).toEqual([{ level: "info", line: "Task tagger: HAL-1 is code, D2." }]);
      expect(harness.written.map((metric) => metric.name)).toEqual(["task_tagger.tagged"]);
    });

    test("reads only the first 4,000 characters of the description", async () => {
      const task = { ...taggedTask(), description: "x".repeat(5000) };
      const harness = taggerHarness(task);
      harness.answers.push(haikuSays(codeVerdict("D1")));
      await harness.tagger.onIssueEvent(tagEvent("issue.created"));
      const body = harness.haikuCalls()[0]?.body as { messages: { content: string }[] };
      expect(body.messages[0]?.content).toBe(
        `Title: ${task.title}\n\nDescription:\n${"x".repeat(4000)}`,
      );
    });

    test("swaps its own labels when the description changes, and calls nothing for other changes", async () => {
      const task = taggedTask();
      const harness = taggerHarness(task);
      harness.answers.push(haikuSays(codeVerdict("D2")), haikuSays(codeVerdict("D4", true)));
      await harness.tagger.onIssueEvent(tagEvent("issue.created"));
      // Its own label write comes back as an update with the same text.
      await harness.tagger.onIssueEvent(tagEvent("issue.updated"));
      expect(harness.haikuCalls()).toHaveLength(1);
      task.description = "Also move the footer into its own component, with tests.";
      await harness.tagger.onIssueEvent(tagEvent("issue.updated"));
      expect(harness.haikuCalls()).toHaveLength(2);
      expect(harness.labels()).toEqual(["D4", "opus-only"]);
    });

    test("writes no label for work that isn't code, and takes its own off", async () => {
      const task = taggedTask();
      const harness = taggerHarness(task);
      harness.answers.push(
        haikuSays(codeVerdict("D3")),
        haikuSays(codeVerdict("D1", false, "review")),
      );
      await harness.tagger.onIssueEvent(tagEvent("issue.created"));
      expect(harness.labels()).toEqual(["D3"]);
      task.title = "Review the footer pull request";
      await harness.tagger.onIssueEvent(tagEvent("issue.updated"));
      expect(harness.labels()).toEqual([]);
      expect(harness.logs.at(-1)?.line).toBe("Task tagger: HAL-1 is review, no labels.");
    });

    test("leaves a task alone that has a difficulty label someone else set", async () => {
      for (const labels of [["D1"], ["opus-only"], ["D5"]]) {
        const harness = taggerHarness(taggedTask(labels));
        await harness.tagger.onIssueEvent(tagEvent("issue.created"));
        expect(harness.requests).toEqual([]);
        expect(harness.labels()).toEqual(labels);
      }
    });

    test("stops touching a task once someone replaces its label", async () => {
      const task = taggedTask();
      const harness = taggerHarness(task);
      harness.answers.push(haikuSays(codeVerdict("D2")));
      await harness.tagger.onIssueEvent(tagEvent("issue.created"));
      task.labels = [{ id: "label-D4", name: "D4" }];
      task.title = "Fix the footer link and the header";
      await harness.tagger.onIssueEvent(tagEvent("issue.updated"));
      task.title = "Fix the footer link, the header and the menu";
      await harness.tagger.onIssueEvent(tagEvent("issue.updated"));
      expect(harness.haikuCalls()).toHaveLength(1);
      expect(harness.labels()).toEqual(["D4"]);
    });

    test("calls nothing and resolves no secret while the switch is off", async () => {
      for (const version of [undefined, "0.0.1"]) {
        const settings = { ...taggerOn, taskTaggerWritesForVersion: version };
        const harness = taggerHarness(taggedTask(), settings);
        await harness.tagger.onIssueEvent(tagEvent("issue.created"));
        expect(harness.requests).toEqual([]);
        expect(harness.resolved).toEqual([]);
        expect(harness.logs).toEqual([]);
      }
      const { taggerAnthropicKey: _key, ...keyless } = taggerOn;
      const harness = taggerHarness(taggedTask(), keyless);
      await harness.tagger.onIssueEvent(tagEvent("issue.created"));
      expect(harness.requests).toEqual([]);
    });

    test("only keeps the baseline for a task it first sees on an update", async () => {
      const task = taggedTask();
      const harness = taggerHarness(task);
      harness.answers.push(haikuSays(codeVerdict("D3")));
      await harness.tagger.onIssueEvent(tagEvent("issue.updated"));
      expect(harness.requests).toEqual([]);
      task.description = "Rewrite the footer.";
      await harness.tagger.onIssueEvent(tagEvent("issue.updated"));
      expect(harness.labels()).toEqual(["D3"]);
    });

    test("logs a failed call by its code and tries again on the next event", async () => {
      const harness = taggerHarness(taggedTask());
      harness.answers.push({ status: 401, body: { error: { message: "invalid x-api-key" } } });
      harness.answers.push(haikuSays(codeVerdict("D2")));
      await harness.tagger.onIssueEvent(tagEvent("issue.created"));
      expect(harness.logs).toEqual([
        { level: "error", line: "Task tagger: couldn't ask Haiku for HAL-1 (http_401)." },
      ]);
      expect(harness.written).toEqual([
        { name: "task_tagger.failed", value: 1, tags: { companyId: "acme", reason: "http_401" } },
      ]);
      await harness.tagger.onIssueEvent(tagEvent("issue.updated"));
      expect(harness.labels()).toEqual(["D2"]);
    });

    test("doesn't ask again about text it couldn't read an answer for", async () => {
      const harness = taggerHarness(taggedTask());
      harness.answers.push(haikuSays("It looks like a small change."));
      await harness.tagger.onIssueEvent(tagEvent("issue.created"));
      await harness.tagger.onIssueEvent(tagEvent("issue.updated"));
      expect(harness.haikuCalls()).toHaveLength(1);
      expect(harness.logs).toEqual([
        {
          level: "error",
          line: "Task tagger: couldn't read Haiku's answer for HAL-1 (unreadable).",
        },
      ]);
    });

    test("puts no key and no task text in a log line, a metric or the task", async () => {
      const task = taggedTask();
      const harness = taggerHarness(task);
      harness.answers.push(haikuSays(codeVerdict("D2")), { status: 500, body: {} });
      await harness.tagger.onIssueEvent(tagEvent("issue.created"));
      task.title = "Fix the footer link again";
      await harness.tagger.onIssueEvent(tagEvent("issue.updated"));
      const seen = JSON.stringify([harness.logs, harness.written, [...harness.saved], task.labels]);
      for (const secret of [anthropicKey, paperclipKey, "footer"]) {
        expect(seen).not.toContain(secret);
      }
      const labelLookup = harness.requests.find((request) => request.url.endsWith("/labels"));
      expect(labelLookup?.url).toBe("http://paperclip.test:3100/api/companies/acme/labels");
      expect(labelLookup?.headers).toEqual({ authorization: `Bearer ${paperclipKey}` });
    });
  });
});
