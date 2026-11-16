import type { SandboxStartResult } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { type SandboxRefusals, sandboxSetupSource } from "./sandbox-setup-source.ts";

/** A routine run the sandbox refused. */
export const refusedRun = (
  id: string,
  routine: string,
  startedAt: string,
  extra: Partial<RunSummary> = {},
) =>
  waitingRun(id, {
    status: "failed",
    state: null,
    reason: "sandbox-not-ready",
    startedAt,
    endedAt: startedAt,
    trigger: { type: "schedule", routineId: `acme/${routine}`, at: startedAt },
    ...extra,
  });

/** A run that finished, so the sandbox started for it. */
export const completedRun = (id: string, startedAt: string, routine?: string) =>
  waitingRun(id, {
    status: "completed",
    state: null,
    startedAt,
    endedAt: startedAt,
    ...(routine === undefined
      ? {}
      : { trigger: { type: "schedule", routineId: `acme/${routine}`, at: startedAt } }),
  });

export async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** An Inbox with the sandbox source, over runs and a check a test sets. */
export function sandboxInbox(
  initial: readonly RunSummary[],
  result: SandboxStartResult = { ok: true },
) {
  let runs = initial;
  let next = result;
  let reason: string | undefined = "bubblewrap-missing";
  let throws = false;
  const listeners = new Set<() => void>();
  const refusals: SandboxRefusals = {
    runs: async () => runs,
    reasonOf: async () => reason,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const source = sandboxSetupSource(
    refusals,
    {
      check: async () => {
        if (throws) throw new Error("no host");
        return next;
      },
    },
    () => new Date("2026-11-10T12:00:00.000Z"),
  );
  const inbox = new Inbox(fakeRuns([]).runs);
  inbox.addSetupSource(source);
  return {
    inbox,
    source,
    set: (value: readonly RunSummary[]) => {
      runs = value;
      for (const listener of [...listeners]) listener();
    },
    result: (value: SandboxStartResult) => {
      next = value;
    },
    reason: (value: string | undefined) => {
      reason = value;
    },
    throwOnCheck: () => {
      throws = true;
    },
  };
}
