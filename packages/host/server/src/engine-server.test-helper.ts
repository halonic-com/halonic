import type { RunExecutor, RunStore } from "@halonicjs/ports";
import type { PlacedRoutine } from "@halonicjs/routines";
import type { Server, TrustDecision } from "./api.ts";
import type { RunUpdateFrame } from "./engine-api.ts";
import { createEngineServer } from "./engine-server.ts";
import { TestClock } from "./test-server.ts";

/** A launch token as the shell makes one: 43 base64url characters. */
export const engineToken = "acme-launch-token-0123456789-abcdefghijklmno";

/** The port the test engine pretends to listen on. */
export const enginePort = 41234;

/** The headers of a request the engine lets through. */
export const passing = {
  host: `127.0.0.1:${enginePort}`,
  authorization: `Bearer ${engineToken}`,
} as const;

/** A routine of the `acme` hub, with any field replaced. */
export function placedRoutine(
  overrides: Record<string, unknown> = {},
  hub: string | null = "acme",
): PlacedRoutine {
  return {
    hub,
    routine: {
      version: 1,
      id: "digest",
      name: "Morning digest",
      enabled: true,
      trigger: { schedule: "0 8 * * *" },
      run: { workflow: "send-digest", input: { at: "{{trigger.at}}" } },
      overlap: "skip",
      catchUp: "last",
      ...overrides,
    },
  } as unknown as PlacedRoutine;
}

/** What the test engine's fakes were asked. */
export interface EngineCalls {
  readonly started: unknown[];
  /** The listeners following the run-updates feed now. */
  readonly following: Set<(update: RunUpdateFrame) => void>;
  readonly listed: number[];
  readonly logged: unknown[];
}

/** An engine server over fakes: the routines given, trusted unless `trust` says otherwise. */
export function testEngine(
  options: {
    routines?: PlacedRoutine[];
    trust?: TrustDecision;
    startFails?: Error;
    listFails?: Error;
    maxBodyBytes?: number;
  } = {},
): { server: Server; calls: EngineCalls } {
  const calls: EngineCalls = { started: [], following: new Set(), listed: [], logged: [] };
  const start = async (request: unknown) => {
    calls.started.push(request);
    if (options.startFails !== undefined) throw options.startFails;
    return { id: "run_1", status: "running" };
  };
  const runs = { start, startAgent: start } as unknown as RunExecutor;
  const runStore = {
    list: async () => [],
    get: async () => null,
  } as unknown as Pick<RunStore, "list" | "get">;
  const server = createEngineServer({
    launchToken: engineToken,
    port: () => enginePort,
    maxBodyBytes: options.maxBodyBytes ?? 64 * 1024,
    ports: {
      runs,
      runStore,
      trust: { check: async () => options.trust ?? { state: "trusted", message: "Trusted." } },
      errorLog: { record: (error) => calls.logged.push(error) },
      clock: new TestClock(),
      routines: {
        list: async () => {
          calls.listed.push(1);
          if (options.listFails !== undefined) throw options.listFails;
          return options.routines ?? [];
        },
        timeZone: "UTC",
      },
      runUpdates: {
        follow(listener) {
          calls.following.add(listener);
          return () => calls.following.delete(listener);
        },
      },
    },
  });
  return { server, calls };
}

/** Sends one request to the test engine; a POST carries `body` as JSON unless `type` says otherwise. */
export function sendTo(
  server: Server,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string; type?: string } = {},
): Promise<Response> {
  const headers = new Headers(options.headers ?? passing);
  if (method === "POST") headers.set("content-type", options.type ?? "application/json");
  const init = method === "POST" ? { method, headers, body: options.body ?? "{}" } : { headers };
  return server.handle(new Request(`http://127.0.0.1:${enginePort}${path}`, init));
}
