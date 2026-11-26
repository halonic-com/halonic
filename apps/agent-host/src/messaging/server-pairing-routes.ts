import type { AccessToken } from "@halonicjs/host-server";
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
// An Access value goes in a header: printable characters only (`server.messaging-client`).
const accessValue = s.string().regex(/^[\x21-\x7e]{1,512}$/);
const accessFields = {
  accessClientId: accessValue.optional(),
  accessClientSecret: accessValue.optional(),
};
const pairBody = s
  .object({
    workspace,
    address: s.string().min(1).max(2048),
    code: s.string().regex(/^[\w -]{1,32}$/),
    deviceName: s.string().regex(/^[^\p{Cc}\p{Cf}]{1,80}$/u),
    ...accessFields,
  })
  .strict();
const accessBody = s.object({ workspace, ...accessFields }).strict();
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

/** The Access service token a body names; `"partial"` when it gives only the ID or only the secret. */
function accessOf(body: {
  accessClientId?: string | undefined;
  accessClientSecret?: string | undefined;
}): AccessToken | undefined | "partial" {
  const { accessClientId: clientId, accessClientSecret: clientSecret } = body;
  if (clientId === undefined && clientSecret === undefined) return undefined;
  return clientId === undefined || clientSecret === undefined
    ? "partial"
    : { clientId, clientSecret };
}

const partialAccess: Answer = {
  status: 400,
  body: {
    error: {
      kind: "bad_access",
      message: "Give both the Access client ID and secret, or neither.",
    },
  },
};

/**
 * The routes Studio pairs a workspace's messaging with a Halonic server
 * through (`agent-host.server-engine-pairing`). Each refuses a request from
 * another site (403 `secret_from_other_site`, before the body is read), and
 * answers 409 `keychain_needed` when the host has no keychain, so a device
 * token never goes to the profile's secrets file. No answer holds the token.
 *
 * - `POST …/state` with `{ workspace }` answers `{ engine: "this-computer" }`
 *   with this computer's `computerName`, or `{ engine: "server", address,
 *   pairing: "kept" | "missing" | "unreadable" }` with the `computerName`
 *   and `sessionEndsAt` pairing gave, and while the pairing is kept
 *   `server: { state: "online" | "offline" | "signed-out", checkedAt }`.
 * - `POST …/pair` with `{ workspace, address, code, deviceName }` answers
 *   `{ state: "waiting", pairingId, checkCode, expiresAt }`, or the reason it
 *   didn't start: `address_not_allowed`, `unreachable`, `not_halonic`,
 *   `code_refused`, `too_many` (with `minutes` when the server said).
 *   and, with the Access service token the server's access check wants,
 *   `accessClientId` and `accessClientSecret` (both or neither; else 400 `bad_access`), which
 *   adds the reason `access_refused`.
 * - `POST …/pair-status` with `{ pairingId }` answers `waiting` with
 *   `expiresAt`; `paired` with `sessionEndsAt` once the keychain has the
 *   token, the setting is "Server" and the hub switched; `key_not_saved`
 *   with `signedOut` when it couldn't keep it; or `expired`, `refused`,
 *   `cancelled`, `taken-over`, `lost`, `unreachable`, `too_many`.
 * - `POST …/pair-cancel` with `{ pairingId }` answers `{ cancelled }`.
 * - `POST …/access` with `{ workspace, accessClientId, accessClientSecret }`, or neither to
 *   clear them, answers `{ state: "saved", server }` with the server's answer just now
 *   (`access-refused` when its access check still refuses), `not_paired` or `key_not_saved`.
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
    route("pair", pairBody, async (pairing, body) => {
      const access = accessOf(body);
      if (access === "partial") return partialAccess;
      return named(body.workspace, (folder) =>
        pairing.pair(folder, body.address, body.code, body.deviceName, access),
      );
    }),
    route("access", accessBody, async (pairing, body) => {
      const access = accessOf(body);
      if (access === "partial") return partialAccess;
      return named(body.workspace, (folder) => pairing.setAccess(folder, access));
    }),
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
