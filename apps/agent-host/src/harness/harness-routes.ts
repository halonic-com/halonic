import type { Harness, HarnessRun } from "@halonicjs/ports";
import type { BridgeTable } from "../bridge/bridge-routes.ts";
import type { SessionTable } from "../sandbox/session-table.ts";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { type NdjsonStream, startNdjsonStream } from "../server/ndjson-stream.ts";
import { harnessBody, runBody, sendRunBody, startRunBody } from "./harness-schemas.ts";
import type { RunTable } from "./run-table.ts";

/** What the harness routes reach: the harnesses, and the host's sessions, bridges and runs. */
export interface HarnessRouteDeps {
  harnesses: readonly Harness[];
  sessions: SessionTable;
  bridges: BridgeTable;
  runs: RunTable;
}

/**
 * The `Harness` port over loopback, so Studio can give the engine a stand-in
 * for each harness that runs here:
 *
 * - `GET /v1/harnesses` lists them, as `{ id, name }`;
 * - `POST /v1/harnesses/detect` with `{ harness }` answers its `HarnessDetection`;
 * - `POST /v1/harnesses/runs/start` with `{ harness, task, session, bridge }`
 *   starts the agent in a sandbox session and with a bridge Studio opened on
 *   this host, and answers with an NDJSON stream: `{ type: "started", run }`,
 *   then `{ type: "event", event }` for each `HarnessEvent`, then
 *   `{ type: "finished" }` or `{ type: "failed", message }`. When Studio goes
 *   away, the run is cancelled.
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
        const body = await readCheckedBody(request, response, harnessBody);
        if (body === undefined) return;
        const harness = harnessById(body.harness);
        if (harness === undefined) sendUnknown(response, "harness");
        else sendJson(response, 200, await harness.detect());
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
        const run = runs.get(body.run);
        if (run === undefined) return sendUnknown(response, "run");
        try {
          await run.send(body.input);
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

/** Starts a run and keeps its stream open, carrying the run's events, until the run ends. */
function startRunHandler(
  { sessions, bridges, runs }: HarnessRouteDeps,
  harnessById: (id: string) => Harness | undefined,
): HostRoute["handle"] {
  return async (request, response) => {
    const body = await readCheckedBody(request, response, startRunBody);
    if (body === undefined) return;
    if (runs.isStopping) {
      sendError(response, 503, "host_stopping", "The agent host is stopping and starts no runs.");
      return;
    }
    const harness = harnessById(body.harness);
    const session = sessions.get(body.session);
    const bridge = bridges.get(body.bridge)?.bridge;
    if (harness === undefined) return sendUnknown(response, "harness");
    if (session === undefined) return sendUnknown(response, "session");
    if (bridge === undefined) return sendUnknown(response, "bridge");

    const stream = startNdjsonStream(response);
    let run: HarnessRun;
    try {
      run = harness.start(body.task, session, { url: bridge.url, token: bridge.token });
    } catch (error) {
      stream.send({ type: "failed", message: messageOf(error) });
      stream.end();
      return;
    }
    const id = runs.add(run);
    stream.send({ type: "started", run: id });
    let finished = false;
    // Studio went away: nobody reads the events or can answer the agent any more.
    // Nobody awaits this cancel, so a rejection is dropped here: left unhandled, it would
    // stop the whole host, and every other session and bridge with it.
    void stream.ended.then(() => (finished ? undefined : run.cancel())).catch(() => {});
    try {
      await sendEvents(run, stream);
    } finally {
      finished = true;
      runs.remove(id);
      stream.end();
    }
  };
}

/** Sends each event of the run, then how it ended. */
async function sendEvents(run: HarnessRun, stream: NdjsonStream): Promise<void> {
  try {
    for await (const event of run) stream.send({ type: "event", event });
    stream.send({ type: "finished" });
  } catch (error) {
    // The port keeps the bridge token out of a run's errors, so the message can go to Studio.
    stream.send({ type: "failed", message: messageOf(error) });
  }
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
