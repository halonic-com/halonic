// The engine service's tests' fakes: Acme's files and a shell that keeps runs in memory.

import { TauriEngineLock } from "@halonicjs/adapter-fs-tauri";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { type Clock, type IdGenerator, noKeyOrigins, type Secrets } from "@halonicjs/ports";
import { EngineService, type EngineServiceOptions } from "./engine-service.ts";

export const location = "/acme";

/** Acme's `support` hub: `reply` runs the `writer` agent, plus the agents the refusals need. */
export function acmeFiles(
  agents: Record<string, string> = {},
  more: Record<string, string> = {},
): MemoryDefinitionStore {
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/workflows/reply.workflow.yaml": [
      "id: reply",
      "name: Reply",
      "initial: write",
      "states:",
      "  write:",
      "    agent: writer",
      "    on:",
      "      - to: done",
      "  done:",
      "    type: final",
      "",
    ].join("\n"),
    "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\n",
    ...more,
  };
  for (const [id, text] of Object.entries(agents)) {
    files[`hubs/support/agents/${id}.agent.yaml`] = `id: ${id}\nname: ${id}\n${text}`;
  }
  return new MemoryDefinitionStore(files);
}

type Handler = (args: Record<string, unknown>) => unknown;

/**
 * What the shell keeps for one engine: run logs and snapshots, blobs, and records the scheduler keeps its timers in.
 * Each command is a handler, so a test starts a run on the page's own stores.
 */
function shellStores(): Record<string, Handler> {
  const logs = new Map<string, string[]>();
  const snapshots = new Map<string, string>();
  const blobs = new Map<string, string>();
  const records = new Map<string, string>();
  return {
    run_append: ({ runId, expectedSeq, lines, snapshot }) => {
      const log = logs.get(runId as string) ?? [];
      const seq = log.join("").split("\n").length - 1;
      if (seq !== expectedSeq) return { ok: false, reason: "conflict", lastSeq: seq };
      logs.set(runId as string, [...log, ...(lines as string[])]);
      if (snapshot !== null) snapshots.set(runId as string, snapshot as string);
      return {
        ok: true,
        lastSeq: [...log, ...(lines as string[])].join("").split("\n").length - 1,
      };
    },
    run_events: ({ runId }) => (logs.get(runId as string) ?? []).join(""),
    run_snapshot: ({ runId }) => {
      const text = snapshots.get(runId as string);
      return text === undefined
        ? null
        : { text, logEvents: logs.get(runId as string)?.length ?? 0 };
    },
    run_logs: () => [...logs].map(([runId, log]) => ({ runId, stamp: null, lines: log.join("") })),
    blob_put: ({ data }) => {
      const hash = blobs.size.toString(16).padStart(64, "0");
      blobs.set(hash, data as string);
      return { hash };
    },
    blob_get: ({ hash }) => blobs.get(hash as string) ?? null,
    record_read: ({ collection }) => {
      const lines = records.get(collection as string) ?? "";
      return { lines, version: String(lines.length), file: "records" };
    },
    record_append: ({ appends }) => {
      for (const { collection, lines } of appends as { collection: string; lines: string }[]) {
        records.set(collection, (records.get(collection) ?? "") + lines);
      }
    },
    record_replace: () => ({ status: "replaced" }),
  };
}

/**
 * A shell that holds the engine lock for this window, or refuses it when `holder` holds it (with
 * its `pid`, when the shell names one) or with the shell's own `refusal`, and records each call.
 * `loseLock` plays another process taking the lock over.
 */
export function fakeShell(
  holder?: { pid?: number } | { refusal: { kind: string; message: string } },
) {
  const calls: string[] = [];
  const stores = shellStores();
  let onLost: ((message: unknown) => void) | undefined;
  const ipc = {
    invoke: async (command: string, args?: Record<string, unknown>) => {
      calls.push(command);
      if (command === "engine_lock_hold" && holder !== undefined) {
        throw "refusal" in holder ? holder.refusal : { kind: "conflict", message: "held", ...holder };
      }
      return stores[command]?.(args ?? {});
    },
  };
  return {
    calls,
    ipc,
    lock: new TauriEngineLock(
      {
        ...ipc,
        openChannel: (onMessage) => {
          onLost = onMessage;
          return { argument: "__CHANNEL__:0", close: () => (onLost = undefined) };
        },
      },
      location,
    ),
    /** Tells the page holding the lock that another process took it over. */
    loseLock: () => onLost?.({ message: "The engine lock was taken over by another process." }),
  };
}

/** The calls that took or gave back the lock, in order. */
export function lockCalls(shell: ReturnType<typeof fakeShell>): string[] {
  return shell.calls.filter((call) => call.startsWith("engine_lock_"));
}

/** A service on `shell` and Acme's files, with `more` options. */
export function serviceOn(
  shell: ReturnType<typeof fakeShell>,
  definitions: MemoryDefinitionStore = acmeFiles(),
  more: Partial<EngineServiceOptions> = {},
): EngineService {
  const secrets: Secrets = { get: async () => null };
  const clock: Clock = { now: () => new Date("2026-11-15T10:00:00.000Z") };
  const ids: IdGenerator = { next: (prefix) => `${prefix}1` };
  return new EngineService({
    ipc: shell.ipc,
    lock: shell.lock,
    location,
    name: "Acme",
    definitions,
    secrets,
    keyOrigins: noKeyOrigins,
    http: { fetch },
    clock,
    isTrusted: async () => true,
    mayStart: async () => true,
    ids,
    setTimer: () => () => {},
    newToken: () => "token",
    reportError: () => {},
    ...more,
  });
}
