import type { RunEvent, RunEventBody, RunFailureReason } from "@halonicjs/events";
import type { Provider } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import {
  type FailedModel,
  failedModelOf,
  failedStartOf,
  type RunFailedEvent,
  runFailureOf,
  type WorkspaceModels,
  workspaceModelsOf,
} from "./run-failure.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

const ollama: Provider = {
  version: 1,
  id: "ollama",
  name: "Ollama",
  type: "ollama",
  local: true,
  options: {},
};
const openai: Provider = {
  version: 1,
  id: "openai",
  name: "OpenAI",
  type: "openai-compatible",
  secret: "openai-key",
  local: false,
  options: {},
};

const models: WorkspaceModels = {
  name: "Acme",
  aliases: new Map([
    ["local", { provider: "ollama", model: "llama3.2", params: {}, fallback: [] }],
  ]),
  providers: new Map([ollama, openai].map((provider) => [provider.id, provider])),
  addresses: new Map([["ollama", "localhost:11434"]]),
};

/** `local` at Ollama, the model the run called last, unless the test says otherwise. */
function calledModel(change: Partial<FailedModel> = {}): FailedModel {
  return {
    alias: "local",
    agent: "drafter",
    workspace: "Acme",
    model: "llama3.2",
    providerId: "ollama",
    provider: ollama,
    address: "localhost:11434",
    keyMissing: false,
    ...change,
  };
}

const atOpenai = { alias: "smart", model: "gpt-4o", providerId: "openai", provider: openai };

function failedWith(reason: RunFailureReason | undefined, change: Partial<RunFailedEvent> = {}) {
  const failed: RunFailedEvent = {
    runId: "01JD8Q",
    seq: 9,
    at: "2026-11-10T09:00:00.000Z",
    type: "run.failed",
    state: "draft",
    error: "the engine's own words",
    ...(reason === undefined ? {} : { reason }),
    ...change,
  };
  return failed;
}

function log(...bodies: RunEventBody[]): RunEvent[] {
  return bodies.map((body, index) => ({
    runId: "01JD8Q",
    seq: index + 1,
    at: "2026-11-10T09:00:00.000Z",
    ...body,
  }));
}

const general = { reason: "error", message: "the engine's own words" };

