import type { ServerResponse } from "node:http";
import type { Sandbox, SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { startNdjsonStream } from "../server/ndjson-stream.ts";
import { sandboxProfileSchema } from "./profile-schema.ts";
import type { SessionTable } from "./session-table.ts";

const openBody = s.object({ profile: sandboxProfileSchema }).strict();
const sessionBody = s.object({ session: s.string().min(1) }).strict();

const unknownSessionMessage = "The agent host has no open sandbox session with this id.";
const hostStoppingMessage = "The agent host is stopping and opens no more sessions.";
const tooManySessionsMessage =
  "The agent host already has the most sandbox sessions it allows. Close one first.";

/** Answers that the host is stopping and opens no more sessions. */
function sendHostStopping(response: ServerResponse): void {
  sendError(response, 503, "host_stopping", hostStoppingMessage);
}

/** Opens a session in a place the caller reserved in `sessions`, and answers its id. */
async function openSession(
  sandbox: Sandbox,
  sessions: SessionTable,
  profile: SandboxProfile,
  response: ServerResponse,
): Promise<void> {
  let callerGone = false;
  response.once("close", () => {
    callerGone = true;
  });
  let session: SandboxSession;
  try {
    session = await sandbox.open(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendError(response, 422, "sandbox_open_failed", message);
    return;
  }
  if (callerGone) {
    // The caller went away while the session opened: nobody can close it later.
    await session.close();
    return;
  }
  // Read the fence before adding: a host that is stopping closes the session in `add`.
  const fence = session.fence;
  const id = await sessions.add(session);
  if (id === undefined) sendHostStopping(response);
  else sendJson(response, 200, { session: id, fence });
}

/**
 * The `Sandbox` port over loopback, so Studio can give the engine a stand-in
 * for the sandbox that runs here:
 *
 * - `GET /v1/sandbox/check` and `GET /v1/sandbox/capabilities` answer as the port does;
 * - `POST /v1/sandbox/sessions/open` with `{ profile }` opens a session and
 *   answers `{ session, fence }`: its id and the fence proof, or 503
 *   `host_stopping` once the host has begun to stop, or 429
 *   `too_many_sessions` when the session table is full;
 * - `POST /v1/sandbox/sessions/blocked` with `{ session }` streams the
 *   session's blocked accesses, one `SandboxBlock` per line, until it closes;
 * - `POST /v1/sandbox/sessions/close` with `{ session }` closes it.
 *
 * A session that ends by itself (time limit) is closed here too, which ends
 * its stream; the host closes every session when it stops.
 */
export function sandboxRoutes(sandbox: Sandbox, sessions: SessionTable): HostRoute[] {
  return [
    {
      method: "GET",
      path: "/v1/sandbox/check",
      handle: async (_request, response) => sendJson(response, 200, await sandbox.check()),
    },
    {
      method: "GET",
      path: "/v1/sandbox/capabilities",
      handle: (_request, response) => sendJson(response, 200, sandbox.capabilities()),
    },
    {
      method: "POST",
      path: "/v1/sandbox/sessions/open",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, openBody);
        if (body === undefined) return;
        if (sessions.isStopping) {
          sendHostStopping(response);
          return;
        }
        const release = sessions.reserve();
        if (release === undefined) {
          sendError(response, 429, "too_many_sessions", tooManySessionsMessage);
          return;
        }
        try {
          await openSession(sandbox, sessions, body.profile, response);
        } finally {
          release();
        }
      },
    },
    {
      method: "POST",
      path: "/v1/sandbox/sessions/blocked",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, sessionBody);
        if (body === undefined) return;
        const session = sessions.get(body.session);
        if (session === undefined) {
          sendError(response, 404, "unknown_session", unknownSessionMessage);
          return;
        }
        const stream = startNdjsonStream(response);
        const stopBlocks = session.onBlocked((block) => stream.send(block));
        const stopWaiting = sessions.onClosed(body.session, () => stream.end());
        await stream.ended;
        stopBlocks();
        stopWaiting();
      },
    },
    {
      method: "POST",
      path: "/v1/sandbox/sessions/close",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, sessionBody);
        if (body === undefined) return;
        if (await sessions.close(body.session)) sendJson(response, 200, { closed: true });
        else sendError(response, 404, "unknown_session", unknownSessionMessage);
      },
    },
  ];
}
