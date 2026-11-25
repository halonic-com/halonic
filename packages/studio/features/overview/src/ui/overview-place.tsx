import type { PlaceViewProps } from "@halonicjs/studio-shell";
import { OverviewMessagingService, OverviewService, RecapService } from "../api.ts";
import { OverviewView } from "./overview-view.tsx";
import { RecapView } from "./recap-view.tsx";

/**
 * The Overview place under the sidebar's Team group: the recap since the person last opened it,
 * then who works on what and which work is blocked. Without `AgentMessaging` (no source
 * connected in this Studio) it reads nothing and says there are no agents yet.
 */
export function OverviewPlace({ context }: PlaceViewProps) {
  const connected = context.services.find(OverviewMessagingService) !== undefined;
  return (
    <div className="flex w-full flex-col gap-4 px-2 py-5 phone:px-0">
      <h1 tabIndex={-1} className="px-4 text-title">
        Overview
      </h1>
      {connected ? (
        <>
          <RecapView store={context.services.get(RecapService)} />
          <OverviewView store={context.services.get(OverviewService)} />
        </>
      ) : (
        <p className="px-4 text-fg-muted">No agents yet.</p>
      )}
    </div>
  );
}
