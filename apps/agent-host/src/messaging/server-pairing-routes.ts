import { type Schema, s } from "@halonicjs/schema-kit";
import { type HostRoute, sendError, sendErrorAndHangUp, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { isFromOtherSite } from "../server/other-site.ts";
import type { DesktopMessaging } from "./desktop-messaging.ts";
import type { ServerEnginePairing } from "./server-pairing.ts";

/** Where the routes live: under the messaging's prefix, so the messaging-only host serves them too. */
export const serverEnginePathPrefix = "/v1/messaging/server-engine/";

const workspace = s.string().min(1).max(4096);
const workspaceBody = s.object({ workspace }).strict();
// The server's own patterns (`server.device-pairing`), so nothing it would refuse is sent.
const pairBody = s
  .object({
    workspace,
    address: s.string().min(1).max(2048),
    code: s.string().regex(/^[\w -]{1,32}$/),
    deviceName: s.string().regex(/^[^\p{Cc}\p{Cf}]{1,80}$/u),
  })
  .strict();
const pairingBody = s.object({ pairingId: s.string().regex(/^[0-9a-f]{32}$/) }).strict();

/** What the pairing routes reach. */
export interface ServerPairingRouteDeps {
  messaging: DesktopMessaging;
  /** The pairing, or `undefined` when the host has no keychain (no `--keychain-relay`). */
  pairing: ServerEnginePairing | undefined;
  /** Where the host writes what failed: an error's name at most. */
  log: (text: string) => void;
}

type Answer = { status: number; body: unknown };

/**
 * The routes Studio pairs a workspace's messaging with a Halonic server
 * through (`agent-host.server-engine-pairing`). Each refuses a request from
 * another site (403 `secret_from_other_site`, before the body is read), and
 * answers 409 `keychain_needed` when the host has no keychain, so a device
 * token never goes to the profile's secrets file. No answer holds the token.
 *
 * - `POST …/state` with `{ workspace }` answers `{ engine: "this-computer" }`
 *   or `{ engine: "server", address, pairing: "kept" | "missing" | "unreadable" }`,
 *   with `computerName` when the computer has one, and for a server the
 *   `deviceName` it paired as and its `reach` once the host called it.
 * - `POST …/pair` with `{ workspace, address, code, deviceName }` answers
 *   `{ state: "waiting", pairingId, checkCode, expiresAt }`, or the reason it
 *   didn't start: `address_not_allowed`, `unreachable`, `not_halonic`,
 *   `code_refused`, `too_many` (with `minutes` when the server said).
 * - `POST …/pair-status` with `{ pairingId }` answers `waiting` with
 *   `expiresAt`; `paired` with `sessionEndsAt` once the keychain has the
 *   token, the setting is "Server" and the hub switched; `key_not_saved`
 *   with `signedOut` when it couldn't keep it; or `expired`, `refused`,
 *   `cancelled`, `taken-over`, `lost`, `unreachable`, `too_many`.
 * - `POST …/pair-cancel` with `{ pairingId }` answers `{ cancelled }`.
 * - `POST …/use-this-computer` with `{ workspace }` answers `{ stillValid }`,
 *   and `keychainEntryKept: true` when the keychain kept the entry.
 *
 * A failure is 502 `server_engine_failed`; the log names only the error's kind.
 */
export function serverPairingRoutes(deps: ServerPairingRouteDeps): HostRoute[] {
  const route = <T>(
    name: string,
    schema: Schema<T>,
    run: (pairing: ServerEnginePairing, body: T) => Promise<Answer>,
  ) => pairingRoute(deps, name, schema, run);
  /** Runs `then` with the workspace's real path; 404 for a folder the launcher didn't name. */
  const named = async (folder: string, then: (workspace: string) => Promise<unknown>) => {
    const messaging = await deps.messaging.of(folder);
    if (messaging === undefined) return unknownWorkspace;
    return { status: 200, body: await then(messaging.workspace) };
  };
  return [
    route("state", workspaceBody, (pairing, body) =>
      named(body.workspace, (folder) => pairing.state(folder)),
    ),
    route("pair", pairBody, (pairing, body) =>
      named(body.workspace, (folder) =>
        pairing.pair(folder, body.address, body.code, body.deviceName),
      ),
    ),
    route("pair-status", pairingBody, async (pairing, body) => ({
      status: 200,
      body: await pairing.status(body.pairingId),
    })),
    route("pair-cancel", pairingBody, async (pairing, body) => ({
      status: 200,
      body: await pairing.cancel(body.pairingId),
    })),
    route("use-this-computer", workspaceBody, (pairing, body) =>
      named(body.workspace, (folder) => pairing.useThisComputer(folder)),
    ),
  ];
}

/** One route: the site check, the body, the keychain, then `run`; a throw is 502 with its kind logged. */
function pairingRoute<T>(
  deps: ServerPairingRouteDeps,
  name: string,
  schema: Schema<T>,
  run: (pairing: ServerEnginePairing, body: T) => Promise<Answer>,
): HostRoute {
  const path = `${serverEnginePathPrefix}${name}`;
  return {
    method: "POST",
    path,
    handle: async (request, response) => {
      if (isFromOtherSite(request)) {
        sendErrorAndHangUp(
          request,
          response,
          403,
          "secret_from_other_site",
          "The agent host pairs with a server only for its own page.",
        );
        return;
      }
      const body = await readCheckedBody(request, response, schema);
      if (body === undefined) return;
      if (deps.pairing === undefined) {
        sendError(response, 409, "keychain_needed", keychainNeededMessage);
        return;
      }
      try {
        const answer = await run(deps.pairing, body);
        sendJson(response, answer.status, answer.body);
      } catch (error) {
        deps.log(`Server engine failed at ${path} (${errorName(error)}).\n`);
        sendError(response, 502, "server_engine_failed", "The server pairing failed.");
      }
    },
  };
}

const keychainNeededMessage =
  "This host has no keychain to keep a server pairing in. Pair from Halonic Studio.";

const unknownWorkspace: Answer = {
  status: 404,
  body: { error: { kind: "unknown_workspace", message: "The host serves no such workspace." } },
};

/** Only the error's name, when it is a plain word: a message may hold what a server answered. */
function errorName(error: unknown): string {
  const name = error instanceof Error ? error.name : "Error";
  return /^\w{1,40}$/.test(name) ? name : "Error";
}
