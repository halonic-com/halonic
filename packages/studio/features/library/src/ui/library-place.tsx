import type { LibraryItemKind } from "@halonicjs/app";
import { requestFilesReveal } from "@halonicjs/studio-feature-files/api";
import { type ToastStore, usePresentation, useToastStore } from "@halonicjs/studio-kit";
import type { PlaceViewProps } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useState } from "react";
import type { CollectionRef } from "../collection-host.ts";
import { requestConnectorTitleFocus } from "../connector-focus-request.ts";
import { ConnectorStatusHostService } from "../connector-status-host.ts";
import { itemFileRef } from "../item-file.ts";
import { type LibraryItemsHost, LibraryItemsHostService } from "../library-items-host.ts";
import type { LibraryEntryPlace } from "../library-overview.ts";
import { LibraryTabMemoryService } from "../library-tab-memory.ts";
import { takeLibraryTabRequests } from "../library-tab-request.ts";
import { libraryKinds, noDocsFolderToast, tabLabel } from "../library-words.ts";
import { NewCollectionHostService } from "../new-collection-host.ts";
import { type ConnectorRef, NewConnectorHostService } from "../new-connector-host.ts";
import { type NewConnectorRequest, takeNewConnectorRequests } from "../new-connector-request.ts";
import { NewSkillHostService } from "../new-skill-host.ts";
import { sharedHubKey } from "../shared-hub-key.ts";
import { requestSkillInstructionsFocus } from "../skill-focus-request.ts";
import type { SkillRef } from "../skill-host.ts";
import { LibraryKindList } from "./library-kind-list.tsx";
import { LibraryPage, type LibraryPageProps } from "./library-page.tsx";
import { NewCollectionDialog } from "./new-collection-dialog.tsx";
import { NewConnectorDialog } from "./new-connector-dialog.tsx";
import { NewSkillDialog } from "./new-skill-dialog.tsx";
import { OpenAsFileSheet, type OpenedFile } from "./open-as-file-sheet.tsx";
import { useBlockedConnectors } from "./use-blocked-connectors.ts";

export { sharedHubKey };

/** The folder the empty Knowledge tab points to, read from the workspace folder (HAL-12261). */
const docsFolder = "docs";

/**
 * The empty Knowledge tab's "Open the docs folder" (requirement `library.open-docs-folder`):
 * shows the Files view with the workspace's docs folder revealed in the tree, or the deepest
 * folder above it when there is none, and then a toast says there's no docs folder. Only the
 * desktop's sidebar has the Files view.
 */
function openDocsFolder(
  showSidebarView: PlaceViewProps["context"]["showSidebarView"],
  toasts: ToastStore | null,
): Pick<LibraryPageProps, "onOpenDocsFolder"> {
  if (showSidebarView === undefined) return {};
  return {
    onOpenDocsFolder: () => {
      void requestFilesReveal(docsFolder).then((answer) => {
        if (answer === "nearest") toasts?.show({ tone: "info", title: noDocsFolderToast });
      });
      showSidebarView("files");
    },
  };
}

function refOf(kind: LibraryItemKind, { hub, id }: LibraryEntryPlace) {
  return { kind, hub: hub ?? sharedHubKey, id };
}

function prepareThen(host: { prepare(): Promise<void> }, open: () => void): void {
  void host
    .prepare()
    .catch(() => undefined)
    .then(open);
}

function newButtonOf(
  kind: LibraryItemKind,
  opens: Partial<Record<LibraryItemKind, (() => void) | undefined>>,
): (() => void) | undefined {
  return opens[kind];
}

function openItemAsFile(
  openItem: PlaceViewProps["context"]["openItem"],
): Pick<LibraryPageProps, "onOpenAsFile"> {
  if (openItem === undefined) return {};
  return { onOpenAsFile: (kind, place) => openItem(itemFileRef(kind, place)) };
}

