import { Button, EmptyState, usePresentation, useToastStore } from "@halonicjs/studio-kit";
import {
  type EngineWords,
  engineWordsOf,
  errorReasonFor,
  type FocusTarget,
  focusRow,
  OverviewPage,
  type PlaceViewProps,
  targetAfterRemoving,
  visibleRowIds,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AgentListing, type AgentRef, type AgentsHost, AgentsHostService } from "../api.ts";
import { NewAgentDialog } from "../new/new-agent-dialog.tsx";
import { markFreshAgent } from "../page/fresh-agents.ts";
import { deleteWords } from "../trash/delete-words.ts";
import { fileItemOf } from "../trash/file-item.ts";
import { trashAgent } from "../trash/trash-agent.ts";
import { agentHubs, rowId } from "./agent-rows.tsx";
import { listWords } from "./list-words.ts";
import { dropNewAgentRequest, takeNewAgentRequests } from "./new-request.ts";

/**
 * Whether the agents have loaded: the skeleton, a first read that failed, or the list. A list
 * that was read keeps its rows when a later read fails (`stale`) or is still going (`refreshing`).
 * A failed first read stays on screen while **Try again** reads again (`retrying`).
 */
type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly retrying: boolean }
  | {
      readonly kind: "ready";
      readonly listings: readonly AgentListing[];
      readonly stale: boolean;
      readonly refreshing: boolean;
    };

/** Focuses a row, or the empty state's title when no row is left; false while it isn't drawn. */
function focusTarget(
  page: HTMLElement,
  target: FocusTarget,
  emptyTitle: HTMLHeadingElement | null,
): boolean {
  if (target !== "empty") return focusRow(page, target.row);
  emptyTitle?.focus();
  return emptyTitle !== null;
}

/** The Agents place's page: the open workspace's agents, from `AgentsHostService`. */
export function AgentsPage({ context }: PlaceViewProps) {
  const { openItem } = context;
  const { openItemInNewTab } = context;
  const open =
    openItem === undefined
      ? undefined
      : (ref: AgentRef) => openItem({ kind: "agent", hub: ref.hubId, id: ref.id });
  const openInNewTab =
    openItemInNewTab === undefined
      ? undefined
      : (ref: AgentRef) => openItemInNewTab({ kind: "agent", hub: ref.hubId, id: ref.id });
  const openFile =
    openItem === undefined ? undefined : (path: string) => openItem(fileItemOf(path));
  return (
    <AgentsView
      host={context.services.get(AgentsHostService)}
      engine={engineWordsOf(context)}
      {...(open ? { open } : {})}
      {...(openInNewTab ? { openInNewTab } : {})}
      {...(openFile ? { openFile } : {})}
    />
  );
}

/** Props for {@link AgentsView}. */
export interface AgentsViewProps {
  readonly host: AgentsHost;
  /** Opens an agent's page in a tab: a row's click, Enter, and an agent just created. */
  readonly open?: (ref: AgentRef) => void;
  /** Opens an agent's page in a new tab: a Ctrl-click, a middle click and Ctrl Enter. Without it, those open it in the same tab as a click. */
  readonly openInNewTab?: (ref: AgentRef) => void;
  /** Opens a workspace file in a tab, for **Open as file**; without it the row's menu has none. */
  readonly openFile?: (path: string) => void;
  /** What the page calls the engine when it can't read, for this window's host; the desktop app's by default. */
  readonly engine?: EngineWords;
}

/**
 * The Agents list (`agents.list`): "Agents", its sentence, then the shell's list page with
 * a row per agent and **New agent**. It reads the host again when the host says the agents
 * may have changed, and keeps the rows it has while that read runs or fails, so a refresh never
 * blanks the list: a failed refresh adds a line with **Try again** above the rows.
 *
 * @example
 * <AgentsView host={host} open={openAgentTab} />
 */
