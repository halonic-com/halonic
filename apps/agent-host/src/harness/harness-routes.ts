import type {
  Harness,
  HarnessBridge,
  HarnessDetectOptions,
  HarnessEvent,
  HarnessRun,
  HarnessTask,
  SandboxSession,
} from "@halonicjs/ports";
import type { BridgeTable } from "../bridge/bridge-routes.ts";
import type { SessionTable } from "../sandbox/session-table.ts";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { type NdjsonStream, startNdjsonStream } from "../server/ndjson-stream.ts";
import type { UnfencedSessions } from "../this-computer/unfenced-sessions.ts";
import { detectBody, runBody, sendRunBody, startRunBody } from "./harness-schemas.ts";
import type { RunTable } from "./run-table.ts";

/** What the harness routes reach: the harnesses, and the host's sessions, bridges and runs. */
export interface HarnessRouteDeps {
  harnesses: readonly Harness[];
  sessions: SessionTable;
  bridges: BridgeTable;
  runs: RunTable;
  /** The sessions opened without the sandbox, whose runs start only with the host's environment. */
  unfenced: Pick<UnfencedSessions, "startRefusal">;
}

/**
 * The `Harness` port over loopback, so Studio can give the engine a stand-in
 * for each harness that runs here:
 *
 * - `GET /v1/harnesses` lists them, as `{ id, name }`;
 * - `POST /v1/harnesses/detect` with `{ harness, settingsFolder? }` answers its `HarnessDetection`;
 * - `POST /v1/harnesses/runs/start` with `{ harness, task, session, bridge }`
 *   starts the agent in a sandbox session and with a bridge Studio opened on
 *   this host, and answers with an NDJSON stream: `{ type: "started", run }`,
 *   then `{ type: "event", event }` for each `HarnessEvent`, then
 *   `{ type: "finished" }` or `{ type: "failed", message }`. When Studio goes
 *   away, the run is cancelled. A bridge serves runs in one session only: it
 *   answers 409 `bridge_in_use` for a bridge a run started in another session.
 *   In a session without the sandbox, it answers 403 `environment_not_host`
 *   unless the host opened the session for an agent on this computer and its
 *   environment is exactly the host's (`agent-host.unfenced-start`).
 * - `POST /v1/harnesses/runs/send` with `{ run, input }` passes a person's answer;
 * - `POST /v1/harnesses/runs/cancel` with `{ run }` stops the run.
 *
 * The port's `environment` isn't here: the engine asks for it without
 * waiting, and it only reads its arguments, so Studio calls the adapter's own
 * function with the bridge's address and token from `/v1/bridge/open`.
 */
export function harnessRoutes(deps: HarnessRouteDeps): HostRoute[] {
  const { harnesses, runs } = deps;
  const harnessById = (id: string) => harnesses.find((harness) => harness.id === id);
  return [
    {
      method: "GET",
      path: "/v1/harnesses",
      handle: (_request, response) =>
        sendJson(
          response,
          200,
          harnesses.map(({ id, name }) => ({ id, name })),
        ),
    },
    {
      method: "POST",
      path: "/v1/harnesses/detect",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, detectBody);
        if (body === undefined) return;
        const harness = harnessById(body.harness);
        if (harness === undefined) sendUnknown(response, "harness");
        else sendJson(response, 200, await harness.detect(detectOptions(body.settingsFolder)));
      },
    },
    {
      method: "POST",
      path: "/v1/harnesses/runs/start",
      handle: startRunHandler(deps, harnessById),
    },
    ...answerRunRoutes(runs),
  ];
}

/** The routes that answer or stop a run the host has going. */
function answerRunRoutes(runs: RunTable): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/harnesses/runs/send",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, sendRunBody);
        if (body === undefined) return;
        if (runs.get(body.run) === undefined) return sendUnknown(response, "run");
        try {
          await runs.send(body.run, body.input);
          sendJson(response, 200, { sent: true });
        } catch (error) {
          sendError(response, 409, "send_failed", messageOf(error));
        }
      },
    },
    {
      method: "POST",
      path: "/v1/harnesses/runs/cancel",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, runBody);
        if (body === undefined) return;
        const run = runs.get(body.run);
        if (run === undefined) return sendUnknown(response, "run");
        await run.cancel();
        sendJson(response, 200, { cancelled: true });
      },
    },
  ];
}

const bridgeInUseMessage =
  "This bridge already serves a run in another sandbox session. Open a new bridge for this one.";

