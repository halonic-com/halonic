import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { sandboxView } from "./agent-sandbox/sandbox-state.ts";
import { AgentSandboxService, HostSettingsService } from "./api.ts";
import { assistantPrefs } from "./assistant/assistant-prefs.ts";
import { providerDefaults } from "./assistant/assistant-providers.ts";

/**
 * The line under Assistant in the phone's list: "Not set up", else the model (or the provider
 * when no model is named) and the turn limit, "smart · turn limit 16".
 */
export function assistantSummary(context: WorkspaceContext): string {
  const settings = context.services.get(HostSettingsService);
  const provider = settings.get(assistantPrefs.provider);
  if (provider === "not-set-up") {
    return providerDefaults[provider].label;
  }
  const model = settings.get(assistantPrefs.model) || providerDefaults[provider].label;
  return `${model} · turn limit ${settings.get(assistantPrefs.turnLimit)}`;
}

/**
 * The line under Agent sandbox in the phone's list: the state chip's words ("Ready"), or nothing
 * when the app has no sandbox host or its check fails, so the row keeps its name alone.
 */
export async function agentSandboxSummary(context: WorkspaceContext): Promise<string | undefined> {
  const host = context.services.find(AgentSandboxService);
  if (host === undefined) {
    return undefined;
  }
  if (!host.available) {
    return sandboxView({
      available: false,
      place: "app",
      check: { state: "unknown", reason: "" },
      running: null,
      outcome: null,
    }).chip?.label;
  }
  const check = await host.check();
  return sandboxView({ available: true, place: "app", check, running: null, outcome: null }).chip
    ?.label;
}
