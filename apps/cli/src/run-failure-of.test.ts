import type { RunEvent, RunEventBody, RunFailureReason } from "@halonicjs/events";
import type { ModelAlias, Provider } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { type RunFailure, runFailedLines } from "./messages/run-failures.ts";
import { sandboxMessages } from "./messages/sandbox.ts";
import {
  type FailedModel,
  failedModelOf,
  type RunFailedEvent,
  runFailureOf,
  type WorkspaceModels,
} from "./run-failure-of.ts";

const ollama: Provider = {
  version: 1,
  id: "ollama",
  name: "Ollama",
  type: "ollama",
  local: true,
  options: {},
};
const lmStudio: Provider = { ...ollama, id: "lmstudio", name: "LM Studio", type: "lmstudio" };
const openai: Provider = {
  version: 1,
  id: "openai",
  name: "OpenAI",
  type: "openai-compatible",
  secret: "openai-key",
  local: false,
  options: {},
};

function alias(provider: string, model: string, fallback: string[] = []): ModelAlias {
  return { provider, model, params: {}, fallback };
}

/** The model `smart` the run called last, at OpenAI. */
const openaiModel = { alias: "smart", model: "gpt-4o", providerId: "openai", provider: openai };

const workspace: WorkspaceModels = {
  name: "Acme",
  aliases: new Map([
    ["local", alias("ollama", "llama3.2")],
    ["smart", alias("openai", "gpt-4o", ["local"])],
  ]),
  providers: new Map([ollama, lmStudio, openai].map((provider) => [provider.id, provider])),
};

/** The model the run called last: `local` at Ollama unless the test says otherwise. */
function calledModel(change: Partial<FailedModel> = {}): FailedModel {
  return {
    alias: "local",
    agent: "drafter",
    workspace: "Acme",
    model: "llama3.2",
    providerId: "ollama",
    provider: ollama,
    keyMissing: false,
    ...change,
  };
}

function failedWith(reason: RunFailureReason | undefined, host?: string): RunFailedEvent {
  return {
    runId: "01JD8Q",
    seq: 9,
    at: "2026-11-10T09:00:00.000Z",
    type: "run.failed",
    state: "draft",
    error: "the engine's own words",
    ...(reason === undefined ? {} : { reason }),
    ...(host === undefined ? {} : { host }),
  };
}

/** The run log `bodies` make, numbered from 1. */
function log(...bodies: RunEventBody[]): RunEvent[] {
  return bodies.map((body, index) => ({
    runId: "01JD8Q",
    seq: index + 1,
    at: "2026-11-10T09:00:00.000Z",
    ...body,
  }));
}

/** Line 2 of the failure, as plain words; `undefined` when the failure has none. */
function fixLine(failure: RunFailure | undefined): string | undefined {
  if (failure === undefined) throw new Error("expected a failure");
  const run = { title: "Support reply", step: "Draft a reply", runId: "01JD8Q" };
  const { fix } = runFailedLines(run, failure);
  return fix === undefined ? undefined : plainText(fix.phrase);
}

/** The general line 2, which asks for a bug report. */
const reportIt = /^Run it again with --debug to see the details, and report it: /;

const general: RunFailure = { reason: "error", message: "the engine's own words" };

