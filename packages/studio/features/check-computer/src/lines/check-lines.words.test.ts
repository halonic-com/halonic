import type { LastRunLine, TestOutcome, WorkspaceLine } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { CheckFact, ModelsFact } from "../check-facts.ts";
import { sentenceText } from "./check-line.ts";
import { checkLine } from "./check-lines.ts";

const own = { about: "Halonic 0.1.0 · macOS arm64", demo: false };
const at = new Date(2026, 10, 19, 10, 42);

function sentences(fact: CheckFact): string[] {
  return checkLine(fact, own).sentences.map(sentenceText);
}

const anthropicKey: ModelsFact = {
  check: "models",
  servers: undefined,
  keys: [{ provider: "Anthropic", keyStored: true }],
  sampleAnswers: false,
  tests: [],
};

verifies("check-computer.lines", () => {
  describe("the Models line", () => {
    it.each<[TestOutcome, string]>([
      ["ok", "Anthropic: key set · last test accepted, 10:42"],
      ["key-refused", "Anthropic didn't accept the saved key."],
      ["offline", "Halonic can't reach Anthropic. Check your connection."],
      ["provider-error", "Anthropic isn't answering right now. Try again in a minute."],
      [
        "local-not-answering",
        "The model on this computer didn't answer. Check that Anthropic is running, then test again.",
      ],
      [
        "local-not-usable",
        "This model answered, but not in a form the workflow can use. It may be too small. Try a larger one, or use Sample answers.",
      ],
    ])("says what a last test that was %s found", (outcome, said) => {
      const fact = { ...anthropicKey, tests: [{ provider: "Anthropic", outcome, at }] };
      expect(sentences(fact)[0]).toBe(said);
    });

    it("says a key that isn't there, one that can't be read, and one not tested yet", () => {
      expect(
        sentences({
          ...anthropicKey,
          keys: [
            { provider: "Anthropic", keyStored: false },
            { provider: "OpenAI", keyStored: "unreadable" },
            { provider: "OpenRouter", keyStored: true },
          ],
        }),
      ).toEqual([
        "Anthropic: no key yet.",
        "Fix: add its key on the Models page.",
        "OpenAI: Halonic couldn't read its key from your system keychain.",
        "Fix: check that your system keychain is unlocked, then check again.",
        "OpenRouter: key set · not tested yet",
      ]);
    });

    it("says the host's own problems, and model servers that ran over their time", () => {
      expect(
        sentences({
          ...anthropicKey,
          keys: [],
          servers: {
            check: "models",
            status: "failed",
            ready: [{ provider: "openai", name: "OpenAI", keyStored: true }],
            problems: [
              { problem: "no-key", alias: "smart", provider: "anthropic", name: "Anthropic" },
              { problem: "key-unreadable", provider: "openai", name: "OpenAI", secret: "openai" },
              { problem: "no-alias", alias: "default" },
            ],
          },
        }),
      ).toEqual([
        "Anthropic: no key yet.",
        "Fix: add its key on the Models page.",
        "OpenAI: Halonic couldn't read its key from your system keychain.",
        "Fix: check that your system keychain is unlocked, then check again.",
        "The model alias default isn't in the workspace's files.",
        "OpenAI: key set",
      ]);
      expect(
        sentences({
          ...anthropicKey,
          keys: [],
          servers: { check: "models", status: "warning", timedOut: true },
        }),
      ).toEqual(["The model servers didn't answer in 5 seconds."]);
    });
  });

  describe("the Workspace line", () => {
    it.each<[WorkspaceLine["trust"], string[]]>([
      ["trusted", ["Acme · Trusted."]],
      ["not-needed", ["Acme · Test model only, no trust needed."]],
      [
        "changed",
        ["Acme changed since you trusted it.", "Halonic asks again before the next run."],
      ],
      ["refused", ["Acme has something Halonic can't trust."]],
      [
        "unreadable",
        ["Acme isn't trusted yet.", "Halonic asks once, before the first run. This is on purpose."],
      ],
    ])("says a workspace that is %s", (trust, said) => {
      expect(sentences({ check: "workspace", status: "warning", name: "Acme", trust })).toEqual(
        said,
      );
    });

    it("adds its file problems, the Windows drive and too many files to watch", () => {
      const said = sentences({
        check: "workspace",
        status: "failed",
        name: "Acme",
        trust: "trusted",
        fileProblems: 2,
        windowsDrive: "/mnt/c",
        tooManyFilesToWatch: 50_000,
      });

      expect(said.slice(1, 3)).toEqual([
        "Its files have 2 problems, so no run starts until they're fixed.",
        "The workspace is on the Windows drive /mnt/c, so runs are slower. If Studio on Windows opens this folder, keep it there.",
      ]);
      expect(said.at(-1)).toMatch(/^Fix: /);
    });
  });

  describe("the Last run line", () => {
    const run = {
      check: "last-run",
      status: "failed",
      runId: "r1",
      step: 2,
      steps: 3,
      stepName: "Write reply",
      durationMs: 6800,
    } as const;
    it.each<[LastRunLine["failure"], string]>([
      [
        {
          reason: "no-key",
          provider: "Anthropic",
          secret: "anthropic",
          model: "m",
          alias: "default",
        },
        "there's no key for Anthropic.",
      ],
      [
        {
          reason: "key-refused",
          provider: "Anthropic",
          secret: "anthropic",
          model: "m",
          alias: "default",
        },
        "Anthropic didn't accept the key.",
      ],
      [{ reason: "provider-busy", provider: "Anthropic" }, "Anthropic was too busy to answer."],
      [
        {
          reason: "model-unreachable",
          provider: "Ollama",
          address: "localhost:11434",
          alias: "default",
          local: true,
        },
        "Halonic couldn't reach Ollama at localhost:11434.",
      ],
      [
        {
          reason: "model-missing",
          provider: "Ollama",
          model: "llama3.2",
          alias: "default",
          server: "ollama",
        },
        "Ollama is answering, but it doesn't have llama3.2 yet.",
      ],
      [
        { reason: "model-timeout", provider: "Ollama", withinMs: 180_000 },
        "Ollama didn't start answering in time.",
      ],
      [
        {
          reason: "local-only",
          workspace: "Acme",
          provider: "Anthropic",
          agent: "Writer",
          alias: "default",
        },
        "the workspace is local only, so Halonic sent nothing to Anthropic.",
      ],
      [{ reason: "sandbox-not-ready", code: "bubblewrap-missing" }, "the sandbox couldn't start."],
      [
        { reason: "workspace-not-trusted", provider: "Anthropic" },
        "the workspace isn't trusted on this computer, so nothing was sent.",
      ],
      [{ reason: "internal" }, "the run failed. Open the run to see why."],
    ])("says what stopped it: %o", (failure, said) => {
      expect(sentences({ ...run, failure, cause: "last-run.x" })).toEqual([
        `Stopped at “Write reply” after 6.8 s: ${said}`,
      ]);
    });

    it("points at a line above it doesn't show as a line above", () => {
      expect(
        sentences({
          ...run,
          failure: { reason: "internal" },
          cause: "secrets.x",
          causeShownOn: "secrets",
        }),
      ).toEqual(["Stopped at “Write reply” after 6.8 s, because of a line above."]);
    });
  });

  it("words the Harnesses and Network lines as halonic doctor does, and a sandbox by its reason", () => {
    expect(
      sentences({
        check: "harnesses",
        status: "ok",
        installed: [{ harness: "claude-code", name: "Claude Code", version: "2.1.0" }],
        problems: [],
      })[0],
    ).toContain("Claude Code 2.1.0");
    expect(
      sentences({
        check: "network",
        status: "warning",
        problem: "proxy-not-http",
        variable: "HTTPS_PROXY",
        scheme: "socks5",
      })[0],
    ).toContain("HTTPS_PROXY");
    const ready = {
      check: "sandbox",
      status: "ok",
      capabilities: { files: "shared", strength: "os" },
    } as const;
    expect(sentences(ready)).toEqual(["Ready"]);
    expect(sentences({ ...ready, sandboxKind: "seatbelt" })).toEqual(["Ready · Seatbelt"]);
    expect(sentences({ ...ready, sandboxKind: "bubblewrap" })).toEqual(["Ready · bubblewrap"]);
    expect(sentences({ ...ready, sandboxKind: "windows" })).toEqual([
      "Ready · Sandbox for Windows",
    ]);
    const cantStart = sentences({
      check: "sandbox",
      status: "failed",
      reason: "bubblewrap-missing",
      missing: ["the check's own note"],
    });
    expect(cantStart[1]).toMatch(/^Fix: /);
    expect(cantStart.join(" ")).not.toContain("the check's own note");
  });

  it("says a local default, and an engine that isn't running", () => {
    expect(
      sentences({
        check: "default-model",
        status: "ok",
        target: { uses: "provider", provider: "ollama", name: "Ollama", local: true },
      }),
    ).toEqual(["The demo's default points at Ollama on this computer."]);
    expect(sentences({ check: "engine", running: false })).toEqual(["Not running"]);
  });
});
