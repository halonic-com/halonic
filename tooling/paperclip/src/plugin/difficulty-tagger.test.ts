import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { taggerPrompt } from "../difficulty-tagger/prompt.ts";
import {
  anthropicKey,
  modelReply,
  paperclipKey,
  taggerHarness,
  taggerOn,
  taggerTask,
} from "./difficulty-tagger.test-helper.ts";
import { taskEvent } from "./task-effort.test-helper.ts";

const d4OpusAnswer = '{"kind": "code", "difficulty": "D4", "opus_only": true}';

verifies("paperclip.difficulty-tagger-writes", () => {
  describe("tagging a new task", () => {
    test("asks Haiku with the board's prompt, thinking off, and labels the task", async () => {
      const { tagger, asked, labelReads, updates, logs, written, labels } = taggerHarness(
        taggerTask(),
      );
      await tagger.onIssueEvent(taskEvent("issue.created"));
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
            thinking: { type: "disabled" },
            system: taggerPrompt,
            messages: [
              {
                role: "user",
                content:
                  "Fix the typo in the CLI help\n\nIn apps/cli/src/help.ts, 'recieve' should read 'receive'.",
              },
            ],
          },
        },
      ]);
      expect(labelReads).toEqual([
        {
          url: "http://paperclip.test:3100/api/companies/acme/labels",
          headers: { authorization: `Bearer ${paperclipKey}` },
        },
      ]);
      expect(updates).toEqual([{ labelIds: ["label-d1"] }]);
      expect(labels()).toEqual(["D1"]);
      expect(logs).toEqual([{ level: "info", line: "Difficulty tagger: labelled HAL-1 D1." }]);
      expect(written).toEqual([
        { name: "difficulty_tagger.set", value: 1, tags: { companyId: "acme", kind: "code" } },
      ]);
    });

    test("only logs while the switch is off or names another version", async () => {
      for (const version of [undefined, "0.0.1"]) {
        const settings = { ...taggerOn, difficultyTaggerWritesForVersion: version };
        const { tagger, updates, logs, written } = taggerHarness(taggerTask(), settings);
        await tagger.onIssueEvent(taskEvent("issue.created"));
        expect(updates).toEqual([]);
        expect(logs).toEqual([
          { level: "info", line: "Difficulty tagger: would label HAL-1 D1 (switch off)." },
        ]);
        expect(written.map((metric) => metric.name)).toEqual(["difficulty_tagger.logged"]);
      }
    });

    test("sends nothing without the Anthropic key, or for a done task", async () => {
      const { anthropicApiKey: _key, ...keyless } = taggerOn;
      const first = taggerHarness(taggerTask(), keyless);
      await first.tagger.onIssueEvent(taskEvent("issue.created"));
      const second = taggerHarness(taggerTask([], { status: "done" }));
      await second.tagger.onIssueEvent(taskEvent("issue.updated"));
      expect([...first.asked, ...second.asked]).toEqual([]);
    });
  });

  describe("changes after the first tag", () => {
    test("doesn't ask again for its own change, a status change or the same text", async () => {
      const task = taggerTask();
      const { tagger, asked } = taggerHarness(task);
      await tagger.onIssueEvent(taskEvent("issue.created"));
      await tagger.onIssueEvent(taskEvent("issue.updated"));
      task.status = "in_progress";
      await tagger.onIssueEvent(taskEvent("issue.updated"));
      expect(asked).toHaveLength(1);
    });

    test("asks again when the description changes and swaps only its own labels", async () => {
      const task = taggerTask(["studio"]);
      const reply = {
        body: modelReply('{"kind": "code", "difficulty": "D1", "opus_only": false}'),
      };
      const { tagger, asked, labels } = taggerHarness(task, taggerOn, reply);
      await tagger.onIssueEvent(taskEvent("issue.created"));
      expect(labels()).toEqual(["studio", "D1"]);
      reply.body = modelReply(d4OpusAnswer);
      task.description = "Rewrite the sandbox's network fence for all three systems.";
      await tagger.onIssueEvent(taskEvent("issue.updated"));
      expect(asked).toHaveLength(2);
      expect(labels()).toEqual(["studio", "D4", "opus-only"]);
    });

    test("tags the tasks it only logged once the board turns the switch on", async () => {
      const task = taggerTask();
      const settings: Record<string, unknown> = {
        ...taggerOn,
        difficultyTaggerWritesForVersion: undefined,
      };
      const { tagger, asked, labels } = taggerHarness(task, settings);
      await tagger.onIssueEvent(taskEvent("issue.created"));
      settings["difficultyTaggerWritesForVersion"] = taggerOn.difficultyTaggerWritesForVersion;
      await tagger.onIssueEvent(taskEvent("issue.updated"));
      expect(asked).toHaveLength(2);
      expect(labels()).toEqual(["D1"]);
    });
  });

  describe("failures", () => {
    test("logs Anthropic's error, saves no record and asks again on the next change", async () => {
      const { tagger, asked, logs, written, saved } = taggerHarness(taggerTask(), taggerOn, {
        status: 429,
      });
      await tagger.onIssueEvent(taskEvent("issue.created"));
      expect(logs).toEqual([
        { level: "error", line: "Difficulty tagger: couldn't tag HAL-1 (http_429)." },
      ]);
      expect(written).toEqual([
        {
          name: "difficulty_tagger.failed",
          value: 1,
          tags: { companyId: "acme", reason: "http_429" },
        },
      ]);
      expect(saved.size).toBe(0);
      await tagger.onIssueEvent(taskEvent("issue.updated"));
      expect(asked).toHaveLength(2);
    });

    test("treats a refusal, a cut-off answer and a non-answer as failures", async () => {
      const cases = [
        { body: modelReply("", "refusal"), reason: "refusal" },
        { body: modelReply('{"kind": "code"', "max_tokens"), reason: "max_tokens" },
        { body: modelReply("I think this is D2."), reason: "no_answer" },
      ];
      for (const { body, reason } of cases) {
        const { tagger, updates, written } = taggerHarness(taggerTask(), taggerOn, { body });
        await tagger.onIssueEvent(taskEvent("issue.created"));
        expect(updates).toEqual([]);
        expect(written.map((metric) => metric.tags)).toEqual([{ companyId: "acme", reason }]);
      }
    });

    test("never puts task text, model text or a key in its log, metrics or record", async () => {
      const { tagger, logs, written, saved } = taggerHarness(taggerTask());
      await tagger.onIssueEvent(taskEvent("issue.created"));
      const everything = JSON.stringify([logs, written, [...saved.values()]]);
      for (const secret of [anthropicKey, paperclipKey, "typo", "recieve", "haiku", "direct"]) {
        expect(everything).not.toContain(secret);
      }
    });
  });
});

verifies("paperclip.difficulty-tagger-labels", () => {
  test("leaves a task alone that someone labelled by hand", async () => {
    const task = taggerTask(["D2"]);
    const { tagger, asked, updates } = taggerHarness(task);
    await tagger.onIssueEvent(taskEvent("issue.created"));
    task.description = "Now also covers the Studio screen.";
    await tagger.onIssueEvent(taskEvent("issue.updated"));
    expect(asked).toEqual([]);
    expect(updates).toEqual([]);
  });

  test("stops at a hand label set while the model answered", async () => {
    const task = taggerTask();
    // The hand label lands while the model answers, between the first read and the write.
    const onAsk = () => {
      task.labels = [{ id: "label-d3", name: "D3" }];
    };
    const { tagger, asked, updates, labels } = taggerHarness(task, taggerOn, {
      body: modelReply('{"kind": "code", "difficulty": "D1", "opus_only": false}'),
      onAsk,
    });
    await tagger.onIssueEvent(taskEvent("issue.created"));
    expect(asked).toHaveLength(1);
    expect(updates).toEqual([]);
    expect(labels()).toEqual(["D3"]);
  });
});
