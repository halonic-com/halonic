import { ItemGone, type ItemViewProps, PageBackLinkSlot } from "@halonicjs/studio-shell";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { ConnectorStatusHostService } from "../connector-status-host.ts";
import { ConnectorStatusModel } from "../connector-status-model.ts";
import { ConnectorStatusSection } from "./connector-status-section.tsx";

/**
 * The `connector` item kind's page, kept thin so the full connector page (HAL-751) can replace it
 * without touching the section: the connector's name as the `h1`, then the status section.
 */
export function ConnectorPage({ item, context }: ItemViewProps) {
  const host = context.services.get(ConnectorStatusHostService);
  const model = useMemo(() => new ConnectorStatusModel(host, item.id), [host, item.id]);
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const { loaded, connector } = useSyncExternalStore(subscribe, () => model.state);

  if (loaded && connector === undefined) {
    return (
      <ItemGone
        kindName="connector"
        place="Library"
        onGoTo={() => context.openPlace?.("library")}
      />
    );
  }
  return (
    <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-5 wide:px-6">
      <PageBackLinkSlot />
      <h1 tabIndex={-1} className="text-title [overflow-wrap:anywhere]">
        {connector?.name ?? item.id}
      </h1>
      <ConnectorStatusSection
        model={model}
        announceState={(key, text) => context.announcer.announceState(key, text)}
      />
    </div>
  );
}
