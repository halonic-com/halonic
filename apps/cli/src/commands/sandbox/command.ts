import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import type { SandboxRemoval, SandboxSetup } from "@halonicjs/adapter-sandbox-srt";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { TrustStore } from "@halonicjs/ports";
import { profileFolder, trustFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import type { CliCommand } from "../../command.ts";
import { sandboxSetupMessages } from "../../messages/sandbox-setup.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { cliTrustService } from "../../workspace-trust.ts";
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
    otherUse: () => {
      const profile = profileFolder(nodeProfileEnvironment());
      return otherUseBesidesHalonic(srt, profile.root, new FileTrustStore(trustFolder(profile)));
    },
  };
});

/**
 * The kept grants outside the folders Halonic works in: its profile folder
 * (temp and proposal folders) and the workspaces the user trusted, since an
 * agent works in a workspace itself and a session that didn't close cleanly
 * leaves its grant there. When the trusted workspaces can't be read, which
 * grants are Halonic's can't be told, so the answer is `unknown`.
 */
export async function otherUseBesidesHalonic(
  srt: { otherUse(known: readonly string[]): Promise<{ folders: string[]; unknown: boolean }> },
  profileRoot: string,
  trust: TrustStore,
): Promise<{ folders: string[]; unknown: boolean }> {
  try {
    const trusted = await cliTrustService(trust, systemClock).list();
    return await srt.otherUse([profileRoot, ...trusted.map((record) => record.location)]);
  } catch {
    return { folders: [], unknown: true };
  }
}
