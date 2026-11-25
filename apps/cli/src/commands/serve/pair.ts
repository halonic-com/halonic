// `halonic serve pair`: on the computer that runs `halonic serve`, shows a one-time pairing code,
// then asks Allow for each device that sends a code, showing its name and check code
// (`server.device-pairing`). It talks to the running server over its console channel, so a
// device it allows is allowed by `console`.

import { setTimeout as sleep } from "node:timers/promises";
import type { PairingRequestView } from "@halonicjs/host-server";
import { pairingLifetimeMs, passwordSecretName } from "@halonicjs/host-server";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  type JsonFields,
  type StoppedResult,
  UsageError,
} from "../../command.ts";
import { type ExitCode, exitCode } from "../../exit-code.ts";
import type { Phrase } from "../../messages/phrase.ts";
import { serveDevicesMessages } from "../../messages/serve-devices.ts";
import { printable } from "../../output/printable.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import type { ServeSetup } from "./serve.ts";
import { askServe, consolePlace, noPasswordError, type ServeAnswer } from "./serve-console.ts";

/** How often the waiting requests are read while the code is live. */
const pollMs = 500;

/** A request the person may allow, its outside text made printable. */
interface ShownRequest {
  readonly id: string;
  readonly device: string;
  readonly checkCode: string;
}

/**
 * Shows a new code and waits for a device to use it, until one is allowed, the person says no,
 * the code runs out, or Ctrl C.
 *
 * @throws KindedError `invalid_input` when no `serve-password` is set; `unavailable` when no
 *   `serve` runs for the workspace
 * @throws UsageError when a device asks and there is no terminal to allow it in
 */
export async function pairDevice(
  input: CommandInput,
  context: CommandContext,
  setup: ServeSetup,
): Promise<CommandResult | StoppedResult> {
  if ((await context.secrets.get(passwordSecretName)) === null) throw noPasswordError();
  const dir = await openWorkspaceDir(input, context);
  const place = await consolePlace(setup, dir);
  const made = await askServe(setup, place, { op: "code" });
  const code = typeof made["code"] === "string" ? made["code"] : "";
  // The server ends the code on its own clock; this only stops waiting for it.
  const waitUntil = Date.now() + pairingLifetimeMs;
  // Printed as they happen, and returned again first in the result, as `printAhead` asks.
  const lines: Phrase[] = [];
  const say = (line: Phrase): void => {
    context.printAhead(line);
    lines.push(line);
  };
  const end = (exit: ExitCode, last: Phrase, json: JsonFields): CommandResult => ({
    exitCode: exit,
    lines: [...lines, last],
    json,
  });
  say(serveDevicesMessages.pairingCode(`${code.slice(0, 4)}-${code.slice(4)}`).phrase);
  say(serveDevicesMessages.pairingCodeHelp().phrase);

  const asked = new Set<string>();
  while (Date.now() < waitUntil) {
    if (!(await pause(context.signal))) return { stopped: true, json: { allowed: false } };
    const waiting = waitingOf(await askServe(setup, place, { op: "waiting" }));
    for (const request of waiting.filter((each) => !asked.has(each.id))) {
      asked.add(request.id);
      const answered = await answerRequest(context, setup, place, request);
      if (answered === null) say(serveDevicesMessages.requestGone(request.device).phrase);
      else return end(answered.exit, answered.line, { allowed: answered.allowed });
    }
  }
  return end(exitCode.failed, serveDevicesMessages.codeRanOut().phrase, { allowed: false });
}

/** How one request was answered, or `null` when it ran out before the Allow reached it. */
async function answerRequest(
  context: CommandContext,
  setup: ServeSetup,
  place: string,
  request: ShownRequest,
): Promise<{ exit: ExitCode; line: Phrase; allowed: boolean } | null> {
  if (!(await allowed(context, request))) {
    const line = serveDevicesMessages.notAllowed(request.device).phrase;
    return { exit: exitCode.failed, line, allowed: false };
  }
  const reply = await askServe(setup, place, { op: "allow", requestId: request.id });
  if (!reply.ok) return null;
  return {
    exit: exitCode.ok,
    line: serveDevicesMessages.allowed(request.device).phrase,
    allowed: true,
  };
}

/** Waits one poll; `false` once Ctrl C or SIGTERM stopped the command. */
async function pause(signal: AbortSignal): Promise<boolean> {
  try {
    await sleep(pollMs, undefined, { signal });
    return true;
  } catch {
    return false;
  }
}

/** Asks Allow for one request, its check code shown first. */
function allowed(context: CommandContext, request: ShownRequest): Promise<boolean> {
  return context.ask({
    question: serveDevicesMessages.allowQuestion(request.device),
    shownFirst: [serveDevicesMessages.requestShown(request.device, request.checkCode).phrase],
    yes: false,
    refusal: () =>
      new UsageError(
        serveDevicesMessages.allowNoTerminal(),
        serveDevicesMessages.allowNoTerminalFix(),
      ),
  });
}

/** The waiting requests in a reply, each name and check code made printable. */
function waitingOf(reply: ServeAnswer): ShownRequest[] {
  const waiting = reply.ok && Array.isArray(reply["waiting"]) ? reply["waiting"] : [];
  return (waiting as PairingRequestView[]).map((request) => ({
    id: String(request.id),
    device: printable(String(request.deviceName)),
    checkCode: printable(String(request.checkCode)),
  }));
}
