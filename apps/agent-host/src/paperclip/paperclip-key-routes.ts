import type { PaperclipBinding, PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import { s } from "@halonicjs/schema-kit";
import { serverEngineMessage } from "../messaging/server-engine.ts";
import { type HostRoute, sendError, sendErrorAndHangUp, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { namedWorkspace } from "../server/named-workspace.ts";
import { isFromOtherSite } from "../server/other-site.ts";

/**
 * A connection's name: its file name without `.yaml`. Studio keeps the key in
 * the keychain under a name built from it, so it follows the keychain's rule.
 */
export const paperclipConnectionNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

/** What Studio hands over. A key is what a header can carry, so a line break can't split it. */
const handOverBody = s
  .object({
    workspace: s.string().min(1).max(4096),
    connection: s.string().regex(paperclipConnectionNamePattern),
    key: s
      .string()
      .min(1)
      .max(4096)
      .regex(/^[\x21-\x7e]+$/u),
    address: s.string().min(1).max(2048),
    company: s.string().min(1).max(256),
  })
  .strict();

/** What the hand-over route reaches. */
export interface PaperclipKeyRouteDeps {
  keys: PaperclipKeys;
  /** The workspace folders the launcher named; a key is kept only for one of them. */
  workspaceRoots: readonly string[];
  /** Hears each key kept, so the host starts the connection's provider; it calls nobody either. */
  kept?: ((binding: PaperclipBinding) => Promise<void>) | undefined;
  /** Where the host writes what failed; never a key. */
  log?: ((text: string) => void) | undefined;
  /** Whether the workspace's messaging engine is a server, so no Paperclip key is kept for it. */
  usesServer?: ((workspace: string) => Promise<boolean>) | undefined;
}

/**
 * The route Studio hands a Paperclip key over with, when the person connects
 * (ADR 2026-11-24, agent messaging; `agent-host.paperclip-key-hand-over`).
 *
 * `POST /v1/paperclip/key` with `{ workspace, connection, key, address, company }`
 * answers `{ kept: true }` and keeps the key in memory only, with the address
 * and company it was made for, replacing the one held for that workspace's
 * connection. Keeping it calls nobody: only a request the provider sends
 * through the guard does.
 *
 * It refuses, keeping nothing: a `Sec-Fetch-Site` other than `same-origin`
 * (403 `secret_from_other_site`, before the body is read), a body that
 * doesn't fit or an address that isn't `https` or plain `http` to this
 * computer (400 `body_invalid`, with no detail, as the body holds the key),
 * and a folder that isn't the real path of a workspace the launcher named
 * (404 `unknown_workspace`), and a workspace whose messaging engine is a
 * server (409 `server_engine`, `agent-host.messaging-engine`). No
 * answer and no log line holds the key.
 */
export function paperclipKeyRoutes(deps: PaperclipKeyRouteDeps): HostRoute[] {
  return [
    {
      method: "POST",
      path: "/v1/paperclip/key",
      handle: async (request, response) => {
        if (isFromOtherSite(request)) {
          sendErrorAndHangUp(
            request,
            response,
            403,
            "secret_from_other_site",
            "The agent host takes a Paperclip key only from its own page.",
          );
          return;
        }
        const body = await readCheckedBody(request, response, handOverBody, {
          describeProblems: false,
        });
        if (body === undefined) return;
        const workspace = await namedWorkspace(deps.workspaceRoots, body.workspace);
        if (workspace === undefined) {
          sendError(response, 404, "unknown_workspace", "The host serves no such workspace.");
          return;
        }
        if ((await deps.usesServer?.(workspace)) === true) {
          sendError(response, 409, "server_engine", serverEngineMessage);
          return;
        }
        const binding = { workspace, connection: body.connection };
        try {
          deps.keys.replace(binding, body);
        } catch (error) {
          deps.log?.(`A Paperclip key wasn't kept (${errorName(error)}).\n`);
          sendError(response, 400, "body_invalid", "The request body is not valid.");
          return;
        }
        try {
          await deps.kept?.(binding);
        } catch (error) {
          // No key stays held without a provider that the person can see and disconnect.
          deps.keys.forget(binding);
          deps.log?.(
            `A Paperclip key wasn't kept: its provider didn't start (${errorName(error)}).\n`,
          );
          sendError(response, 502, "provider_not_started", "The connection couldn't be started.");
          return;
        }
        sendJson(response, 200, { kept: true });
      },
    },
  ];
}

/** Only the error's name: the log needs neither its message nor anything from the body. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}
