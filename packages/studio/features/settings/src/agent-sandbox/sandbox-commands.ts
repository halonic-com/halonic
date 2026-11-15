import type { CommandContribution, WorkspaceContext } from "@halonicjs/studio-shell";
import { AgentSandboxService } from "../api.ts";
import { SandboxFlowService } from "./sandbox-flow.ts";
import * as text from "./sandbox-text.ts";

/**
 * The sandbox command Ctrl K lists (`settings.sandbox-commands`): "Set up the agent sandbox",
 * wherever the app has a sandbox host that can run it. Choosing it is the press: Windows then asks
 * for administrator rights, and a toast says how it ended.
 */
export function sandboxCommands(context?: WorkspaceContext): readonly CommandContribution[] {
  if (context === undefined) return [];
  const host = context.services.find(AgentSandboxService);
  const flow = context.services.find(SandboxFlowService);
  if (host === undefined || !host.available || flow === undefined) return [];
  return [{ id: "settings.sandbox.set-up", title: text.SET_UP_COMMAND, run: () => flow.request() }];
}
