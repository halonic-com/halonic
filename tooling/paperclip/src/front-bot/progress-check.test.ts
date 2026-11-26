import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { checkProgressNote } from "./progress-check.ts";
import type { ProgressInput } from "./progress-prompt.ts";
import type { SafeStep } from "./safe-steps.ts";

/** One recorded note example from `examples/progress-*.json`. */
export interface ProgressExample {
  readonly name: string;
  readonly message: string;
  readonly earlierNotes: readonly string[];
  readonly steps: readonly SafeStep[];
  readonly reply: string;
  readonly expect: "posted" | "rejected";
  readonly reason?: string;
}

/** The planted fake key, built here so no file holds a key-shaped string; examples name it `{{plantedKey}}`. */
const plantedKey = `sk-ant-api03-${"Q7x2Lm9K".repeat(4)}`;

function examples(name: string): ProgressExample[] {
  const url = new URL(`./examples/${name}.json`, import.meta.url);
  const text = readFileSync(url, "utf8").replaceAll("{{plantedKey}}", plantedKey);
  return (JSON.parse(text) as { cases: ProgressExample[] }).cases;
}

function inputOf(example: ProgressExample): ProgressInput {
  return {
    agentName: "Chief",
    message: example.message,
    earlierNotes: example.earlierNotes,
    steps: example.steps,
  };
}

verifies("paperclip.front-bot-progress-check", () => {
  describe("every approved note passes", () => {
    for (const example of examples("progress-voice")) {
      test(example.name, () => {
        expect(checkProgressNote(example.reply, inputOf(example))).toEqual({ ok: true });
      });
    }
  });

  describe("every must-fail note is rejected with its reason", () => {
    for (const example of examples("progress-must-fail")) {
      test(example.name, () => {
        expect(checkProgressNote(example.reply, inputOf(example))).toEqual({
          ok: false,
          reason: example.reason,
        });
      });
    }
  });

  test("a failed step backs 'failed' but not 'passed'", () => {
    const input: ProgressInput = {
      agentName: "Chief",
      message: "Why is main red?",
      earlierNotes: [],
      steps: [{ label: "Ran pnpm test", status: "failed" }],
    };
    expect(checkProgressNote("A test run failed.", input)).toEqual({ ok: true });
    expect(checkProgressNote("A test run passed.", input)).toEqual({
      ok: false,
      reason: "result_word",
    });
  });

  test("the agent's name counts as known", () => {
    const input: ProgressInput = {
      agentName: "Chief",
      message: "Why is main red?",
      earlierNotes: [],
      steps: [{ label: "Ran gh run", status: "running" }],
    };
    expect(checkProgressNote("Chief is looking at the main run.", input)).toEqual({ ok: true });
  });
});
