import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { PairingSession, RemoteControl } from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { type NdjsonStream, startNdjsonStream } from "../server/ndjson-stream.ts";
import { RemoteRefusal } from "./remote-refusal.ts";

const onBody = s.object({ on: s.boolean() }).strict();
const allowRiskyBody = s.object({ allow: s.boolean() }).strict();
const phoneBody = s.object({ phone: s.string().min(1) }).strict();
const emptyBody = s.object({}).strict();
const pairingBody = s.object({ pairing: s.string().min(1) }).strict();
const answerBody = s.object({ pairing: s.string().min(1), allow: s.boolean() }).strict();

const unknownPairingMessage =
  "The agent host has no open pairing with this id. Its stream may have ended.";

/**
 * Settings › Remote's `RemoteControl` over loopback (requirement
 * `agent-host.remote-routes`), so Studio can drive the host's:
 *
 * - `GET /v1/remote/state` streams the `RemoteState`, one per line, the current one first;
 * - `POST /v1/remote/on` with `{ on }`, `POST /v1/remote/allow-risky` with `{ allow }`,
 *   `POST /v1/remote/revoke` with `{ phone }` and `POST /v1/remote/revoke-all` with `{}`
 *   answer `{ ok: true }`;
 * - `POST /v1/remote/pairing` with `{}` opens a pairing and streams
 *   `{ type: "opened", pairing }` with its id, then its `PairingEvent`s, until
 *   `paired` or `ended`. The stream is the dialog: when the caller leaves it,
 *   the pairing closes, so closing the dialog ends the code;
 * - `POST /v1/remote/pairing/answer` with `{ pairing, allow }`,
 *   `POST /v1/remote/pairing/new-code` and `POST /v1/remote/pairing/close`
 *   with `{ pairing }` drive that pairing.
 *
 * A step remote's rules refuse now answers 409 `remote_refused`; one that
 * fails answers 500 `remote_failed`.
 */
export function remoteRoutes(remote: RemoteControl): HostRoute[] {
  const pairings = new Map<string, PairingSession>();
  return [
    {
      method: "GET",
      path: "/v1/remote/state",
      handle: async (_request, response) => {
        await streamUntilEnded(remote.state(), startNdjsonStream(response));
      },
    },
    stepRoute("/v1/remote/on", onBody, (body) => remote.setRemote(body.on)),
    stepRoute("/v1/remote/allow-risky", allowRiskyBody, (body) =>
      remote.setAllowRiskyRemotely(body.allow),
    ),
    stepRoute("/v1/remote/revoke", phoneBody, (body) => remote.revoke(body.phone)),
    stepRoute("/v1/remote/revoke-all", emptyBody, () => remote.revokeAll()),
    {
      method: "POST",
      path: "/v1/remote/pairing",
      handle: async (request, response) => {
        if ((await readCheckedBody(request, response, emptyBody)) === undefined) return;
        let session: PairingSession;
        try {
          session = await remote.startPairing();
        } catch (error) {
          sendStepError(response, error);
          return;
        }
        await streamPairing(session, pairings, startNdjsonStream(response));
      },
    },
    pairingRoute("/v1/remote/pairing/answer", answerBody, pairings, (session, body) =>
      body.allow ? session.allow() : session.deny(),
    ),
    pairingRoute("/v1/remote/pairing/new-code", pairingBody, pairings, (session) =>
      session.newCode(),
    ),
    pairingRoute("/v1/remote/pairing/close", pairingBody, pairings, (session) => session.close()),
  ];
}

/** Streams the pairing under a new id, and closes it when the caller leaves before it ends. */
async function streamPairing(
  session: PairingSession,
  pairings: Map<string, PairingSession>,
  stream: NdjsonStream,
): Promise<void> {
  const id = randomUUID();
  pairings.set(id, session);
  stream.send({ type: "opened", pairing: id });
  try {
    await streamUntilEnded(session.events(), stream);
  } finally {
    pairings.delete(id);
    // Closing an ended pairing does nothing, so this only acts when the caller left.
    await session.close();
  }
}

/** Sends each item as a line until the source ends or the caller leaves, then ends the stream. */
async function streamUntilEnded<Item>(source: AsyncIterable<Item>, stream: NdjsonStream) {
  const items = source[Symbol.asyncIterator]();
  // The port doesn't promise that `return` wakes a pending `next`, so wait for either.
  const left = stream.ended.then(
    (): IteratorReturnResult<undefined> => ({
      done: true,
      value: undefined,
    }),
  );
  for (;;) {
    const next = await Promise.race([items.next(), left]);
    if (next.done === true) break;
    stream.send(next.value);
  }
  await items.return?.();
  stream.end();
}

/** A POST that checks its body, takes one step and answers `{ ok: true }`. */
function stepRoute<Body>(
  path: string,
  schema: Parameters<typeof readCheckedBody<Body>>[2],
  step: (body: Body) => Promise<void>,
): HostRoute {
  return {
    method: "POST",
    path,
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, schema);
      if (body === undefined) return;
      try {
        await step(body);
      } catch (error) {
        sendStepError(response, error);
        return;
      }
      sendJson(response, 200, { ok: true });
    },
  };
}

/** A {@link stepRoute} on the open pairing the body names; an unknown one answers 404. */
function pairingRoute<Body extends { readonly pairing: string }>(
  path: string,
  schema: Parameters<typeof readCheckedBody<Body>>[2],
  pairings: Map<string, PairingSession>,
  step: (session: PairingSession, body: Body) => Promise<void>,
): HostRoute {
  return stepRoute(path, schema, (body) => {
    const session = pairings.get(body.pairing);
    if (session === undefined) throw new UnknownPairing();
    return step(session, body);
  });
}

class UnknownPairing extends Error {}

function sendStepError(response: ServerResponse, error: unknown): void {
  if (error instanceof UnknownPairing) {
    sendError(response, 404, "unknown_pairing", unknownPairingMessage);
  } else if (error instanceof RemoteRefusal) {
    sendError(response, 409, "remote_refused", error.message);
  } else {
    sendError(response, 500, "remote_failed", `Remote couldn't finish: ${String(error)}`);
  }
}
