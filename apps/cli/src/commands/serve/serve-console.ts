// The console channel between `halonic serve` and `halonic serve pair` / `halonic serve devices`
// (`server.device-pairing`): a Unix socket in the profile folder, one per workspace, that only
// the user who runs the server can open (`runtime.console-socket`). `serve` answers on it with the device
// console over the engine's own coordination, so what the console allows or revokes is what the
// server's routes see. `halonic run` hands it a run to start while `serve` holds the engine.

import { realpath } from "node:fs/promises";
import type { RoutineEngine } from "@halonicjs/engine";
import { createDeviceConsole } from "@halonicjs/host-server";
import { profileFolder, workspaceFolders } from "@halonicjs/profile";
import { KindedError } from "@halonicjs/std";
import {
  ConsoleNotRunningError,
  ConsoleSocketError,
  callConsoleSocket,
  consoleSocketPath,
  listenOnConsoleSocket,
} from "@halonicjs/target-node-runtime";
import type { CommandContext } from "../../command.ts";
import type { Message } from "../../messages/define.ts";
import { type Phrase, plainText } from "../../messages/phrase.ts";
import { serveMessages } from "../../messages/serve.ts";
import { serveDevicesMessages } from "../../messages/serve-devices.ts";
import { printable } from "../../output/printable.ts";
import type { OpenWorkspaceDir } from "../../workspace-dir.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "../../workspace-runs.ts";
import type { ServeSetup } from "./serve.ts";
import { answerStartRun, type ServedRunStarts } from "./serve-run-start.ts";

/** What finds the console: the profile it is in, and how it is reached. */
type ConsoleSetup = Pick<ServeSetup, "profile" | "console">;

/** How `serve` offers its console and the console commands reach it; the Unix socket by default. */
export interface ConsoleTransport {
  /** Answers each request that comes in at `place`, the workspace's console socket. */
  listen(
    place: string,
    answer: (request: unknown) => Promise<unknown>,
    logError: (error: unknown) => void,
  ): Promise<{ close(): Promise<void> }>;
  /** Sends one request to the `serve` listening at `place` and gives its reply. */
  call(place: string, request: unknown): Promise<unknown>;
}

/** The console over the Unix socket in the profile folder. */
export const socketConsole: ConsoleTransport = {
  listen: (place, answer, logError) => listenOnConsoleSocket({ path: place, answer, logError }),
  call: (place, request) => callConsoleSocket(place, request),
};

/** Where the workspace's console socket is: in the profile, named by the workspace's key. */
export async function consolePlace(setup: ConsoleSetup, dir: OpenWorkspaceDir): Promise<string> {
  const profile = profileFolder(setup.profile ?? nodeProfileEnvironment());
  const folders = await workspaceFolders(profile, await realpath(dir.root), webCryptoDigest);
  return consoleSocketPath(profile.root, folders.key);
}

/** The console of a running `serve`, open or not. */
export interface ServeConsole {
  /** The `!` line for stderr when it couldn't open, or `null`. */
  readonly warning: Phrase | null;
  close(): Promise<void>;
}

/**
 * Opens the console of a running `serve`. When it can't open, `serve` goes on serving and gives
 * why as a `!` line: only pairing and the device list need it. On Windows there's no line, since
 * the commands themselves say they don't work there yet.
 */
export async function openServeConsole(
  context: CommandContext,
  setup: ServeSetup,
  dir: OpenWorkspaceDir,
  engine: Pick<RoutineEngine, "coordination" | "clock">,
  runStarts: ServedRunStarts,
): Promise<ServeConsole> {
  const console = createDeviceConsole({
    coordination: engine.coordination,
    clock: engine.clock,
    secrets: context.secrets,
  });
  const transport = setup.console ?? socketConsole;
  // A failed console request goes to `--debug`, as a failed HTTP request does.
  const logError = (error: unknown): void =>
    context.debug(serveMessages.requestFailed(messageOf(error)).phrase);
  // A run `halonic run` hands over starts here; every other request is the device console's.
  const answer = async (request: unknown): Promise<unknown> =>
    (await answerStartRun(runStarts, request, logError)) ?? (await console.answer(request));
  try {
    const place = await consolePlace(setup, dir);
    const open = await transport.listen(place, answer, logError);
    return { warning: null, close: () => open.close() };
  } catch (error) {
    // Any failure here, a refused folder or one the system won't let `serve` make (`EACCES`,
    // `ENOTDIR`), costs only the console: `serve` goes on serving and says why.
    return { warning: notOpenedWarning(error), close: async () => undefined };
  }
}

/** The `!` line for a console that couldn't open, or `null` on Windows. */
function notOpenedWarning(error: unknown): Phrase | null {
  if (!(error instanceof ConsoleSocketError)) {
    return serveDevicesMessages.consoleNotOpened(messageOf(error)).phrase;
  }
  if (error.reason === "windows") return null;
  return serveDevicesMessages.consoleNotOpened(plainText(reasonOf(error).phrase)).phrase;
}

/** An error's own message, safe to print. */
function messageOf(error: unknown): string {
  return printable(error instanceof Error ? error.message : String(error));
}

/** Why the console can't be used, as the end of a "Couldn't …:" line. */
function reasonOf(error: ConsoleSocketError): Message {
  switch (error.reason) {
    case "windows":
      return serveDevicesMessages.noConsoleOnWindows();
    case "path-too-long":
      return serveDevicesMessages.consolePathTooLong();
    case "folder-not-private":
    case "not-our-socket":
      return serveDevicesMessages.consoleNotPrivate(printable(error.folder));
    case "parent-not-private":
      return serveDevicesMessages.consoleParentNotPrivate(printable(error.folder));
  }
}

/** A console reply: `ok`, and the operation's fields or the refusal's `reason`. */
export type ServeAnswer = { readonly ok: boolean } & Readonly<Record<string, unknown>>;

/**
 * Sends one request to the workspace's running `serve` and gives its reply, refusals turned into
 * the errors the person reads.
 *
 * @throws KindedError `unavailable` when no `serve` runs for the workspace, or the console can't
 *   be used here; `invalid_input` when no `serve-password` is set
 */
export async function askServe(
  setup: ConsoleSetup,
  place: string,
  request: object,
): Promise<ServeAnswer> {
  let reply: unknown;
  try {
    reply = await (setup.console ?? socketConsole).call(place, request);
  } catch (error) {
    // A call can't open the socket here: on Windows, or with a path too long for one.
    if (error instanceof ConsoleSocketError) throw failure("unavailable", reasonOf(error));
    if (!(error instanceof ConsoleNotRunningError)) throw error;
    reply = null;
  }
  if (!isAnswer(reply)) {
    throw failure(
      "unavailable",
      serveDevicesMessages.notServing(),
      serveDevicesMessages.notServingFix(),
    );
  }
  if (!reply.ok && reply["reason"] === "no-password") throw noPasswordError();
  return reply;
}

function isAnswer(reply: unknown): reply is ServeAnswer {
  return (
    typeof reply === "object" && reply !== null && typeof (reply as ServeAnswer).ok === "boolean"
  );
}

/** No `serve-password` is set, so no device can pair or be listed. */
export function noPasswordError(): KindedError {
  return failure(
    "invalid_input",
    serveDevicesMessages.noPassword(),
    serveDevicesMessages.noPasswordFix(),
  );
}

function failure(
  kind: "unavailable" | "invalid_input",
  reason: Message,
  fix?: Message,
): KindedError {
  return new KindedError(
    kind,
    plainText(reason.phrase),
    fix === undefined ? {} : { fix: plainText(fix.phrase) },
  );
}
