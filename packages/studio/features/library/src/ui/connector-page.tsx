import { reviewToolsCommand } from "@halonicjs/app";
import { Button, usePresentation } from "@halonicjs/studio-kit";
import {
  engineWordsOf,
  ItemGone,
  type ItemViewProps,
  PageBackLinkSlot,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { takeConnectorTitleFocus } from "../connector-focus-request.ts";
import { type ConnectorSecrets, ConnectorSecretsService } from "../connector-secrets-host.ts";
import { ConnectorStatusHostService } from "../connector-status-host.ts";
import { ConnectorStatusModel, type ConnectorStatusState } from "../connector-status-model.ts";
import { itemFileRef } from "../item-file.ts";
import { LibraryItemsHostService } from "../library-items-host.ts";
import { ListedToolsHostService } from "../listed-tools-host.ts";
import { ListedToolsReviewModel } from "../listed-tools-review-model.ts";
import { asksFirstWords, connectorPageWords, connectorToolsWords } from "../new-connector-words.ts";
import { ConnectorConnectionSummary } from "./connector-connection-summary.tsx";
import { ConnectorSecretsSection } from "./connector-secrets-section.tsx";
import { ConnectorStatusSection } from "./connector-status-section.tsx";
import { useItemTrash } from "./item-trash.tsx";
import { sharedHubKey } from "./library-place.tsx";
import { ListedToolsElsewhere } from "./listed-tools-elsewhere.tsx";
import { ListedToolsWaiting, type ListedToolsWaitingProps } from "./listed-tools-waiting.tsx";

/** The command that opens the workspace page at Trust, where the trust check is (Settings' **Open Trust** runs it too). */
const openTrustCommand = "workspace.open-trust";

/**
 * The line about the connector's listed tools: how many wait for approval, or for an MCP server
 * over HTTP, which Studio can't list yet, the command that reviews them. It waits for the status,
 * which says whether the server is over HTTP; if the status host can't answer, the waiting line
 * shows as before.
 */
function ListedToolsLine({
  status,
  folder,
  ...waiting
}: ListedToolsWaitingProps & {
  readonly status: ConnectorStatusState;
  readonly folder: string | undefined;
}) {
  if (!status.loaded && status.error === undefined) return null;
  if (status.connector?.connection?.kind === "http") {
    return <ListedToolsElsewhere command={reviewToolsCommand(folder, status.connector.id)} />;
  }
  return <ListedToolsWaiting {...waiting} />;
}

/**
 * The store and names for the page's Secrets section, or `undefined` for none: only the desktop
 * app can write the keychain a connector's program reads its secrets from (HAL-14995), a phone
 * only views, and a connector that starts no program or declares no secret has nothing to set.
 */
function secretsSectionOf(
  context: ItemViewProps["context"],
  connector: ConnectorStatusState["connector"],
): { readonly secrets: ConnectorSecrets; readonly names: readonly string[] } | undefined {
  const secrets =
    context.host === "phone" ? undefined : context.services.find(ConnectorSecretsService);
  const connection = connector?.connection;
  if (secrets === undefined || connection?.kind !== "stdio" || connection.secrets.length === 0) {
    return undefined;
  }
  return { secrets, names: connection.secrets };
}

/** The page's Secrets section, when {@link secretsSectionOf} gives one. */
function SecretsPart({
  section,
  sourceName,
}: {
  readonly section: ReturnType<typeof secretsSectionOf>;
  readonly sourceName: string;
}) {
  return section === undefined ? null : (
    <ConnectorSecretsSection {...section} sourceName={sourceName} />
  );
}

/**
 * The `connector` item kind's page, kept thin so the full connector page (HAL-751) can replace it
 * without touching the section: the connector's name as the `h1`, then how it connects, then the status section, then the sections other features add
 * (the Google block, for a Google connector).
 */
export function ConnectorPage({ item, context, Sections }: ItemViewProps) {
  const host = context.services.get(ConnectorStatusHostService);
  const model = useMemo(() => new ConnectorStatusModel(host, item.id), [host, item.id]);
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const status = useSyncExternalStore(subscribe, () => model.state);
  const { loaded, connector } = status;
  const listedTools = context.services.find(ListedToolsHostService);
  const toolsModel = useMemo(
    () =>
      listedTools === undefined ? undefined : new ListedToolsReviewModel(listedTools, item.id),
    [listedTools, item.id],
  );
  const { openItem, runCommand } = context;
  const secretsSection = secretsSectionOf(context, connector);
  // A phone has no tabs to open the file in, so the sentence stays and the link goes.
  const desktop = usePresentation() !== "phone";
  const title = useRef<HTMLHeadingElement | null>(null);
  const place = { hub: item.hub === sharedHubKey ? null : item.hub, id: item.id };
  // The status host can be out of reach (no engine); the list's name still stands, not the id.
  const name =
    connector?.name ??
    context.services.find(LibraryItemsHostService)?.nameOf?.("connector", place) ??
    item.id;
  const trash = useItemTrash(context, {
    kind: "connector",
    hub: item.hub === sharedHubKey ? null : item.hub,
    id: item.id,
    name,
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
        <h1 ref={titleRef} tabIndex={-1} className={trash.titleClassName}>
          {name}
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
          {connector.asks === "every-tool" && desktop && openItem !== undefined && (
            <div className="self-start">
              <Button
                variant="ghost"
                size="sm"
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
              </Button>
            </div>
          )}
        </div>
      )}
      {toolsModel === undefined ? null : (
        <ListedToolsLine
          model={toolsModel}
          status={status}
          folder={host.folder}
          sourceName={name}
          engine={engineWordsOf(context)}
          {...(runCommand === undefined
            ? {}
            : { onReviewTrust: () => void runCommand(openTrustCommand) })}
          viewOnly={context.host === "phone"}
          secretsOnPage={secretsSection !== undefined}
        />
      )}
      <SecretsPart section={secretsSection} sourceName={name} />
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
