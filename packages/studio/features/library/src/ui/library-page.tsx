import type { LibraryItemKind } from "@halonicjs/app";
import { TabList, TabPanel, useTabIds } from "@halonicjs/studio-kit";
import { OverviewPage } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LibraryItemsHost, LibraryListing } from "../library-items-host.ts";
import { libraryOverview } from "../library-overview.ts";
import {
  couldntLoad,
  libraryKinds,
  newLabel,
  overviewWords,
  tabLabel,
  tabSentence,
} from "../library-words.ts";

/** The props of {@link LibraryPage}. */
export interface LibraryPageProps {
  /** The open workspace's items. The place's view takes it from the app's services. */
  readonly host: LibraryItemsHost;
  /** The tab that shows. The app keeps it for each workspace. */
  readonly kind: LibraryItemKind;
  readonly onKindChange: (kind: LibraryItemKind) => void;
  readonly onOpen: (kind: LibraryItemKind, id: string) => void;
  readonly onOpenInNewTab: (kind: LibraryItemKind, id: string) => void;
  /** The New button of a tab that has one. Without it, no tab shows the button. */
  readonly onNew?: (kind: LibraryItemKind) => void;
}

type Load =
  | { readonly state: "loading" }
  | { readonly state: "failed"; readonly reason?: string }
  | { readonly state: "loaded"; readonly listing: LibraryListing };

/** The tab's items from the host, read again when the host says something changed or after Try again. */
function useListing(
  host: LibraryItemsHost,
  kind: LibraryItemKind,
): { load: Load; retry: () => void } {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    const read = () => {
      host.list(kind).then(
        (listing) => current && setLoad({ state: "loaded", listing }),
        (error: unknown) =>
          current &&
          setLoad({
            state: "failed",
            ...(error instanceof Error && error.message !== "" ? { reason: error.message } : {}),
          }),
      );
    };
    setLoad({ state: "loading" });
    read();
    const stop = host.subscribe(read);
    return () => {
      current = false;
      stop();
    };
  }, [host, kind, attempt]);

  return { load, retry: useCallback(() => setAttempt((count) => count + 1), []) };
}

/**
 * The Library: one sentence, four tabs (Skills, Knowledge, Collections, Connectors) and, under
 * them, the shell's overview page with that tab's items and their "Used by". It owns no
 * place yet: the app registers it (HAL-1303 P4b).
 */
export function LibraryPage({
  host,
  kind,
  onKindChange,
  onOpen,
  onOpenInNewTab,
  onNew,
}: LibraryPageProps) {
  const ids = useTabIds();
  const tabs = useMemo(() => libraryKinds.map((each) => ({ id: each, label: tabLabel(each) })), []);
  const { load, retry } = useListing(host, kind);
  const overview = useMemo(
    () => (load.state === "loaded" ? libraryOverview(load.listing) : { hubs: [] }),
    [load],
  );
  const label = newLabel(kind);

  return (
    <div>
      <p className="px-4 pt-2 text-small text-fg-muted">{tabSentence(kind)}</p>
      <div className="px-4 py-2">
        <TabList label="Library" tabs={tabs} selected={kind} onSelect={onKindChange} ids={ids} />
      </div>
      <TabPanel ids={ids} tabs={tabs} selected={kind}>
        <OverviewPage
          key={kind}
          {...overview}
          words={overviewWords(kind)}
          loading={load.state === "loading"}
          {...(load.state === "failed"
            ? {
                failure: {
                  title: couldntLoad(kind),
                  ...(load.reason === undefined ? {} : { reason: load.reason }),
                  onTryAgain: retry,
                },
              }
            : {})}
          onOpen={(id) => onOpen(kind, id)}
          onOpenInNewTab={(id) => onOpenInNewTab(kind, id)}
          {...(onNew !== undefined && label !== undefined
            ? { newButton: { label, onClick: () => onNew(kind) } }
            : {})}
        />
      </TabPanel>
    </div>
  );
}
