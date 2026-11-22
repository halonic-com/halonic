import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { CheckFact, ModelsFact } from "../check-facts.ts";
import { sentenceText } from "./check-line.ts";
import { checkLine } from "./check-lines.ts";

const demo = { about: "Halonic 0.1.0 · macOS arm64", demo: true };
const own = { ...demo, demo: false };

/** The line as the screen reader hears its parts: label, mark, each sentence, and the actions. */
function shown(fact: CheckFact, context = demo) {
  const line = checkLine(fact, context);
  return {
    label: line.label,
    mark: line.mark,
    sentences: line.sentences.map(sentenceText),
    actions: line.actions,
  };
}

const ollamaDown: ModelsFact = {
  check: "models",
  servers: {
    check: "models",
    status: "failed",
    ready: [],
    problems: [
      { problem: "unreachable", provider: "ollama", name: "Ollama", address: "localhost:11434" },
    ],
  },
  keys: [],
  sampleAnswers: false,
  tests: [],
};

verifies("check-computer.lines", () => {
  describe("the first run after a key with no credit", () => {
    it("crosses Models once, with its fix, Test again and Open Models", () => {
      expect(
        shown({
          check: "models",
          servers: undefined,
          keys: [{ provider: "Anthropic", keyStored: true }],
          sampleAnswers: false,
          tests: [
            { provider: "Anthropic", outcome: "no-credit", at: new Date(2026, 10, 19, 10, 42) },
          ],
        }),
      ).toEqual({
        label: "Models",
        mark: "problem",
        sentences: [
          "Anthropic accepted the key, but the account has no credit or is over its limit.",
          "Fix: add credit on Anthropic's site, then test again.",
        ],
        actions: ["test-again", "open-models"],
      });
    });

    it("lets Default model and Last run point at the Models line, as info", () => {
      const defaultModel = shown({
        check: "default-model",
        status: "failed",
        target: { uses: "provider", provider: "anthropic", name: "Anthropic", local: false },
        cause: "models.no-key",
      });
      const lastRun = shown({
        check: "last-run",
        status: "failed",
        runId: "r1",
        step: 2,
        steps: 3,
        stepName: "Write reply",
        durationMs: 6800,
        failure: { reason: "out-of-credit", provider: "Anthropic" },
        cause: "last-run.out-of-credit",
        causeShownOn: "models",
      });

      expect(defaultModel).toEqual({
        label: "Default model",
        mark: "info",
        sentences: [
          "The demo's default points at Anthropic.",
          "Not checked until the Models line above works.",
        ],
        actions: ["pick-model"],
      });
      expect(lastRun).toEqual({
        label: "Last run",
        mark: "info",
        sentences: ["Stopped at “Write reply” after 6.8 s, because of the Models line above."],
        actions: ["open-run"],
      });
    });

    it("says what stopped a run when no line above shows it", () => {
      const line = shown({
        check: "last-run",
        status: "failed",
        runId: "r1",
        step: 2,
        steps: 3,
        stepName: "Write reply",
        durationMs: 6800,
        failure: { reason: "out-of-credit", provider: "Anthropic" },
        cause: "last-run.out-of-credit",
      });

      expect(line.mark).toBe("problem");
      expect(line.sentences).toEqual([
        "Stopped at “Write reply” after 6.8 s: Anthropic said the key has no credit.",
      ]);
    });

    it("reads the demo as trusted, and the engine with Halonic's version", () => {
      expect(shown({ check: "workspace", status: "ok", name: "Acme", trust: "trusted" })).toEqual({
        label: "Workspace",
        mark: "pass",
        sentences: ["Acme demo · Studio can open it · Trusted."],
        actions: [],
      });
      expect(shown({ check: "engine", running: true }).sentences).toEqual([
        "Running · Halonic 0.1.0 · macOS arm64",
      ]);
    });
  });

  describe("the user's own workspace", () => {
    it("warns that it isn't trusted yet, on purpose, with Review", () => {
      expect(
        shown({ check: "workspace", status: "warning", name: "My workspace", trust: "new" }, own),
      ).toEqual({
        label: "Workspace",
        mark: "warning",
        sentences: [
          "My workspace isn't trusted yet.",
          "Halonic asks once, before the first run. This is on purpose.",
        ],
        actions: ["review-trust"],
      });
    });

    it("crosses a server that isn't answering, with its fix and three actions", () => {
      expect(shown(ollamaDown, own)).toEqual({
        label: "Models",
        mark: "problem",
        sentences: [
          "Ollama isn't answering at localhost:11434.",
          "Fix: start Ollama on this computer, then check again.",
        ],
        actions: ["test-again", "check-again", "open-models"],
      });
    });

    it("gives a server that answers its models and its last test", () => {
      const line = checkLine(
        {
          ...ollamaDown,
          servers: {
            check: "models",
            status: "ok",
            ready: [
              {
                provider: "ollama",
                name: "Ollama",
                answering: true,
                address: "localhost:11434",
                models: [{ name: "llama3.2" }],
              },
            ],
            problems: [],
          },
          tests: [{ provider: "Ollama", outcome: "ok", at: new Date(2026, 10, 19, 10, 42) }],
        },
        own,
      );

      expect(line.mark).toBe("pass");
      expect(line.sentences[0]?.parts).toEqual([
        "Ollama is answering at ",
        { code: "localhost:11434" },
        " · llama3.2 loaded",
        " · last test answered, 10:42",
      ]);
    });

    it("words Disk, and a check that ran over its time, as halonic doctor does", () => {
      const disk = shown({
        check: "disk",
        status: "ok",
        freeBytes: 51_539_607_552,
        data: { bytes: 1_503_238_553, runLogBytes: 1_181_116_006, complete: true },
        problem: null,
      });

      expect(disk.sentences).toEqual(["48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)"]);
      expect(shown({ check: "sandbox", status: "warning", timedOut: true })).toEqual({
        label: "Sandbox",
        mark: "warning",
        sentences: ["Didn't answer in 5 seconds"],
        actions: [],
      });
    });
  });

  it("names the Local only refusal, and Sample answers as info", () => {
    const localOnly = shown({
      check: "default-model",
      status: "failed",
      target: { uses: "provider", provider: "anthropic", name: "Anthropic", local: false },
      cause: "default-model.local-only",
    });
    const sample = shown({
      check: "default-model",
      status: "ok",
      target: { uses: "sample-answers" },
    });

    expect(localOnly.mark).toBe("problem");
    expect(localOnly.sentences).toEqual([
      "Points at Anthropic, but Local only is on for this workspace, so cloud models are refused.",
    ]);
    expect(sample).toEqual({
      label: "Default model",
      mark: "info",
      sentences: ["The demo's default uses Sample answers."],
      actions: [],
    });
  });

  it("shows a Google setup with its address, and what wasn't checked", () => {
    const google = shown(
      {
        check: "google",
        step: 4,
        steps: 7,
        startedAt: new Date(2026, 10, 8),
        email: "x@example.com",
      },
      own,
    );
    const notChecked = shown({ check: "not-checked", parts: ["sandbox", "harnesses"] });

    expect(google).toEqual({
      label: "Google",
      mark: "info",
      sentences: ["Setup for x@example.com is at step 4 of 7, started 8 Nov."],
      actions: ["continue-setup", "start-over"],
    });
    expect(notChecked.sentences).toEqual([
      "Not checked here: the sandbox and harnesses, because the demo doesn't use them.",
    ]);
  });
});
