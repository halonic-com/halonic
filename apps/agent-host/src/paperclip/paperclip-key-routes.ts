import { s } from "@halonicjs/schema-kit";
import { type HostRoute, sendError, sendErrorAndHangUp, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { isFromOtherSite } from "../server/other-site.ts";
import type { PaperclipKeys } from "./paperclip-keys.ts";

/**
 * A connection's name: its file name without `.yaml`. Studio keeps the key in
 * the keychain under a name built from it, so it follows the keychain's rule.
 */
export const paperclipConnectionNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

/** What Studio hands over. A key is what a header can carry, so a line break can't split it. */
const handOverBody = s
  .object({
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
  /** Where the host writes what failed; never a key. */
  log?: ((text: string) => void) | undefined;
}

/**
 * The route Studio hands a Paperclip key over with, when the person connects
 * (ADR 2026-11-24, agent messaging; `agent-host.paperclip-key-hand-over`).
 *
 * `POST /v1/paperclip/key` with `{ connection, key, address, company }`
 * answers `{ kept: true }` and keeps the key in memory only, with the address
 * and company it was made for, replacing the one held for the connection.
 * Keeping it calls nobody: only a request the provider sends through the
 * guard does.
 *
 * It refuses, keeping nothing: a `Sec-Fetch-Site` other than `same-origin`
 * (403 `secret_from_other_site`, before the body is read), and a body that
 * doesn't fit or an address that isn't `http` or `https` (400 `body_invalid`,
 * with no detail, as the body holds the key). No answer and no log line holds
 * the key.
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
        try {
          deps.keys.replace(body.connection, body);
        } catch (error) {
          deps.log?.(`A Paperclip key wasn't kept (${errorName(error)}).\n`);
          sendError(response, 400, "body_invalid", "The request body is not valid.");
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