export function AgentsView({ host, open, openInNewTab, openFile, engine }: AgentsViewProps) {
  const words = engine ?? engineWordsOf({});
  const phone = usePresentation() === "phone";
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [creating, setCreating] = useState(false);
  const toasts = useToastStore();
  const title = useRef<HTMLHeadingElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const emptyTitle = useRef<HTMLHeadingElement>(null);

  // Each read takes a number; only the newest read's result is shown, so a slow older read never
  // overwrites a newer one, and nothing is set after unmount.
  const newestRead = useRef(0);

  // Kept stable so the New agent dialog doesn't read the default model again on every list refresh.
  const defaultModelOf = useCallback((hubId: string) => host.defaultModel(hubId), [host]);

  const read = useCallback(
    (showProgress = false) => {
      const mine = ++newestRead.current;
      // Try again shows it is reading with a busy button, over the error or over the rows; never a skeleton.
      if (showProgress) {
        setLoad((was) => {
          if (was.kind === "ready") return { ...was, refreshing: true };
          return was.kind === "failed" ? { kind: "failed", retrying: true } : was;
        });
      }
      host.list().then(
        (listings) => {
          if (mine !== newestRead.current) return;
          setLoad({ kind: "ready", listings, stale: false, refreshing: false });
          // The button that had the focus is gone: the page's heading takes it.
          if (showProgress) title.current?.focus();
        },
        () => {
          if (mine !== newestRead.current) return;
          setLoad((was) =>
            was.kind === "ready"
              ? { ...was, stale: true, refreshing: false }
              : { kind: "failed", retrying: false },
          );
        },
      );
    },
    [host],
  );
  const tryAgain = () => read(true);

  useEffect(() => {
    read();
    // The Studio's host passes the change's payload to its listeners: drop it, so a change is read
    // quietly and never taken for Try again, which moves the focus to the heading.
    const unsubscribe = host.subscribe(() => read());
    return () => {
      unsubscribe();
      newestRead.current += 1;
    };
  }, [host, read]);

  const listings = load.kind === "ready" ? load.listings : [];
  const listingOf = (id: string) => listings.find((each) => rowId(each) === id);
  const openRow = (id: string) => {
    const listing = listingOf(id);
    if (listing !== undefined) open?.(listing);
  };
  const openRowInNewTab = (id: string) => {
    const listing = listingOf(id);
    if (listing !== undefined) (openInNewTab ?? open)?.(listing);
  };
  const openRowAsFile = (id: string) => {
    const listing = listingOf(id);
    if (listing === undefined) return;
    host.filePath(listing).then(
      (path) => openFile?.(path),
      (error: unknown) =>
        toasts?.show({
          tone: "danger",
          title: deleteWords.couldntOpenFile(listing.name),
          text: errorReasonFor(error),
        }),
    );
  };

  // Where focus goes once it can: a restored row only shows when the list is read again, so the
  // target waits for the list that was on screen when it was set to be replaced. After a delete it
  // also waits until the deleted row has left the list, so nothing that row held can take it back.
  const pendingFocus = useRef<
    { target: FocusTarget; listAtStart: Load; gone?: string | undefined } | undefined
  >(undefined);
  const latestLoad = useRef(load);
  latestLoad.current = load;
  const applyFocus = useCallback(() => {
    const pending = pendingFocus.current;
    if (pending === undefined || page.current === null) return;
    const { target, gone } = pending;
    const listReadAgain = latestLoad.current !== pending.listAtStart;
    if (gone !== undefined && visibleRowIds(page.current).includes(gone)) {
      // A read that still shows the row (it failed, so the old rows stay) leaves focus where it is.
      if (listReadAgain) pendingFocus.current = undefined;
      return;
    }
    const shown = focusTarget(page.current, target, emptyTitle.current);
    if (shown || listReadAgain) pendingFocus.current = undefined;
  }, []);
  // Runs after every render, to catch the row when it appears or the deleted one when it goes.
  useEffect(applyFocus);
  const focusOn = (target: FocusTarget, gone?: string) => {
    pendingFocus.current = { target, listAtStart: latestLoad.current, gone };
    applyFocus();
  };
  const trashRow = (id: string) => {
    const listing = listingOf(id);
    if (listing === undefined || page.current === null) return;
    const after = targetAfterRemoving(visibleRowIds(page.current), id);
    void trashAgent(host, toasts, listing, {
      onTrashed: () => focusOn(after, id),
      onRestored: () => focusOn({ row: id }),
    });
  };
  const startCreating = () => setCreating(true);
  // An agent needs a hub to live in, and the hubs are known only once the first read is done.
  const canCreate = load.kind === "ready" && host.hubs().length > 0;
  // Ctrl K's New agent waits until the dialog can open; with no hub to put one in, it is dropped.
  const noHubs = load.kind === "ready" && host.hubs().length === 0;
  useEffect(() => {
    if (noHubs) dropNewAgentRequest();
    return canCreate ? takeNewAgentRequests(() => setCreating(true)) : undefined;
  }, [canCreate, noHubs]);

  return (
    <div ref={page} className="flex w-full flex-col gap-4 px-6 py-5">
      <header className={phone ? "sr-only" : "flex flex-col gap-1"}>
        <h1 ref={title} tabIndex={-1} className="text-title outline-none">
          {listWords.title}
        </h1>
        {(listings.length > 0 || load.kind !== "ready") && (
          <p className="text-body text-fg-muted">{listWords.sentence}</p>
        )}
      </header>
      {load.kind === "ready" && load.stale && (
        <p className="flex flex-wrap items-center gap-2 text-small text-fg-muted">
          {words.showingLast}
          <Button
            variant="ghost"
            busy={load.refreshing}
            busyLabel={listWords.tryingAgain}
            onClick={tryAgain}
          >
            {listWords.tryAgain}
          </Button>
        </p>
      )}
      {load.kind === "failed" ? (
        <EmptyState
          tone="error"
          title={listWords.loadFailedTitle}
          description={words.notAnswering}
          action={{ label: listWords.tryAgain, onClick: tryAgain, busy: load.retrying }}
        />
      ) : (
        <OverviewPage
          hubs={agentHubs(host.hubs(), listings)}
          words={{
            searchLabel: listWords.searchLabel,
            loadingLabel: listWords.loadingLabel,
            chipsLabel: listWords.chipsLabel,
            allChip: listWords.allChip,
            sharedChip: (workspace) => workspace,
            moreLabel: listWords.more,
            sharedSection: (workspace) => workspace,
            emptySection: (hubName) => listWords.emptyHub(hubName),
            noMatch: listWords.noMatch,
            nothingYet: {
              title: listWords.nothingYetTitle,
              description: listWords.sentence,
              ...(canCreate
                ? { action: { label: listWords.newAgent, onClick: startCreating } }
                : {}),
            },
          }}
          loading={load.kind === "loading"}
          quietWhenEmpty
          emptyTitleRef={emptyTitle}
          {...(canCreate
            ? { newButton: { label: listWords.newAgent, onClick: startCreating } }
            : {})}
          itemMenu={(row) => [
            // A phone has no tabs and a tap on the row opens the agent: its menu is Delete alone (UX 9.12).
            ...(phone
              ? []
              : [
                  { id: "open", label: deleteWords.open, onSelect: () => openRow(row.id) },
                  {
                    id: "open-in-new-tab",
                    label: deleteWords.openInNewTab,
                    onSelect: () => openRowInNewTab(row.id),
                  },
                  ...(openFile === undefined
                    ? []
                    : [
                        {
                          id: "open-as-file",
                          label: deleteWords.openAsFile,
                          onSelect: () => openRowAsFile(row.id),
                        },
                      ]),
                ]),
            {
              id: "delete",
              label: deleteWords.delete,
              danger: true,
              onSelect: () => trashRow(row.id),
            },
          ]}
          onOpen={openRow}
          onOpenInNewTab={openRowInNewTab}
        />
      )}
      {creating && (
        <NewAgentDialog
          hubs={host.hubs()}
          takenIds={(hubId) =>
            listings.filter((listing) => listing.hubId === hubId).map((listing) => listing.id)
          }
          defaultModelOf={defaultModelOf}
          create={async (newAgent) => {
            const ref = await host.create(newAgent);
            // With nothing written, the page opens ready for the instructions (`agents.page.new-agent`).
            if (newAgent.instructions === undefined || newAgent.instructions === "") {
              markFreshAgent(ref.hubId, ref.id);
            }
            return ref;
          }}
          onCreated={(ref) => {
            setCreating(false);
            read();
            open?.(ref);
          }}
          onCancel={() => setCreating(false)}
          returnFocus={() => null}
        />
      )}
    </div>
  );
}