verifies("cli.run-failure", () => {
  describe("server, from the provider's type", () => {
    it("offers ollama pull for a provider of type ollama", () => {
      const failure = runFailureOf(failedWith("model-missing"), calledModel());
      expect(failure).toEqual({
        reason: "model-missing",
        provider: "Ollama",
        model: "llama3.2",
        alias: "local",
        server: "ollama",
      });
      expect(fixLine(failure)).toBe(
        "Run ollama pull llama3.2, or point the model alias local at another model in models.yaml.",
      );
    });

    it("says to download it in the server for any other type", () => {
      const failure = runFailureOf(
        failedWith("model-missing"),
        calledModel({ providerId: "lmstudio", provider: lmStudio }),
      );
      expect(failure).toMatchObject({ provider: "LM Studio", server: "other" });
      expect(fixLine(failure)).toBe(
        "Download llama3.2 in LM Studio, or point the model alias local at another model in models.yaml.",
      );
    });

    it("gives the general download fix when the provider file can't be found", () => {
      const failure = runFailureOf(
        failedWith("model-missing"),
        calledModel({ providerId: "gone", provider: undefined }),
      );
      expect(failure).toMatchObject({ provider: "gone", server: "other" });
    });
  });

  describe("each reason", () => {
    it("names the secret of a key that was turned away", () => {
      expect(runFailureOf(failedWith("key-refused"), calledModel({ ...openaiModel }))).toEqual({
        reason: "key-refused",
        provider: "OpenAI",
        secret: "openai-key",
        alias: "smart",
      });
    });

    it("says there's no key when the run skipped the model for want of one", () => {
      const model = calledModel({ ...openaiModel, keyMissing: true });
      expect(runFailureOf(failedWith("key-refused"), model)).toMatchObject({ reason: "no-key" });
    });

    it("names the model that can't use tools", () => {
      expect(runFailureOf(failedWith("model-no-tools"), calledModel())).toEqual({
        reason: "model-no-tools",
        model: "llama3.2",
        alias: "local",
      });
    });

    it("names the host the engine couldn't reach, on this computer or not", () => {
      expect(
        runFailureOf(failedWith("model-unreachable", "localhost:11434"), calledModel()),
      ).toEqual({
        reason: "model-unreachable",
        provider: "Ollama",
        address: "localhost:11434",
        alias: "local",
        local: true,
      });
      const cloud = calledModel({
        ...openaiModel,
        provider: { ...openai, baseUrl: "https://api.openai.com/v1" },
      });
      expect(runFailureOf(failedWith("model-unreachable"), cloud)).toMatchObject({
        address: "api.openai.com",
        local: false,
      });
    });

    it("falls back to the provider's default address when the engine names no host", () => {
      expect(runFailureOf(failedWith("model-unreachable"), calledModel())).toMatchObject({
        address: "localhost:11434",
      });
    });

    it("names the provider without credit", () => {
      expect(runFailureOf(failedWith("out-of-credit"), calledModel({ ...openaiModel }))).toEqual({
        reason: "out-of-credit",
        provider: "OpenAI",
      });
    });

    it("names the busy provider, without tries until the engine retries one", () => {
      const failure = runFailureOf(failedWith("provider-busy"), calledModel({ ...openaiModel }));
      expect(failure).toEqual({ reason: "provider-busy", provider: "OpenAI" });
      expect(fixLine(failure)).toBe("Run it again in a few minutes.");
    });

    it("prints no failure lines for a cancelled run", () => {
      expect(runFailureOf(failedWith("cancelled"), calledModel())).toBeUndefined();
    });

    const generalReasons: readonly RunFailureReason[] = [
      // The log doesn't hold the budget and the spend yet.
      "budget",
      // Their words wait for the board (HAL-2264).
      "model-out-of-memory",
      "sandbox-start-failed",
      "harness-start-failed",
      // `halonic run` has no harnesses in 0.1; the engine's message names the step's effect.
      "harness-unavailable",
      "error",
    ];
    for (const reason of generalReasons) {
      it(`gives ${reason} the general lines with the engine's message`, () => {
        const failure = runFailureOf(failedWith(reason), calledModel());
        expect(failure).toEqual(general);
        expect(fixLine(failure)).toMatch(reportIt);
      });
    }

    // Their words wait for the board too (HAL-2264), but the cause is known (HAL-6451).
    const knownCauses: readonly RunFailureReason[] = [
      "disk-full",
      "interrupted",
      "answer-not-an-option",
    ];
    for (const reason of knownCauses) {
      it(`gives ${reason} the general line 1 without "report it"`, () => {
        const failure = runFailureOf(failedWith(reason), calledModel());
        expect(failure).toEqual({ ...general, causeKnown: true });
        expect(fixLine(failure)).toBeUndefined();
      });
    }

    it("gives an older log's run.failed without a reason the general lines", () => {
      expect(runFailureOf(failedWith(undefined), calledModel())).toEqual(general);
    });
  });

  describe("a model reason without the facts it needs", () => {
    const modelReasons: readonly RunFailureReason[] = [
      "key-refused",
      "model-missing",
      "model-no-tools",
      "model-unreachable",
      "out-of-credit",
      "provider-busy",
    ];
    for (const reason of modelReasons) {
      it(`gives ${reason} the general lines when the run called no model`, () => {
        expect(runFailureOf(failedWith(reason), undefined)).toEqual(general);
      });
    }

    it("gives key-refused the general lines when the provider has no secret", () => {
      expect(runFailureOf(failedWith("key-refused"), calledModel())).toEqual(general);
    });

    it("gives model-unreachable the general lines when no address is known", () => {
      const unknown = calledModel({ providerId: "gone", provider: undefined });
      expect(runFailureOf(failedWith("model-unreachable"), unknown)).toEqual(general);
    });
  });
});

