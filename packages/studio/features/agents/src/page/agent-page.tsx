import type { ItemViewProps } from "@halonicjs/studio-shell";
import { AgentsHostService } from "../api.ts";

/**
 * The agent's tab. It shows the agent's name until the page with its stacked cards and
 * Configuration lands in the next pull request, so a newly created agent opens in a tab.
 */
export function AgentPage({ item, context }: ItemViewProps) {
  const name = context.services.get(AgentsHostService).nameOf({ hubId: item.hub, id: item.id });
  return (
    <div className="flex w-full flex-col gap-4 px-6 py-5">
      <h1 className="text-title">{name ?? item.id}</h1>
    </div>
  );
}
