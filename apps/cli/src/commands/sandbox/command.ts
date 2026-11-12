import type { SandboxRemoval, SandboxSetup } from "@halonicjs/adapter-sandbox-srt";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { profileFolder } from "@halonicjs/profile";
import type { CliCommand } from "../../command.ts";
import { sandboxSetupMessages } from "../../messages/sandbox-setup.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { removeSandbox, setUpSandbox } from "./setup.ts";

/** What the commands need of the sandbox, so tests can hand in a fake one. */
export interface SandboxSetter {
  readonly platform: NodeJS.Platform;
  setUp(): Promise<SandboxSetup>;
  remove(): Promise<SandboxRemoval>;
  /** Folders other programs may keep write access to in this sandbox, for the warning before `remove`; `unknown` when it can't be told. */
  otherUse(): Promise<{ folders: string[]; unknown: boolean }>;
}

const yes = { type: "boolean", description: sandboxSetupMessages.yesOption() } as const;

/**
 * `halonic sandbox setup` and `halonic sandbox remove`, on the sandbox
 * `sandbox` makes. They exist because the agent sandbox on Windows needs a
 * one-time setup with administrator rights, which Studio and the installer
 * run through the same `SrtSandbox.setUp` (HAL-1451). Neither is ever
 * offered to an agent or a harness as a tool (HAL-1415, risk 6), and both
 * ask before they start unless given `--yes`.
 */
export function sandboxCommandWith(sandbox: () => SandboxSetter): CliCommand {
  return {
    name: "sandbox",
    usage: "",
    summary: sandboxSetupMessages.summary(),
    options: {},
    subcommands: [
      {
        name: "setup",
        usage: "[--yes]",
        summary: sandboxSetupMessages.setupSummary(),
        action: () => sandboxSetupMessages.setupAction(),
        options: { yes },
        run: (input, context) => setUpSandbox(input, context, sandbox()),
      },
      {
        name: "remove",
        usage: "[--yes]",
        summary: sandboxSetupMessages.removeSummary(),
        action: () => sandboxSetupMessages.removeAction(),
        options: { yes },
        run: (input, context) => removeSandbox(input, context, sandbox()),
      },
    ],
  };
}

/** `halonic sandbox`: set up or remove the agent sandbox on this computer. */
export const sandboxCommand: CliCommand = sandboxCommandWith(() => {
  const srt = new SrtSandbox();
  return {
    platform: process.platform,
    setUp: () => srt.setUp(),
    remove: () => srt.remove(),
    // Everything Halonic works in is in its profile folder; any other kept grant isn't ours.
    otherUse: () => srt.otherUse([profileFolder(nodeProfileEnvironment()).root]),
  };
});