/** How many items of each kind the open workspace has, read while the phone's list of kinds shows; a kind that can't be read has no count. */
function useKindCounts(
  host: LibraryItemsHost | undefined,
  active: boolean,
): Partial<Record<LibraryItemKind, number>> {
  const [counts, setCounts] = useState<Partial<Record<LibraryItemKind, number>>>({});
  useEffect(() => {
    if (host === undefined || !active) return undefined;
    let current = true;
    const read = () => {
      for (const kind of libraryKinds) {
        host
          .list(kind)
          .then((listing) => {
            const total =
              listing.hubs.reduce((sum, hub) => sum + hub.entries.length, 0) +
              (listing.shared?.entries.length ?? 0);
            if (current) setCounts((before) => ({ ...before, [kind]: total }));
          })
          .catch(() => undefined);
      }
    };
    read();
    const stop = host.subscribe(read);
    return () => {
      current = false;
      stop();
    };
  }, [host, active]);
  return counts;
}

/**
 * The Library place's page (see {@link LibraryKindView} for the tabs): on a phone, the list of
 * kinds at the place's top and a kind's list as a page pushed above it (flow-library 8).
 */
export function LibraryPlace(props: PlaceViewProps) {
  const { context, sub } = props;
  const phone = usePresentation() === "phone";
  const onList = phone && !libraryKinds.some((kind) => kind === sub);
  const { openPlaceList } = context;
  // An Alt+4 to Alt+7 command asks for a tab: on the list of kinds, that is the kind's page.
  useEffect(
    () =>
      onList
        ? takeLibraryTabRequests((kind) => openPlaceList?.("library", kind, tabLabel(kind)))
        : undefined,
    [onList, openPlaceList],
  );
  const counts = useKindCounts(context.services.find(LibraryItemsHostService), onList);
  const blockedConnectors = useBlockedConnectors(
    context.services.find(ConnectorStatusHostService),
    onList,
  );
  if (onList) {
    const plugins = context.settingsSections?.find(({ id }) => id === "plugins");
    const { openSettings } = context;
    return (
      <LibraryKindList
        counts={counts}
        blockedConnectors={blockedConnectors}
        onOpenKind={(kind) => openPlaceList?.("library", kind, tabLabel(kind))}
        {...(plugins === undefined || openSettings === undefined
          ? {}
          : { onOpenPlugins: () => openSettings(plugins.id) })}
      />
    );
  }
  return <LibraryKindView {...props} />;
}

/**
 * The Library's tabs: {@link LibraryPage} over the open workspace's items. It opens on the
 * tab the workspace was last on (Skills the first time), shows the tab an Alt+4 to Alt+7 command
 * asks for, and remembers the tab it ends on.
 */