/** Starts a run and keeps its stream open, carrying the run's events, until the run ends. */
function startRunHandler(
  { sessions, bridges, runs, unfenced }: HarnessRouteDeps,
  harnessById: (id: string) => Harness | undefined,
): HostRoute["handle"] {
  return async (request, response) => {
    const body = await readCheckedBody(request, response, startRunBody);
    if (body === undefined) return;
    if (runs.isStopping) {
      sendError(response, 503, "host_stopping", "The agent host is stopping and starts no runs.");
      return;
    }
    const ready = readyToStart({ sessions, bridges, unfenced }, harnessById, body, response);
    if (ready === undefined) return;
    const { harness, session, bridge } = ready;

    const stream = startNdjsonStream(response);
    let run: HarnessRun;
    try {
      run = harness.start(body.task, session, { url: bridge.url, token: bridge.token });
    } catch (error) {
      stream.send({ type: "failed", message: messageOf(error) });
      stream.end();
      return;
    }
    const id = runs.add(run, body.task);
    stream.send({ type: "started", run: id });
    let finished = false;
    let outcome: "done" | "failed" = "failed";
    // Studio went away: nobody reads the events or can answer the agent any more.
    // Nobody awaits this cancel, so a rejection is dropped here: left unhandled, it would
    // stop the whole host, and every other session and bridge with it.
    void stream.ended.then(() => (finished ? undefined : run.cancel())).catch(() => {});
    try {
      outcome = await sendEvents(run, stream, (event) => runs.record(id, event));
    } finally {
      finished = true;
      runs.remove(id, outcome);
      stream.end();
    }
  };
}

/** What a run starts with once {@link readyToStart} let it. */
interface ReadyStart {
  harness: Harness;
  session: SandboxSession;
  bridge: OpenBridgeEntry["bridge"];
}

/**
 * Finds the run's harness, session and bridge, checks a session without the
 * sandbox's environment, and binds the bridge to the session; or answers why
 * the run can't start and gives `undefined`.
 */
function readyToStart(
  { sessions, bridges, unfenced }: Pick<HarnessRouteDeps, "sessions" | "bridges" | "unfenced">,
  harnessById: (id: string) => Harness | undefined,
  body: { harness: string; session: string; bridge: string; task: HarnessTask },
  response: Parameters<HostRoute["handle"]>[1],
): ReadyStart | undefined {
  const harness = harnessById(body.harness);
  const session = sessions.get(body.session);
  const open = bridges.get(body.bridge);
  if (harness === undefined) return unknown(response, "harness");
  if (session === undefined) return unknown(response, "session");
  if (open === undefined) return unknown(response, "bridge");
  const refusal = unfenced.startRefusal({
    sessionId: body.session,
    session,
    harness,
    task: body.task,
    bridge: hostedBridgeOf(open),
  });
  if (refusal !== undefined) {
    sendError(response, 403, "environment_not_host", refusal);
    return undefined;
  }
  // The host's own session, so the bridge's approvals read the fence it really has.
  // It binds before the harness starts, so a start that throws still uses the bridge
  // up: binding after the start would let the program call the bridge unbound.
  if (!open.bindSession(body.session, session)) {
    sendError(response, 409, "bridge_in_use", bridgeInUseMessage);
    return undefined;
  }
  return { harness, session, bridge: open.bridge };
}

/** Sends each event of the run, then how it ended, and tells `record` of each event. */
async function sendEvents(
  run: HarnessRun,
  stream: NdjsonStream,
  record: (event: HarnessEvent) => void,
): Promise<"done" | "failed"> {
  try {
    for await (const event of run) {
      record(event);
      stream.send({ type: "event", event });
    }
    stream.send({ type: "finished" });
    return "done";
  } catch (error) {
    // The port keeps the bridge token out of a run's errors, so the message can go to Studio.
    stream.send({ type: "failed", message: messageOf(error) });
    return "failed";
  }
}

/** One bridge the host has open, as the table keeps it. */
type OpenBridgeEntry = NonNullable<ReturnType<BridgeTable["get"]>>;

/** The bridge as the harness's environment reads it, the way Studio's client gave it to the engine. */
function hostedBridgeOf({ bridge, keyProviders }: OpenBridgeEntry): HarnessBridge {
  return {
    url: bridge.url,
    token: bridge.token,
    ...(bridge.socketPath === undefined ? {} : { socketPath: bridge.socketPath }),
    ...(keyProviders.length === 0 ? {} : { keyProviders: [...keyProviders] }),
  };
}

/** Answers that the host has no such thing, for a caller that then gives `undefined`. */
function unknown(
  response: Parameters<HostRoute["handle"]>[1],
  what: "harness" | "session" | "bridge",
): undefined {
  sendUnknown(response, what);
  return undefined;
}

function sendUnknown(
  response: Parameters<HostRoute["handle"]>[1],
  what: "harness" | "session" | "bridge" | "run",
): void {
  const message = {
    harness: "The agent host has no harness with this id.",
    session: "The agent host has no open sandbox session with this id.",
    bridge: "The agent host has no open bridge with this id.",
    run: "The agent host has no harness run with this id.",
  }[what];
  sendError(response, 404, `unknown_${what}`, message);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `detect()`'s options: the agent's settings folder, only when Studio named one. */
function detectOptions(settingsFolder: string | undefined): HarnessDetectOptions {
  return settingsFolder === undefined ? {} : { settingsFolder };
}
