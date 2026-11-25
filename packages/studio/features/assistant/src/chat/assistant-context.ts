import type { ServiceLookup, WorkspaceContext } from "@halonicjs/studio-shell";

/**
 * `context` with the Assistant feature's own lookup in place of the caller's. Another feature
 * (workflows, library, agents) calls the Assistant's services with its own context, whose lookup
 * the shell limits to that feature's `needs` and `wants`: none of them list `AssistantHostService`,
 * so the Assistant reads its host through the lookup the shell gave the Assistant itself.
 */
export function withAssistantServices(
  context: WorkspaceContext,
  services: ServiceLookup,
): WorkspaceContext {
  return { ...context, services };
}
