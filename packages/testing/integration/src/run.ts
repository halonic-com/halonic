import type { RequestLogEntry } from "@halonicjs/adapter-integration-kit";
import type { Integration, TokenStore } from "@halonicjs/ports";
import { fakeWait } from "./fake-wait.ts";
import { loadSubject } from "./load.ts";
import { type RecordingFile, type ReplayedRequest, replayTransport } from "./recording.ts";

/** One tool call the suite makes, answered from one recording. */
export interface ToolCase {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  /** The recording that answers it, by its `scenario`. */
  readonly scenario: string;
  /** The pauses the call must take through `host.wait`, clamped, in order. */
  readonly waits?: readonly number[];
  /** Extra checks on the result. Throw to fail. */
  readonly check?: (result: string) => void;
}

/**
 * What the suite checks: the integration, what its permission sheet
 * declares, recorded responses and the tool calls to make.
 */
export interface ConformanceSubject {
  readonly integration: Integration;
  /**
   * Its permission sheet as data: the JSON the build writes, or
   * `integration.yaml` parsed. The suite loads it through the kit's loader,
   * as Halonic does.
   */
  readonly sheet: unknown;
  /** Its recording files (`halonic.recording/1`), one per scenario. */
  readonly recordings: readonly RecordingFile[];
  readonly cases: readonly ToolCase[];
  /** Its settings, such as the URL a `{ fromSetting }` host reads. */
  readonly settings?: Readonly<Record<string, unknown>>;
  /** Its source files by path, scanned for what integration code may not use. */
  readonly sources?: Readonly<Record<string, string>>;
}

/** Everything one tool call did. */
export interface CaseRun {
  readonly result?: string;
  readonly error?: unknown;
  /** Every request that reached the transport, with what the kit placed in it. */
  readonly seen: readonly ReplayedRequest[];
  readonly log: readonly RequestLogEntry[];
  /** Calls that went around the host to a global network API. */
  readonly globalCalls: readonly string[];
  /** Recorded exchanges the call never asked for. */
  readonly unusedExchanges: number;
  /** The pauses the call took through `host.wait`, clamped. The suite doesn't really wait. */
  readonly waits: readonly number[];
}

/**
 * Runs one tool call through the kit's real loader and host, on recordings, with canary
 * secrets and the network globals tripped. Its `wait` is a {@link fakeWait}.
 */
export async function runCase(
  subject: ConformanceSubject,
  toolCase: ToolCase,
  options: { recording?: RecordingFile; signal?: AbortSignal } = {},
): Promise<CaseRun> {
  const replay = replayTransport(options.recording ?? scenarioOf(subject, toolCase));
  const { host: kitHost, log } = loadSubject(subject, replay.transport, memoryTokens());
  const pauses = fakeWait();
  const host = Object.freeze({ ...kitHost, wait: pauses.wait });
  const globalCalls: string[] = [];
  const restore = tripNetworkGlobals(globalCalls);
  let result: string | undefined;
  let error: unknown;
  try {
    const connection = subject.integration.connect(host);
    try {
      result = await connection.callTool(toolCase.tool, toolCase.args, options.signal);
    } finally {
      await connection.close();
    }
  } catch (thrown) {
    error = thrown;
  } finally {
    restore();
  }
  return {
    ...(result === undefined ? {} : { result }),
    ...(error === undefined ? {} : { error }),
    seen: replay.seen,
    log: log.entries(),
    globalCalls,
    unusedExchanges: replay.unused(),
    waits: [...pauses.waits],
  };
}

/** The recording a case replays; undefined when there is none, so every request fails closed. */
export function scenarioOf(
  subject: ConformanceSubject,
  toolCase: ToolCase,
): RecordingFile | undefined {
  return subject.recordings.find((recording) => recording.scenario === toolCase.scenario);
}

/** Replaces the global network APIs with ones that record the call and throw. */
export function tripNetworkGlobals(calls: string[]): () => void {
  const globals = globalThis as Record<string, unknown>;
  const names = ["fetch", "WebSocket", "XMLHttpRequest", "EventSource"];
  const saved = names.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globals, name)] as const,
  );
  for (const name of names) {
    Object.defineProperty(globals, name, {
      configurable: true,
      writable: true,
      value: (..._args: unknown[]) => {
        calls.push(name);
        throw new Error(`integration code used the global ${name}; use host.http`);
      },
    });
  }
  return () => {
    for (const [name, descriptor] of saved) {
      if (descriptor === undefined) delete globals[name];
      else Object.defineProperty(globals, name, descriptor);
    }
  };
}

function memoryTokens(): TokenStore {
  const values = new Map<string, string>();
  return {
    get: async (name) => values.get(name) ?? null,
    set: async (name, value) => {
      values.set(name, value);
    },
    remove: async (name) => {
      values.delete(name);
    },
  };
}
