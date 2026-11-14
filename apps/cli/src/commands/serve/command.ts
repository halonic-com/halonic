import type { CliCommand, CliOption } from "../../command.ts";
import { serveMessages } from "../../messages/serve.ts";
import { printable } from "../../output/printable.ts";
import { dirOption, workspaceDir } from "../../workspace-dir.ts";
import { computerRunSetup } from "../run/command.ts";
import { type ServeSetup, serveWorkspace } from "./serve.ts";

const networkOption: CliOption = {
  type: "boolean",
  description: serveMessages.networkOption(),
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
    usage: "[--dir <folder>] [--network] [--port <port>]",
    summary: serveMessages.summary(),
    action: (input, context) =>
      serveMessages.action(printable(workspaceDir(input, context.cwd).name)),
    options: { dir: dirOption, network: networkOption, port: portOption },
    run: (input, context) => serveWorkspace(input, context, setup),
  };
}

/** `halonic serve`: opens the trusted workspace to your phone or browser until Ctrl C. */
export const serveCommand: CliCommand = serveCommandWith(computerRunSetup);
