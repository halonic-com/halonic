// The agent host's sandbox in a folder's services: the start check every run
// page and the Inbox read, the sandbox choice, and Settings › Agent sandbox
// when this build offers it. Split from start-studio.ts (HAL-15319).

import { AgentHostSandbox, AgentHostSandboxChoice } from "@halonicjs/adapter-agent-host-client";
import { type ServiceRegistry, sandboxStartCheck, sandboxStartCheckKey } from "@halonicjs/app";
import { SandboxPassesService } from "@halonicjs/studio-feature-inbox/api";
import {
  AgentSandboxService,
  SandboxChoiceHostService,
} from "@halonicjs/studio-feature-settings/api";
import { type TauriIpc, tauriAgentHostTransport } from "@halonicjs/studio-services";
import { AgentHostSandboxFacts } from "./agent-sandbox-host.ts";
import { observedSandboxStartCheck } from "./observed-sandbox-start-check.ts";
import { elevateHelperOf } from "./sandbox-elevate-shell.ts";
import { wslBackupOf } from "./wsl-backup-shell.ts";

/**
 * Whether this build offers Settings › Agent sandbox's setup, repair and removal. D44 is still with
 * the board and the answer for 0.1 is (c): no, so the section reads Not available (HAL-1444,
 * 1.1). Set it to `true` when the board says (a); nothing else changes.
 */
export const agentSandboxOffered = false;

/**
 * Gives the section the agent host's sandbox through the shell, when the build offers it and the
 * shell has an agent host. Without it the section reads Not available.
 */
export async function provideAgentSandbox(
  services: ServiceRegistry,
  window: object,
  ipc: TauriIpc | undefined,
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
  if (agentSandboxOffered)
    services.provide(
      AgentSandboxService,
      new AgentHostSandboxFacts(
        transport,
        undefined,
        undefined,
        () => transport.securityUpdates(),
        ipc === undefined ? undefined : await wslBackupOf(ipc),
        ipc === undefined ? undefined : await elevateHelperOf(ipc),
      ),
    );
}
