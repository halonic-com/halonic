import type { RunEvent, RunEventBody, RunFailureReason } from "@halonicjs/events";
import type { ModelAlias, Provider } from "@halonicjs/format";
import { plainText } from "../messages/phrase.ts";
import { type RunFailure, runFailedLines } from "../messages/run-failures.ts";
import type { FailedModel, RunFailedEvent, WorkspaceModels } from "../run-failure-of.ts";

export const ollama: Provider = {
  version: 1,
  id: "ollama",
  name: "Ollama",
  type: "ollama",
  local: true,
  options: {},
};
export const lmStudio: Provider = {
  ...ollama,
  id: "lmstudio",
  name: "LM Studio",
  type: "lmstudio",
};
export const openai: Provider = {
  version: 1,
  id: "openai",
  name: "OpenAI",
  type: "openai-compatible",
  secret: "openai-key",
  local: false,
  options: {},
};

export function alias(provider: string, model: string, fallback: string[] = []): ModelAlias {
  return { provider, model, params: {}, fallback };
}

/** The model `smart` the run called last, at OpenAI. */
export const openaiModel = {
  alias: "smart",
  model: "gpt-4o",
  providerId: "openai",
  provider: openai,
};

export const workspace: WorkspaceModels = {
  name: "Acme",
  aliases: new Map([
    ["local", alias("ollama", "llama3.2")],
    ["smart", alias("openai", "gpt-4o", ["local"])],
  ]),
  providers: new Map([ollama, lmStudio, openai].map((provider) => [provider.id, provider])),
};

/** The model the run called last: `local` at Ollama unless the test says otherwise. */
export function calledModel(change: Partial<FailedModel> = {}): FailedModel {
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

export function failedWith(reason: RunFailureReason | undefined, host?: string): RunFailedEvent {
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
export function log(...bodies: RunEventBody[]): RunEvent[] {
  return bodies.map((body, index) => ({
    runId: "01JD8Q",
    seq: index + 1,
    at: "2026-11-10T09:00:00.000Z",
    ...body,
  }));
}

/** Line 2 of the failure, as plain words; `undefined` when the failure has none. */
export function fixLine(failure: RunFailure | undefined): string | undefined {
  if (failure === undefined) throw new Error("expected a failure");
  const run = { title: "Support reply", step: "Draft a reply", runId: "01JD8Q" };
  const { fix } = runFailedLines(run, failure);
  return fix === undefined ? undefined : plainText(fix.phrase);
}

/** The general line 2, which asks for a bug report. */
export const reportIt = /^Run it again with --debug to see the details, and report it: /;

export const general: RunFailure = { reason: "error", message: "the engine's own words" };
