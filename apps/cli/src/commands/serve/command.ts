import type { CliCommand, CliOption } from "../../command.ts";
import { serveMessages } from "../../messages/serve.ts";
import { serveDevicesMessages } from "../../messages/serve-devices.ts";
import { printable } from "../../output/printable.ts";
import { dirOption, workspaceDir } from "../../workspace-dir.ts";
import { computerRunSetup } from "../run/command.ts";
import { serveDevices } from "./devices.ts";
import { pairDevice } from "./pair.ts";
import { type ServeSetup, serveWorkspace } from "./serve.ts";

const networkOption: CliOption = {
  type: "boolean",
  description: serveMessages.networkOption(),
};

const publicOriginOption: CliOption = {
  type: "string",
  valueName: "origin",
  description: serveMessages.publicOriginOption(),
};

const portOption: CliOption = {
  type: "string",
  valueName: "port",
  description: serveMessages.portOption(),
};

/**
 * `halonic serve`, with the setup passed in so tests can fix the clock, the
 * profile folder, the trust records and the password hasher.
 */
export function serveCommandWith(setup: ServeSetup): CliCommand {
  return {
    name: "serve",
    usage: "[--dir <folder>] [--network | --public-origin <origin>] [--port <port>]",
    summary: serveMessages.summary(),
    action: (input, context) =>
      serveMessages.action(printable(workspaceDir(input, context.cwd).name)),
    options: {
      dir: dirOption,
      network: networkOption,
      "public-origin": publicOriginOption,
      port: portOption,
    },
    run: (input, context) => serveWorkspace(input, context, setup),
    subcommands: [
      {
        name: "pair",
        usage: "[--dir <folder>]",
        summary: serveDevicesMessages.pairSummary(),
        action: (input, context) =>
          serveDevicesMessages.pairAction(printable(workspaceDir(input, context.cwd).name)),
        options: { dir: dirOption },
        run: (input, context) => pairDevice(input, context, setup),
      },
      {
        name: "devices",
        usage: "[--revoke <device-id> [--yes]] [--dir <folder>]",
        summary: serveDevicesMessages.devicesSummary(),
        action: (input, context) =>
          serveDevicesMessages.devicesAction(printable(workspaceDir(input, context.cwd).name)),
        options: {
          revoke: {
            type: "string",
            valueName: "device-id",
            description: serveDevicesMessages.revokeOption(),
          },
          yes: { type: "boolean", description: serveDevicesMessages.yesOption() },
          dir: dirOption,
        },
        run: (input, context) => serveDevices(input, context, setup),
      },
    ],
  };
}

/** `halonic serve`: opens the trusted workspace to your phone or browser until Ctrl C. */
export const serveCommand: CliCommand = serveCommandWith(computerRunSetup);