function LibraryKindView({ context, sub }: PlaceViewProps) {
  const host = context.services.get(LibraryItemsHostService);
  const memory = context.services.get(LibraryTabMemoryService);
  const [chosen, setKind] = useState<LibraryItemKind>(() => memory.get() ?? "skill");
  const desktop = usePresentation() === "desktop";
  const toasts = useToastStore();
  // A phone shows the list of kinds, and a kind's list as a page of its own (flow-library 8).
  const phoneKind = desktop ? undefined : libraryKinds.find((each) => each === sub);
  const kind = phoneKind ?? chosen;
  const { openPlaceList } = context;
  const show = useCallback(
    (next: LibraryItemKind) => {
      setKind(next);
      memory.set(next);
      if (!desktop) openPlaceList?.("library", next, tabLabel(next));
    },
    [memory, desktop, openPlaceList],
  );
  useEffect(() => takeLibraryTabRequests(show), [show]);
  const newSkillHost = context.services.find(NewSkillHostService);
  const [makingSkill, setMakingSkill] = useState(false);
  const newCollectionHost = context.services.find(NewCollectionHostService);
  const [makingCollection, setMakingCollection] = useState(false);
  // A phone only looks at connectors: New connector (a three-way setup dialog) is desktop only.
  const newConnectorHost = desktop ? context.services.find(NewConnectorHostService) : undefined;
  const [makingConnector, setMakingConnector] = useState<NewConnectorRequest>();
  // Each request gets its own dialog, so a second request while one is open shows its own name and way.
  const [connectorRequests, setConnectorRequests] = useState(0);
  // The run banner's "Add connector" opens New connector on the Connectors tab with what it knows filled in.
  useEffect(() => {
    if (newConnectorHost === undefined) {
      // Nothing here can make a connector. Taking the request stops it from waiting, where it
      // would open the dialog later, unasked, if a host appeared. The Connectors tab still shows.
      return takeNewConnectorRequests(() => show("connector"));
    }
    return takeNewConnectorRequests((request) => {
      show("connector");
      prepareThen(newConnectorHost, () => {
        // A way the host does not offer is dropped: nothing is guessed, so no way is picked.
        const { way, ...rest } = request;
        setMakingConnector(
          way !== undefined && newConnectorHost.ways().includes(way) ? request : rest,
        );
        setConnectorRequests((count) => count + 1);
      });
    });
  }, [newConnectorHost, show]);
  const [openedFile, setOpenedFile] = useState<OpenedFile>();
  const { openItem, openItemInNewTab } = context;
  // The desktop opens the file in a tab; a phone has no tabs, so it shows the text in a sheet.
  const openAsFile = desktop
    ? openItemAsFile(openItem)
    : {
        onOpenAsFile: (kind: LibraryItemKind, place: LibraryEntryPlace, name: string) =>
          setOpenedFile({ kind, place, name }),
      };
  const openSkill = ({ hub, id }: SkillRef) =>
    openItem?.({ kind: "skill", hub: hub ?? sharedHubKey, id });
  const openCollection = ({ hub, id }: CollectionRef) =>
    openItem?.({ kind: "collection", hub: hub ?? sharedHubKey, id });
  const openConnector = ({ hub, id }: ConnectorRef) =>
    openItem?.({ kind: "connector", hub: hub ?? sharedHubKey, id });
  // Skills, Collections and Connectors have a New dialog; Knowledge shows no button (its items are files).
  // The dialog opens even if the read failed: it has fallbacks, and Create shows its own error.
  const onNew = newButtonOf(kind, {
    skill: newSkillHost && (() => prepareThen(newSkillHost, () => setMakingSkill(true))),
    collection:
      newCollectionHost && (() => prepareThen(newCollectionHost, () => setMakingCollection(true))),
    connector:
      newConnectorHost && (() => prepareThen(newConnectorHost, () => setMakingConnector({}))),
  });
  return (
    <>
      <LibraryPage
        host={host}
        kind={kind}
        onKindChange={show}
        onOpen={(each, entry) => openItem?.(refOf(each, entry))}
        onOpenInNewTab={(each, entry) => openItemInNewTab?.(refOf(each, entry))}
        {...openAsFile}
        {...(desktop ? openDocsFolder(context.showSidebarView, toasts) : {})}
        {...(onNew === undefined ? {} : { onNew })}
      />
      {openedFile !== undefined && (
        <OpenAsFileSheet
          host={host}
          context={context}
          {...openedFile}
          onClose={() => setOpenedFile(undefined)}
        />
      )}
      {makingSkill && newSkillHost !== undefined && (
        <NewSkillDialog
          host={newSkillHost}
          onCreated={(skill) => {
            setMakingSkill(false);
            requestSkillInstructionsFocus(skill);
            openSkill(skill);
          }}
          onCancel={() => setMakingSkill(false)}
        />
      )}
      {makingCollection && newCollectionHost !== undefined && (
        <NewCollectionDialog
          host={newCollectionHost}
          onCreated={(collection) => {
            setMakingCollection(false);
            openCollection(collection);
          }}
          onCancel={() => setMakingCollection(false)}
        />
      )}
      {makingConnector !== undefined && newConnectorHost !== undefined && (
        <NewConnectorDialog
          key={connectorRequests}
          host={newConnectorHost}
          {...(makingConnector.name === undefined ? {} : { name: makingConnector.name })}
          {...(makingConnector.way === undefined ? {} : { way: makingConnector.way })}
          onCreated={(connector) => {
            setMakingConnector(undefined);
            requestConnectorTitleFocus(connector);
            openConnector(connector);
          }}
          onCancel={() => setMakingConnector(undefined)}
        />
      )}
    </>
  );
}
