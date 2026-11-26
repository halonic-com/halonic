// The agent host's sandbox in a folder's services: the start check every run
// page and the Inbox read, the sandbox choice, and Settings › Agent sandbox
// when this build offers it. Split from start-studio.ts (HAL-15319).

import {
  AgentHostSandbox,
  AgentHostSandboxChoice,
  type AgentHostTransport,
  thisComputerOffered,
} from "@halonicjs/adapter-agent-host-client";
import { type ServiceRegistry, sandboxStartCheck, sandboxStartCheckKey } from "@halonicjs/app";
import { SandboxPassesService } from "@halonicjs/studio-feature-inbox/api";
import {
  AgentSandboxService,
  SandboxChoiceHostService,
} from "@halonicjs/studio-feature-settings/api";
import { type TauriIpc, tauriAgentHostTransport } from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { AgentHostSandboxFacts } from "./agent-sandbox-host.ts";
import { observedSandboxStartCheck } from "./observed-sandbox-start-check.ts";
import { elevateHelperOf } from "./sandbox-elevate-shell.ts";
import { wslSetupOf } from "./sandbox-wsl-setup-shell.ts";
import { wslBackupOf } from "./wsl-backup-shell.ts";

/**
 * Whether Studio on this operating system offers Settings › Agent sandbox's setup, repair and
 * removal. The board said yes to D44 for Windows only (HAL-16772, 23 Nov), so on macOS and Linux
 * the section still reads Not available (HAL-1444, 1.1).
 */
export function agentSandboxOffered(platform: KeyboardPlatform): boolean {
  return platform === "windows";
}

/**
 * Gives the section the agent host's sandbox through the shell, when Studio offers it on this
 * `platform` and the shell has an agent host. Without it the section reads Not available. On
 * Windows with the host in Halonic's WSL distro, **Set up** runs the WSL setup through the shell
 * (HAL-16765).
 */
export async function provideAgentSandbox(
  services: ServiceRegistry,
  window: object,
  ipc: TauriIpc | undefined,
  platform: KeyboardPlatform,
): Promise<void> {
  const transport = tauriAgentHostTransport(window);
  if (transport === undefined) return;
  // The start check only reads: "Check again" on a run page and in the Inbox works whether or not
  // this build offers the section's setup (D44).
  const { check, passes } = observedSandboxStartCheck(
    sandboxStartCheck(async () => (await AgentHostSandbox.connect(transport)).check()),
  );
  services.provide(sandboxStartCheckKey, check);
  services.provide(SandboxPassesService, passes);
  // The host only reads the choice; the shell checks and saves it (HAL-14510). Nothing shows it
  // until the real canary lands (HAL-10552, UX W3); until then every trust check fails closed.
  const saveChoice = transport.saveSandboxChoice.bind(transport);
  services.provide(SandboxChoiceHostService, new AgentHostSandboxChoice(transport, saveChoice));
  if (agentSandboxOffered(platform))
    services.provide(
      AgentSandboxService,
      new AgentHostSandboxFacts(
        transport,
        undefined,
        undefined,
        () => transport.securityUpdates(),
        ipc === undefined ? undefined : await wslBackupOf(ipc),
        ipc === undefined ? undefined : await elevateHelperOf(ipc),
        // Not awaited: the host may still be starting, and the folder opens without it (HAL-19599).
        studioStartsUnfencedOn(transport),
        ipc === undefined ? undefined : await wslSetupOf(ipc),
      ),
    );
}

/**
 * Whether the agent host opens sessions on this computer, once it answers. A host that can't say
 * counts as one that doesn't: the section then keeps its hint that Studio can't start such an agent, the
 * cautious answer, and the error goes to the console.
 */
async function studioStartsUnfencedOn(transport: AgentHostTransport): Promise<boolean> {
  try {
    return await thisComputerOffered(transport);
  } catch (error) {
    console.error("Asking the agent host about sessions on this computer", error);
    return false;
  }
}
