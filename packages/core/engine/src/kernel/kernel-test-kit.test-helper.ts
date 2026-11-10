import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import type { Workflow } from "@halonicjs/format";
import {
  type AppendOptions,
  type AppendResult,
  type BlobRef,
  type BlobStore,
  matchesRunFilter,
  type RunFilter,
  type RunSnapshot,
  type RunStore,
} from "@halonicjs/ports";
import { decodeUtf8 } from "@halonicjs/std";
import type { DecideInput, StartInput } from "./decide-types.ts";

/**
 * A run store in memory, with the port's check on `expectedSeq`. A test can
 * drop or replace a run's snapshot, and can make the next appends lose a
 * race to another writer.
 */
export class KernelRuns implements RunStore {
  readonly logs = new Map<string, RunEvent[]>();
  readonly snapshots = new Map<string, RunSnapshot>();
  appends = 0;
  /** Runs once before each append, as another writer that appends first would. */
  beforeAppend: ((runId: string) => void) | undefined;

  async append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options: AppendOptions = {},
  ): Promise<AppendResult> {
    this.beforeAppend?.(runId);
    const log = this.logs.get(runId) ?? [];
    if (expectedSeq !== log.length) {
      return { ok: false, reason: "conflict", lastSeq: log.length };
    }
    this.appends += 1;
    log.push(...events);
    this.logs.set(runId, log);
    if (options.snapshot !== undefined) {
      this.snapshots.set(runId, {
        seq: log.length,
        state: JSON.parse(JSON.stringify(options.snapshot)),
      });
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
    const summaries = [...this.logs.values()].map((log) => summarize(log));
    return summaries.filter(
      (summary): summary is RunSummary => summary !== null && matchesRunFilter(summary, filter),
    );
  }
}

/** Blobs in memory. The hash is made up but stable: the same bytes always get the same one. */
export class KernelBlobs implements BlobStore {
  readonly blobs = new Map<string, Uint8Array>();

  async put(data: Uint8Array, mediaType: string): Promise<BlobRef> {
    const text = decodeUtf8(data);
    const known = [...this.blobs].find(([, stored]) => decodeUtf8(stored) === text);
    const hash = known?.[0] ?? String(this.blobs.size + 1).padStart(64, "0");
    this.blobs.set(hash, data);
    return { hash, size: data.length, mediaType };
  }

  async get(hash: string): Promise<Uint8Array | null> {
    return this.blobs.get(hash) ?? null;
  }
}

/** A workflow with one task state that writes `reply`, then a final state. */
export const replyWorkflow: Workflow = {
  version: 1,
  id: "reply",
  name: "Reply to a customer",
  initial: "draft",
  context: {},
  states: {
    draft: {
      type: "task",
      agent: "writer",
      input: "Reply to {{input.from}}",
      output: "reply",
      on: [{ to: "sent", event: "done" }],
    },
    sent: { type: "final", on: [] },
  },
  layout: {},
};

/** The start of an `acme` run of {@link replyWorkflow} with the given definitions version. */
export function startInput(definitionsVersion: string): StartInput {
  return {
    type: "start",
    at: "2026-11-09T09:00:00.000Z",
    runId: "r-acme",
    hubId: "acme",
    workflowId: "reply",
    input: { from: "support" },
    kind: "run",
    definitionsVersion,
  };
}

/** The model's answer to a call. */
export function answer(callId: string, output: unknown): DecideInput {
  return {
    type: "effect-done",
    at: "2026-11-09T09:00:05.000Z",
    callId,
    result: { type: "model", output },
  };
}
