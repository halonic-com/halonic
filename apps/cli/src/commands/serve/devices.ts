// `halonic serve devices [--revoke <device-id> [--yes]]`: on the computer that runs `halonic
// serve`, lists the paired devices with when each was last seen and who allowed it, and who
// connected or disconnected a Paperclip key when, or signs one device out and offers to sign out
// the devices it allowed (`server.device-pairing`). It talks to the running server over its
// console channel.

import type { DeviceView, KeyChange } from "@halonicjs/host-server";
import { passwordSecretName } from "@halonicjs/host-server";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { type Phrase, plainText } from "../../messages/phrase.ts";
import { serveDevicesMessages } from "../../messages/serve-devices.ts";
import { printable } from "../../output/printable.ts";
import { shownDate } from "../../output/trust-check.ts";
import { clockTime } from "../../run-times.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import type { ServeSetup } from "./serve.ts";
import { askServe, consolePlace, noPasswordError } from "./serve-console.ts";

/** No terminal to answer whether to sign out the devices it allowed. */
class NoAnswer extends Error {}

/**
 * Lists the devices, or with `--revoke` signs one out.
 *
 * @throws KindedError `invalid_input` when no `serve-password` is set; `unavailable` when no
 *   `serve` runs for the workspace
 * @throws OwnLineError `not_found` when `--revoke` names no paired device
 */
export async function serveDevices(
  input: CommandInput,
  context: CommandContext,
  setup: ServeSetup,
): Promise<CommandResult> {
  if ((await context.secrets.get(passwordSecretName)) === null) throw noPasswordError();
  const dir = await openWorkspaceDir(input, context);
  const place = await consolePlace(setup, dir);
  const ask = (request: object) => askServe(setup, place, request);
  const listed = await ask({ op: "devices" });
  const devices = devicesOf(listed);
  const revoke = input.options["revoke"];
  if (typeof revoke !== "string") {
    const keyChanges = keyChangesOf(listed);
    return {
      exitCode: exitCode.ok,
      lines: [
        ...(devices.length === 0
          ? [serveDevicesMessages.noDevices().phrase]
          : devices.map((device) => deviceLine(device, devices))),
        ...keyChanges.map((change) => keyChangeLine(change, devices)),
      ],
      json: { devices, keyChanges },
    };
  }

  const device = devices.find((each) => each.id === revoke);
  const reply = device === undefined ? null : await ask({ op: "revoke", deviceId: device.id });
  if (device === undefined || reply === null || !reply.ok) {
    throw new OwnLineError(
      "not_found",
      serveDevicesMessages.unknownDevice(printable(revoke)),
      serveDevicesMessages.unknownDeviceFix(),
    );
  }
  const lines = [serveDevicesMessages.signedOut(printable(device.name)).phrase];
  const allowed = devicesOf({ ok: true, devices: reply["allowedDevices"] });
  const alsoRevoked: string[] = [];
  if (allowed.length > 0 && (await alsoRevoke(context, input, device, allowed))) {
    for (const each of allowed) {
      if ((await ask({ op: "revoke", deviceId: each.id })).ok) {
        lines.push(serveDevicesMessages.signedOut(printable(each.name)).phrase);
        alsoRevoked.push(each.id);
      }
    }
  } else if (allowed.length > 0) {
    lines.push(
      ...allowedLines(device, allowed),
      serveDevicesMessages.allowedStay(allowed.length).phrase,
    );
  }
  return {
    exitCode: exitCode.ok,
    lines,
    json: { revoked: device.id, allowedDevices: allowed, alsoRevoked },
  };
}

/** Asks whether to sign out the devices `device` allowed; no when nobody can answer. */
async function alsoRevoke(
  context: CommandContext,
  input: CommandInput,
  device: DeviceView,
  allowed: readonly DeviceView[],
): Promise<boolean> {
  try {
    return await context.ask({
      question: serveDevicesMessages.alsoRevokeQuestion(allowed.length),
      shownFirst: allowedLines(device, allowed),
      yes: input.options["yes"] === true,
      refusal: () => new NoAnswer(),
    });
  } catch (error) {
    if (error instanceof NoAnswer) return false;
    throw error;
  }
}

function allowedLines(device: DeviceView, allowed: readonly DeviceView[]): Phrase[] {
  return [
    serveDevicesMessages.allowedDevicesHeading(printable(device.name)).phrase,
    ...allowed.map(
      (each) => serveDevicesMessages.allowedDeviceLine(printable(each.name), each.id).phrase,
    ),
  ];
}

/** "Pixel 9 · last seen 25 Nov · allowed by this computer · device_…". */
function deviceLine(device: DeviceView, devices: readonly DeviceView[]): Phrase {
  return serveDevicesMessages.deviceLine(
    printable(device.name),
    shownDate(device.lastSeenAt),
    allowedByOf(device.allowedBy, devices),
    device.id,
  ).phrase;
}

/** "Paperclip key for halonic connected · 25 Nov 10:31 · by Pixel 9 (device_…)". */
function keyChangeLine(change: KeyChange, devices: readonly DeviceView[]): Phrase {
  const when = `${shownDate(change.at)} ${clockTime(change.at, { now: new Date(change.at) })}`;
  const connection = printable(change.connection);
  const by = changedByOf(change.by, devices);
  return change.change === "connected"
    ? serveDevicesMessages.keyConnected(connection, when, by).phrase
    : serveDevicesMessages.keyDisconnected(connection, when, by).phrase;
}

/** Who changed a key, in words: a browser, or the device by its name and id. */
function changedByOf(by: string, devices: readonly DeviceView[]): string {
  if (by === "browser") return plainText(serveDevicesMessages.byBrowser().phrase);
  const device = devices.find((each) => each.id === by);
  const name =
    device === undefined
      ? plainText(serveDevicesMessages.byGoneDevice().phrase)
      : printable(device.name);
  return `${name} (${printable(by)})`;
}

/** Who allowed a device, in words: the console, a browser, or the device by its name. */
function allowedByOf(allowedBy: string, devices: readonly DeviceView[]): string {
  if (allowedBy === "console") return plainText(serveDevicesMessages.byConsole().phrase);
  if (allowedBy === "browser") return plainText(serveDevicesMessages.byBrowser().phrase);
  const by = devices.find((each) => each.id === allowedBy);
  return by === undefined
    ? plainText(serveDevicesMessages.byGoneDevice().phrase)
    : printable(by.name);
}

/** The devices in a reply; an entry without the fields a line needs is left out. */
function devicesOf(reply: {
  readonly ok: boolean;
  readonly [field: string]: unknown;
}): DeviceView[] {
  const listed = reply.ok && Array.isArray(reply["devices"]) ? reply["devices"] : [];
  return listed.filter(
    (each): each is DeviceView =>
      typeof each === "object" &&
      each !== null &&
      ["id", "name", "allowedBy", "startedAt", "lastSeenAt"].every(
        (field) => typeof (each as Record<string, unknown>)[field] === "string",
      ),
  );
}

/** The key changes in a reply; an entry without the fields a line needs is left out. */
function keyChangesOf(reply: {
  readonly ok: boolean;
  readonly [field: string]: unknown;
}): KeyChange[] {
  const listed = reply.ok && Array.isArray(reply["keyChanges"]) ? reply["keyChanges"] : [];
  return listed.filter(
    (each): each is KeyChange =>
      typeof each === "object" &&
      each !== null &&
      ["connection", "by", "at"].every(
        (field) => typeof (each as Record<string, unknown>)[field] === "string",
      ) &&
      ["connected", "disconnected"].includes(String((each as Record<string, unknown>)["change"])),
  );
}