describe("the model a run called last", () => {
  it("is the last request's, by the alias that points at it", () => {
    const events = log(
      { type: "llm.request", agent: "drafter", provider: "openai", model: "gpt-4o", messages: 1 },
      { type: "llm.request", agent: "drafter", provider: "ollama", model: "llama3.2", messages: 3 },
    );
    expect(failedModelOf(events, workspace)).toEqual(calledModel());
  });

  it("is the one a fallback moved to", () => {
    const events = log(
      { type: "llm.request", agent: "drafter", provider: "openai", model: "gpt-4o", messages: 1 },
      { type: "llm.fallback", agent: "drafter", from: "smart", to: "local", error: "offline: …" },
    );
    expect(failedModelOf(events, workspace)).toEqual(calledModel());
  });

  it("reads a model without an alias from its <provider>/<model> name", () => {
    const events = log({
      type: "llm.request",
      agent: "drafter",
      provider: "lmstudio",
      model: "qwen3",
      messages: 1,
    });
    expect(failedModelOf(events, workspace)).toEqual({
      alias: "lmstudio/qwen3",
      agent: "drafter",
      workspace: "Acme",
      model: "qwen3",
      providerId: "lmstudio",
      provider: lmStudio,
      keyMissing: false,
    });
    const moved = log({
      type: "llm.fallback",
      agent: "drafter",
      from: "smart",
      to: "lmstudio/qwen3",
      error: "offline: …",
    });
    expect(failedModelOf(moved, workspace)).toMatchObject({
      alias: "lmstudio/qwen3",
      model: "qwen3",
    });
  });

  it("knows no model when a fallback names an alias the workspace no longer has", () => {
    const events = log({
      type: "llm.fallback",
      agent: "drafter",
      from: "smart",
      to: "removed",
      error: "offline: …",
    });
    expect(failedModelOf(events, workspace)).toBeUndefined();
  });

  it("is a skipped model without its key only when no other model was left", () => {
    const skipped = (next?: string) =>
      log({
        type: "llm.skipped",
        agent: "drafter",
        alias: "smart",
        provider: "openai",
        model: "gpt-4o",
        reason: "no-key",
        ...(next === undefined ? {} : { next }),
      });
    expect(failedModelOf(skipped(), workspace)).toEqual(
      calledModel({ ...openaiModel, keyMissing: true }),
    );
    expect(failedModelOf(skipped("local"), workspace)).toMatchObject({ keyMissing: false });
  });

  it("is none for a run that called no model", () => {
    expect(
      failedModelOf(log({ type: "state.entered", state: "draft" }), workspace),
    ).toBeUndefined();
  });
});

verifies("cli.run-failed-local-only", () => {
  const skippedSmart = log({
    type: "llm.skipped",
    agent: "drafter",
    alias: "smart",
    provider: "openai",
    model: "gpt-4o",
    reason: "local-only",
  });

  it("names the workspace, the provider nothing was sent to, the agent and its alias", () => {
    const model = failedModelOf(skippedSmart, workspace);
    expect(runFailureOf(failedWith("local-only"), model)).toEqual({
      reason: "local-only",
      workspace: "Acme",
      provider: "OpenAI",
      agent: "drafter",
      alias: "smart",
    });
  });

  it("gets the general lines when the run log names no model", () => {
    expect(runFailureOf(failedWith("local-only"), undefined)).toEqual({
      reason: "error",
      message: "the engine's own words",
    });
  });
});

verifies("cli.run-failed-sandbox", () => {
  /** Line 1 and line 2 of a run that failed because the sandbox can't start, as plain words. */
  function linesOf(sandboxReason?: string): string[] {
    const failed = {
      ...failedWith("sandbox-not-ready"),
      ...(sandboxReason === undefined ? {} : { sandboxReason }),
    };
    const failure = runFailureOf(failed, undefined);
    if (failure === undefined) throw new Error("expected a failure");
    const run = { title: "Support reply", step: "Draft a reply", runId: "01JD8Q" };
    const { message } = runFailedLines(run, failure);
    return [plainText(message.phrase), fixLine(failure) ?? ""];
  }

  it("words the run from its code, in the words of a run the check refused", () => {
    expect(linesOf("bubblewrap-missing")).toEqual([
      "Support reply failed in the step Draft a reply: the sandbox can't start on this computer.",
      plainText(sandboxMessages.refusedFix("bubblewrap-missing").phrase),
    ]);
  });

  it("never shows the engine's own message", () => {
    expect(linesOf("container").join("\n")).not.toContain("the engine's own words");
  });

  it("reads a log without a code, or a code it doesn't know, as other", () => {
    const other = plainText(sandboxMessages.refusedFix("other").phrase);
    expect(linesOf()[1]).toBe(other);
    expect(linesOf("a-code-from-a-later-port")[1]).toBe(other);
  });
});
