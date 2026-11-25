import type { IncomingMessage, ServerResponse } from "node:http";
import { paperclipOrigin } from "@halonicjs/host-agent-messaging-hub";
import { type Schema, s } from "@halonicjs/schema-kit";
import { listConnectionFiles, type NamedConnection } from "../messaging/connection-file.ts";
import { type HostRoute, sendError, sendErrorAndHangUp, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { namedWorkspace } from "../server/named-workspace.ts";
import { isFromOtherSite } from "../server/other-site.ts";
import { newConnectionName } from "./host-key-store.ts";
import { paperclipConnectionNamePattern } from "./paperclip-key-routes.ts";
import type { PaperclipSignIn, SignInState, StartedSignIn } from "./paperclip-sign-in.ts";

const workspace = s.string().min(1).max(4096);
const signInId = s.string().min(1).max(64);
const startBody = s
  .object({
    workspace,
    address: s.string().min(1).max(2048),
    connection: s.string().regex(paperclipConnectionNamePattern).optional(),
  })
  .strict();
const signInBody = s.object({ signInId }).strict();

/** What the sign-in routes reach. */
export interface PaperclipSignInRouteDeps {
  signIn: PaperclipSignIn;
  /** The workspace folders the launcher named; a sign-in is only for one of them. */
  workspaceRoots: readonly string[];
  /** Where the host writes what failed; never a key. */
  log: (text: string) => void;
}

/**
 * The routes Studio's Connect dialog signs in to Paperclip with
 * (`agent-host.paperclip-sign-in`, ADR 2026-11-24, "Sign-in"). Each refuses a
 * request from another site (403 `secret_from_other_site`, before the body is
 * read), since the approved poll's answer holds the key.
 *
 * - `POST /v1/paperclip/sign-in/start` with `{ workspace, address, connection? }`
 *   signs in for the named connection file, or the one with the same address,
 *   or a new connection named after the address's host. It answers
 *   `{ outcome: "started", signInId, phrase, approvalUrl, expiresAt }`, or
 *   `{ outcome: "refused", reason }` for an address that isn't `https` (nor
 *   plain `http` to this computer) or isn't the named file's, and for an
 *   address where no sign-in could start.
 * - `POST /v1/paperclip/sign-in/poll` with `{ signInId }` answers the
 *   sign-in's state. The first `connected` answer is the only one that holds
 *   the key, with the connection's name, address and company, for Studio's
 *   keychain.
 * - `POST /v1/paperclip/sign-in/confirm` with `{ signInId }` says the keychain
 *   has that key, and answers `{ confirmed }`. A key Studio doesn't confirm
 *   within a minute is revoked, and its sign-in undone.
 * - `POST /v1/paperclip/sign-in/cancel` with `{ signInId }` ends it; after the
 *   approved answer, it revokes the key Studio couldn't keep and undoes it.
 *
 * A failure is 502 `sign_in_failed`; the log names only the error's kind.
 */
export function paperclipSignInRoutes(deps: PaperclipSignInRouteDeps): HostRoute[] {
  const route = <T>(
    path: string,
    schema: Schema<T>,
    run: (body: T) => Promise<{ status: number; body: unknown }>,
  ): HostRoute => ({
    method: "POST",
    path,
    handle: (request, response) => handle(deps, path, schema, run, request, response),
  });
  return [
    route("/v1/paperclip/sign-in/start", startBody, async (body) => {
      const folder = await namedWorkspace(deps.workspaceRoots, body.workspace);
      if (folder === undefined) return unknownWorkspace;
      const started = await start(deps, folder, body);
      if (started.outcome === "refused") return { status: 200, body: started };
      return { status: 200, body: { outcome: "started", ...started.answer } };
    }),
    route("/v1/paperclip/sign-in/poll", signInBody, async (body) => {
      const state = await deps.signIn.poll(body.signInId);
      return { status: 200, body: answerOf(state) };
    }),
    route("/v1/paperclip/sign-in/confirm", signInBody, async (body) => {
      const confirmed = await deps.signIn.confirm(body.signInId);
      return { status: 200, body: { confirmed } };
    }),
    route("/v1/paperclip/sign-in/cancel", signInBody, async (body) => {
      const state = await deps.signIn.cancel(body.signInId);
      return { status: 200, body: answerOf(state) };
    }),
  ];
}

const unknownWorkspace = {
  status: 404,
  body: { error: { kind: "unknown_workspace", message: "The host serves no such workspace." } },
};

type Started =
  | { outcome: "started"; answer: StartedSignIn }
  | { outcome: "refused"; reason: "address-not-allowed" | "unreachable" };

/** Picks the connection the sign-in is for, then starts it. */
async function start(
  deps: PaperclipSignInRouteDeps,
  folder: string,
  body: { address: string; connection?: string | undefined },
): Promise<Started> {
  const address = paperclipOrigin(body.address);
  if (address === undefined) return { outcome: "refused", reason: "address-not-allowed" };
  const files = await listConnectionFiles(folder, paperclipConnectionNamePattern);
  const file = fileFor(files, address, body.connection);
  if (file === "refused") return { outcome: "refused", reason: "address-not-allowed" };
  const name =
    file?.name ??
    newConnectionName(
      address,
      files.map((each) => each.name),
    );
  const companyId = file?.connection.company;
  try {
    const answer = await deps.signIn.start({
      address,
      workspace: folder,
      name,
      ...(companyId === undefined ? {} : { companyId }),
    });
    return { outcome: "started", answer };
  } catch (error) {
    deps.log(`A Paperclip sign-in couldn't start (${errorName(error)}).\n`);
    return { outcome: "refused", reason: "unreachable" };
  }
}

/**
 * The connection file a sign-in is for: the named one, which must have this
 * address; or the one with this address; or none, for a new connection.
 */
function fileFor(
  files: readonly NamedConnection[],
  address: string,
  name: string | undefined,
): NamedConnection | undefined | "refused" {
  const sameAddress = (each: NamedConnection) =>
    paperclipOrigin(each.connection.address) === address;
  if (name === undefined) return files.find(sameAddress);
  const named = files.find((each) => each.name === name);
  return named !== undefined && sameAddress(named) ? named : "refused";
}

/** A state as Studio reads it; only the approved answer holds the key. */
function answerOf(state: SignInState): unknown {
  if (state.status !== "connected") return state;
  return {
    status: "connected",
    connection: state.name,
    address: state.address,
    company: state.companyId,
    key: state.key,
  };
}

async function handle<T>(
  deps: PaperclipSignInRouteDeps,
  path: string,
  schema: Schema<T>,
  run: (body: T) => Promise<{ status: number; body: unknown }>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (isFromOtherSite(request)) {
    sendErrorAndHangUp(
      request,
      response,
      403,
      "secret_from_other_site",
      "The agent host signs in to Paperclip only for its own page.",
    );
    return;
  }
  const body = await readCheckedBody(request, response, schema);
  if (body === undefined) return;
  try {
    const answer = await run(body);
    sendJson(response, answer.status, answer.body);
  } catch (error) {
    deps.log(`Paperclip sign-in failed at ${path} (${errorName(error)}).\n`);
    sendError(response, 502, "sign_in_failed", "The Paperclip sign-in failed.");
  }
}

/** Only the error's name: a message might hold what Paperclip answered. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}
