// Deliberate fakes for this package's tests: core may not use adapters, not
// even in tests, so the mock model and the in-memory stores are copied here
// as small as the tests need them.

import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import {
  type AppendOptions,
  type AppendResult,
  type BlobRef,
  type BlobStore,
  type ChatRequest,
  type ChatResponse,
  type Clock,
  compareRunSummaries,
  type LlmProvider,
  matchesRunFilter,
  type RunFilter,
  type RunSnapshot,
  type RunStore,
} from "@halonicjs/ports";
import { deepClone } from "@halonicjs/std";
import type { ModelScript, ScriptedModel, TestDeps } from "../test-deps.ts";

/** Run logs in memory, with the port's check on `expectedSeq`. */
export class FakeRunStore implements RunStore {
  readonly logs = new Map<string, RunEvent[]>();
  readonly snapshots = new Map<string, RunSnapshot>();

  async append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options: AppendOptions = {},
  ): Promise<AppendResult> {
    const log = this.logs.get(runId) ?? [];
    if (expectedSeq !== log.length) return { ok: false, reason: "conflict", lastSeq: log.length };
    log.push(...deepClone(events));
    this.logs.set(runId, log);
    if (options.snapshot !== undefined) {
      this.snapshots.set(runId, { seq: log.length, state: deepClone(options.snapshot) });
    }
    return { ok: true, lastSeq: log.length };
  }

  async events(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    return (this.logs.get(runId) ?? []).filter((event) => event.seq > afterSeq);
  }

  async snapshot(runId: string): Promise<RunSnapshot | null> {
    return this.snapshots.get(runId) ?? null;
  }

  async get(runId: string): Promise<RunSummary | null> {
    return summarize(this.logs.get(runId) ?? []);
  }

  async list(filter: RunFilter = {}): Promise<RunSummary[]> {
    return [...this.logs.values()]
      .map((log) => summarize(log))
      .filter((run): run is RunSummary => run !== null && matchesRunFilter(run, filter))
      .sort(compareRunSummaries);
  }
}

/** Blobs in memory, under a made-up but stable hash per content. */
export class FakeBlobStore implements BlobStore {
  readonly #blobs = new Map<string, Uint8Array>();

  async put(data: Uint8Array, mediaType: string): Promise<BlobRef> {
    const key = [...data].join(",");
    const known = [...this.#blobs].find(([, stored]) => [...stored].join(",") === key);
    const hash = known?.[0] ?? String(this.#blobs.size + 1).padStart(64, "0");
    this.#blobs.set(hash, data);
    return { hash, size: data.length, mediaType };
  }

  async get(hash: string): Promise<Uint8Array | null> {
    return this.#blobs.get(hash) ?? null;
  }
}

/**
 * A model that gives each agent its scripted replies in order, then "".
 * A reply `tool:<name> <json>` calls that tool with those arguments.
 */
export function fakeModel(script: ModelScript): ScriptedModel & { requests: ChatRequest[] } {
  const queues = new Map(Object.entries(script).map(([agent, replies]) => [agent, [...replies]]));
  const requests: ChatRequest[] = [];
  let calls = 0;
  const provider: LlmProvider = {
    id: "mock",
    type: "mock",
    capabilities: { tools: true, jsonOutput: true, vision: false, streaming: false },
    chat: async (request): Promise<ChatResponse> => {
      requests.push(request);
      const reply = queues.get(request.meta?.agentId ?? "")?.shift() ?? "";
      const usage = { inputTokens: 1, outputTokens: 1 };
      const call = /^tool:(\S+) (.*)$/s.exec(reply);
      if (call === null) return { content: reply, toolCalls: [], usage, finishReason: "stop" };
      calls += 1;
      const [, name = "", args = "{}"] = call;
      return {
        content: "",
        toolCalls: [{ id: `call_${calls}`, name, arguments: JSON.parse(args) }],
        usage,
        finishReason: "tool_calls",
      };
    },
  };
  return {
    provider,
    requests,
    remaining: () => Object.fromEntries([...queues].map(([agent, left]) => [agent, left.length])),
  };
}

/** A clock that stands still at 10 Nov 2026, 09:00 UTC. */
export const fixedClock: Clock = { now: () => new Date("2026-11-10T09:00:00.000Z") };

/** The dependencies of a test run on these fakes. */
export function fakeDeps(overrides: Partial<TestDeps> = {}): TestDeps {
  return {
    clock: fixedClock,
    model: fakeModel,
    stores: () => ({ runs: new FakeRunStore(), blobs: new FakeBlobStore() }),
    ...overrides,
  };
}

/**
 * {@link fakeDeps} that keep each case's model, in case order, so a test can
 * read the prompts each case's agents got.
 */
export function recordingDeps(overrides: Partial<TestDeps> = {}): {
  deps: TestDeps;
  models: ReturnType<typeof fakeModel>[];
} {
  const models: ReturnType<typeof fakeModel>[] = [];
  const model = (script: ModelScript) => {
    const made = fakeModel(script);
    models.push(made);
    return made;
  };
  return { deps: fakeDeps({ model, ...overrides }), models };
}

/** The last message of each request a model got, with the agent that sent it. */
export function promptsOf(model: ReturnType<typeof fakeModel> | undefined): [string, string][] {
  return (model?.requests ?? []).map((request) => [
    request.meta?.agentId ?? "",
    request.messages.at(-1)?.content ?? "",
  ]);
}
