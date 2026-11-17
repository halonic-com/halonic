import {
  engineWordsOf,
  ItemGone,
  type ItemViewProps,
  PageBackLinkSlot,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { takeConnectorTitleFocus } from "../connector-focus-request.ts";
import { ConnectorStatusHostService } from "../connector-status-host.ts";
import { ConnectorStatusModel } from "../connector-status-model.ts";
import { itemFileRef } from "../item-file.ts";
import { ListedToolsHostService } from "../listed-tools-host.ts";
import { ListedToolsReviewModel } from "../listed-tools-review-model.ts";
import { asksFirstWords, connectorPageWords, connectorToolsWords } from "../new-connector-words.ts";
import { ConnectorConnectionSummary } from "./connector-connection-summary.tsx";
import { ConnectorStatusSection } from "./connector-status-section.tsx";
import { useItemTrash } from "./item-trash.tsx";
import { sharedHubKey } from "./library-place.tsx";
import { ListedToolsWaiting } from "./listed-tools-waiting.tsx";

/**
 * The `connector` item kind's page, kept thin so the full connector page (HAL-751) can replace it
 * without touching the section: the connector's name as the `h1`, then how it connects, then the status section, then the sections other features add
 * (the Google block, for a Google connector).
 */
export function ConnectorPage({ item, context, Sections }: ItemViewProps) {
  const host = context.services.get(ConnectorStatusHostService);
  const model = useMemo(() => new ConnectorStatusModel(host, item.id), [host, item.id]);
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const { loaded, connector } = useSyncExternalStore(subscribe, () => model.state);
  const listedTools = context.services.find(ListedToolsHostService);
  const toolsModel = useMemo(
    () =>
      listedTools === undefined ? undefined : new ListedToolsReviewModel(listedTools, item.id),
    [listedTools, item.id],
  );
  const { openItem } = context;
  const title = useRef<HTMLHeadingElement | null>(null);
  const trash = useItemTrash(context, {
    kind: "connector",
    hub: item.hub === sharedHubKey ? null : item.hub,
    id: item.id,
    name: connector?.name ?? item.id,
  });
  const titleRef = useCallback(
    (element: HTMLHeadingElement | null) => {
      title.current = element;
      trash.titleRef(element);
    },
    [trash.titleRef],
  );
  const ready = loaded && connector !== undefined;
  // A connector just made in New connector opens with its name focused, so a screen reader reads it.
  useEffect(() => {
    if (
      ready &&
      takeConnectorTitleFocus({ hub: item.hub === sharedHubKey ? null : item.hub, id: item.id })
    ) {
      title.current?.focus();
    }
  }, [ready, item.hub, item.id]);

  if (loaded && connector === undefined) {
    return (
      trash.strip ?? (
        <ItemGone
          kindName={connectorPageWords.kindName}
          place={connectorPageWords.place}
          onGoTo={() => context.openPlace?.("library")}
        />
      )
    );
  }
  return (
    <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-5 wide:px-6">
      <PageBackLinkSlot />
      <div className="flex items-start justify-between gap-2">
        <h1 ref={titleRef} tabIndex={-1} className="text-title [overflow-wrap:anywhere]">
          {connector?.name ?? item.id}
        </h1>
        {trash.menu}
      </div>
      {connector?.asks === undefined ? null : (
        <div className="flex flex-col gap-1">
          <p className="text-body text-fg-muted">
            {connector.asks === "every-tool"
              ? connectorToolsWords.line
              : asksFirstWords[connector.asks]}
          </p>
          {connector.asks === "every-tool" && openItem !== undefined && (
            <button
              type="button"
              className="self-start text-small text-fg-muted underline"
              onClick={() =>
                openItem(
                  itemFileRef("connector", {
                    hub: item.hub === sharedHubKey ? null : item.hub,
                    id: item.id,
                  }),
                )
              }
            >
              {connectorToolsWords.changeInFile}
            </button>
          )}
        </div>
      )}
      {toolsModel === undefined ? null : (
        <ListedToolsWaiting model={toolsModel} sourceName={connector?.name ?? item.id} />
      )}
      {connector?.connection === undefined ? null : (
        <ConnectorConnectionSummary connection={connector.connection} />
      )}
      <ConnectorStatusSection
        model={model}
        words={engineWordsOf(context)}
        announceState={(key, text) => context.announcer.announceState(key, text)}
      />
      <Sections />
    </div>
  );
}