verifies("app.run-failure", () => {
  describe("the facts are data", () => {
    it("gives a model's wait in milliseconds, with the local address", () => {
      expect(runFailureOf(failedWith("model-timeout"), calledModel())).toEqual({
        reason: "model-timeout",
        provider: "Ollama",
        withinMs: 300_000,
        localAddress: "localhost:11434",
      });
      expect(runFailureOf(failedWith("model-timeout"), calledModel(atOpenai))).toEqual({
        reason: "model-timeout",
        provider: "OpenAI",
        withinMs: 300_000,
      });
    });

    it("gives a monthly budget's reset as an ISO date, the first of the next month (UTC)", () => {
      const failed = failedWith("budget", {
        at: "2026-12-31T23:59:00.000Z",
        error: "Workflow failed: Monthly budget reached: 0.60 of 0.50 USD spent this month.",
      });
      expect(runFailureOf(failed, undefined)).toEqual({
        reason: "budget",
        per: "month",
        budget: 0.5,
        currency: "USD",
        resetsOn: "2027-01-01",
      });
    });

    it("reads a budget from the engine's cause before its error text", () => {
      const failed = failedWith("budget", {
        error: "Run budget reached: 1 of 2 EUR spent.",
        cause: {
          kind: "limit_reached",
          code: "budget.run",
          detail: { limit: "5", spent: "5.08", currency: "USD" },
        },
      });
      expect(runFailureOf(failed, undefined)).toEqual({
        reason: "budget",
        per: "run",
        budget: 5,
        spent: 5.08,
        currency: "USD",
      });
    });

    it("names a harness program by its id, with the engine's wait in milliseconds", () => {
      const failed = failedWith("harness-start-failed", { harnessCause: "not-installed" });
      const events = log(
        {
          type: "harness.started",
          state: "other",
          agent: "reader",
          harness: "codex",
          timeoutMs: 1,
        },
        {
          type: "harness.started",
          state: "draft",
          agent: "writer",
          harness: "claude-code",
          timeoutMs: 60_000,
        },
      );
      expect(runFailureOf(failed, undefined, failedStartOf(events, failed))).toEqual({
        reason: "harness-start-failed",
        agent: "writer",
        harness: "claude-code",
        withinMs: 60_000,
        cause: "not-installed",
      });
    });
  });

  describe("each reason's names", () => {
    it("names the secret of a key that was turned away, or that isn't set", () => {
      expect(runFailureOf(failedWith("key-refused"), calledModel(atOpenai))).toEqual({
        reason: "key-refused",
        provider: "OpenAI",
        secret: "openai-key",
        alias: "smart",
      });
      const skipped = calledModel({ ...atOpenai, keyMissing: true });
      expect(runFailureOf(failedWith("key-refused"), skipped)).toMatchObject({ reason: "no-key" });
    });

    it("names a provider without a file by its id", () => {
      const gone = calledModel({ providerId: "elsewhere", provider: undefined });
      expect(runFailureOf(failedWith("model-missing"), gone)).toEqual({
        reason: "model-missing",
        provider: "elsewhere",
        model: "llama3.2",
        alias: "local",
        server: "other",
      });
      expect(runFailureOf(failedWith("out-of-credit"), gone)).toEqual({
        reason: "out-of-credit",
        provider: "elsewhere",
      });
    });

    it("names the host the engine couldn't reach, or else the provider's address", () => {
      const cloud = calledModel({ ...atOpenai, address: "api.openai.com" });
      expect(runFailureOf(failedWith("model-unreachable"), cloud)).toEqual({
        reason: "model-unreachable",
        provider: "OpenAI",
        address: "api.openai.com",
        alias: "smart",
        local: false,
      });
      const named = failedWith("model-unreachable", { host: "10.0.0.2:11434" });
      expect(runFailureOf(named, calledModel())).toMatchObject({ address: "10.0.0.2:11434" });
    });

    it("names the workspace, agent and alias of a local-only run, and a model's facts", () => {
      expect(runFailureOf(failedWith("local-only"), calledModel(atOpenai))).toEqual({
        reason: "local-only",
        workspace: "Acme",
        provider: "OpenAI",
        agent: "drafter",
        alias: "smart",
      });
      expect(runFailureOf(failedWith("model-no-tools"), calledModel())).toEqual({
        reason: "model-no-tools",
        model: "llama3.2",
        alias: "local",
      });
      expect(runFailureOf(failedWith("model-out-of-memory"), calledModel())).toEqual({
        reason: "model-out-of-memory",
        provider: "Ollama",
        model: "llama3.2",
        alias: "local",
      });
      expect(runFailureOf(failedWith("provider-busy"), calledModel())).toEqual({
        reason: "provider-busy",
        provider: "Ollama",
      });
    });

    it("names the sandbox's code, or other when the log has none", () => {
      const refused = failedWith("sandbox-not-ready", { sandboxReason: "bubblewrap-missing" });
      expect(runFailureOf(refused, undefined)).toEqual({
        reason: "sandbox-not-ready",
        code: "bubblewrap-missing",
      });
      expect(runFailureOf(failedWith("sandbox-not-ready"), undefined)).toEqual({
        reason: "sandbox-not-ready",
        code: "other",
      });
      const failed = failedWith("sandbox-start-failed", { sandboxReason: "container" });
      const events = log({
        type: "sandbox.started",
        state: "draft",
        agent: "writer",
        timeoutMs: 1,
      });
      expect(runFailureOf(failed, undefined, failedStartOf(events, failed))).toEqual({
        reason: "sandbox-start-failed",
        agent: "writer",
        code: "container",
      });
    });

    it("names the provider and type of a provider file Halonic can't call (HAL-12342)", () => {
      const cause = {
        kind: "not_found" as const,
        code: "models.unknown-provider-type",
        detail: { provider: "weird", type: "carrier-pigeon" },
      };
      expect(runFailureOf(failedWith("error", { cause }), undefined)).toEqual({
        reason: "unknown-provider-type",
        provider: "weird",
        type: "carrier-pigeon",
      });
      const { detail: _, ...withoutFacts } = cause;
      expect(runFailureOf(failedWith("error", { cause: withoutFacts }), undefined)).toEqual(
        general,
      );
    });

    it("gives a cancelled run no facts", () => {
      expect(runFailureOf(failedWith("cancelled"), calledModel())).toBeUndefined();
    });
  });

  describe("a reason without the facts it needs", () => {
    const needsModel: readonly RunFailureReason[] = [
      "key-refused",
      "model-missing",
      "model-no-tools",
      "model-unreachable",
      "model-timeout",
      "model-out-of-memory",
      "out-of-credit",
      "provider-busy",
      "local-only",
    ];
    it.each(needsModel)("gives %s the engine's message when the run called no model", (reason) => {
      expect(runFailureOf(failedWith(reason), undefined)).toEqual(general);
    });

    it.each([
      "budget",
      "harness-unavailable",
      "instructions-not-trusted",
      "error",
      "sandbox-start-failed",
      "harness-start-failed",
    ] as const)("gives %s the engine's message", (reason) => {
      expect(runFailureOf(failedWith(reason), calledModel())).toEqual(general);
    });

    it("gives an unknown address, a missing secret and an older log the engine's message", () => {
      const nowhere = calledModel({ provider: undefined, address: undefined });
      expect(runFailureOf(failedWith("model-unreachable"), nowhere)).toEqual(general);
      expect(runFailureOf(failedWith("key-refused"), calledModel())).toEqual(general);
      expect(runFailureOf(failedWith(undefined), calledModel())).toEqual(general);
    });

    it.each(["disk-full", "interrupted", "answer-not-an-option"] as const)(
      "says the cause of %s is known",
      (reason) => {
        expect(runFailureOf(failedWith(reason), undefined)).toEqual({
          ...general,
          causeKnown: true,
        });
      },
    );
  });

  describe("the model a run called last", () => {
    it("is the last request's, by the alias that points at it, with its provider's address", () => {
      const events = log(
        { type: "llm.request", agent: "drafter", provider: "openai", model: "gpt-4o", messages: 1 },
        {
          type: "llm.request",
          agent: "drafter",
          provider: "ollama",
          model: "llama3.2",
          messages: 3,
        },
      );
      expect(failedModelOf(events, models)).toEqual(calledModel());
    });

    it("is the one a fallback moved to, by alias or by <provider>/<model>", () => {
      const fellBack = (to: string) =>
        log({ type: "llm.fallback", agent: "drafter", from: "smart", to, error: "offline" });
      expect(failedModelOf(fellBack("local"), models)).toEqual(calledModel());
      expect(failedModelOf(fellBack("openai/gpt-4o"), models)).toEqual(
        calledModel({ ...atOpenai, alias: "openai/gpt-4o", address: undefined }),
      );
      expect(failedModelOf(fellBack("removed"), models)).toBeUndefined();
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
      expect(failedModelOf(skipped(), models)).toMatchObject({ alias: "smart", keyMissing: true });
      expect(failedModelOf(skipped("local"), models)).toMatchObject({ keyMissing: false });
    });

    it("is none for a run that called no model", () => {
      expect(failedModelOf(log({ type: "state.entered", state: "draft" }), models)).toBeUndefined();
    });
  });

  it("reads the workspace's name, its hub's aliases and each provider's address", async () => {
    const workspace = await loadWorkspace(
      new TestDefinitionStore({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "models.yaml": "aliases:\n  local:\n    provider: ollama\n    model: llama3.2\n",
        "providers/ollama.yaml": "id: ollama\nname: Ollama\ntype: ollama\nlocal: true\n",
        "providers/openai.yaml":
          "id: openai\nname: OpenAI\ntype: openai-compatible\nsecret: openai-key\n",
        "hubs/support/hub.yaml": "id: support\nname: Support\n",
      }),
    );
    const read = workspaceModelsOf(workspace, "support", (provider) =>
      provider.local ? "localhost:11434" : undefined,
    );
    expect(read.name).toBe("Acme");
    expect([...read.aliases.keys()]).toEqual(["local"]);
    expect([...read.providers.keys()].sort()).toEqual(["ollama", "openai"]);
    expect([...read.addresses]).toEqual([["ollama", "localhost:11434"]]);
  });
});
