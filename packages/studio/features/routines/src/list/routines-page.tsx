import { Button, EmptyState, usePresentation, useToastStore } from "@halonicjs/studio-kit";
import {
  type EngineWords,
  engineWordsOf,
  type FocusTarget,
  focusRow,
  OverviewPage,
  type PlaceViewProps,
  targetAfterRemoving,
  visibleRowIds,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type RoutineListing,
  type RoutineRef,
  type RoutinesHost,
  RoutinesHostService,
} from "../api.ts";
import { NewRoutineDialog } from "../new/new-routine-dialog.tsx";
import { listWords, rowMenuWords } from "./list-words.ts";
import { dropNewRoutineRequest, takeNewRoutineRequests } from "./new-request.ts";
import { routineHubs, rowId } from "./routine-rows.tsx";
import { trashRoutine } from "./trash-routine.ts";

/**
 * Whether the routines have loaded: the skeleton, a first read that failed, or the list. A list
 * that was read keeps its rows when a later read fails (`stale`) or is still going (`refreshing`).
 * A failed first read stays on screen while **Try again** reads again (`retrying`).
 */
type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly retrying: boolean }
  | {
      readonly kind: "ready";
      readonly listings: readonly RoutineListing[];
      readonly stale: boolean;
      readonly refreshing: boolean;
    };

/** The Routines place's page: the open workspace's routines, from `RoutinesHostService`. */
export function RoutinesPage({ context }: PlaceViewProps) {
  const { openItem, openItemInNewTab, runCommand } = context;
  // Only a routine in a hub is listed, so a row's hub is always there; a root routine has no tab.
  const itemOf = (ref: RoutineRef) =>
    ref.hubId === null ? undefined : { kind: "routine", hub: ref.hubId, id: ref.id };
  const open =
    openItem === undefined
      ? undefined
      : (ref: RoutineRef) => {
          const item = itemOf(ref);
          if (item !== undefined) openItem(item);
        };
  const openInNewTab =
    openItemInNewTab === undefined
      ? undefined
      : (ref: RoutineRef) => {
          const item = itemOf(ref);
          if (item !== undefined) openItemInNewTab(item);
        };
  return (
    <RoutinesView
      host={context.services.get(RoutinesHostService)}
      engine={engineWordsOf(context)}
      {...(runCommand ? { newWorkflow: () => void runCommand("workflows.new") } : {})}
      {...(open ? { open } : {})}
      {...(openInNewTab ? { openInNewTab } : {})}
    />
  );
}

/** Props for {@link RoutinesView}. */
export interface RoutinesViewProps {
  readonly host: RoutinesHost;
  /** Opens a routine's page in a tab: a row's click and Enter. */
  readonly open?: (ref: RoutineRef) => void;
  /** Opens a routine's page in a new tab: a Ctrl-click, a middle click and Ctrl Enter. Without it, those open it in the same tab as a click. */
  readonly openInNewTab?: (ref: RoutineRef) => void;
  /** What the page calls the engine when it can't read, for this window's host; the desktop app's by default. */
  readonly engine?: EngineWords;
  /** Opens the New workflow dialog, for a hub with nothing to run; absent where the app can't, so the dialog has no such link. */
  readonly newWorkflow?: () => void;
}

/**
 * The Routines list (`routines.list`): "Routines", its sentence, then the shell's list page with a
 * row per routine. It reads the host again when the host says the routines may have changed, and
 * keeps the rows it has while that read runs or fails, so a refresh never blanks the list: a failed
 * refresh adds a line with **Try again** above the rows.
 *
 * @example
 * <RoutinesView host={host} open={openRoutineTab} />
 */
export function RoutinesView({ host, open, openInNewTab, engine, newWorkflow }: RoutinesViewProps) {
  const words = engine ?? engineWordsOf({});
  const phone = usePresentation() === "phone";
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const title = useRef<HTMLHeadingElement>(null);
  const [creating, setCreating] = useState(false);
  const toasts = useToastStore();
  const page = useRef<HTMLDivElement>(null);

  // Each read takes a number; only the newest read's result is shown, so a slow older read never
  // overwrites a newer one, and nothing is set after unmount.
  const newestRead = useRef(0);

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
    const unsubscribe = host.subscribe(read);
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

  // Where focus goes once it can: a restored row only shows when the list is read again, so the
  // target waits for the list that was on screen when it was set to be replaced.
  const pendingFocus = useRef<{ target: FocusTarget; listAtStart: Load } | undefined>(undefined);
  const latestLoad = useRef(load);
  latestLoad.current = load;
  const applyFocus = useCallback(() => {
    const pending = pendingFocus.current;
    if (pending === undefined || page.current === null) return;
    const { target } = pending;
    const shown = target === "empty" ? title.current !== null : focusRow(page.current, target.row);
    if (target === "empty") title.current?.focus();
    if (shown || latestLoad.current !== pending.listAtStart) pendingFocus.current = undefined;
  }, []);
  // Runs after every render, to catch the row when it appears.
  useEffect(applyFocus);
  const focusOn = (target: FocusTarget) => {
    pendingFocus.current = { target, listAtStart: latestLoad.current };
    applyFocus();
  };
  const trashRow = (id: string) => {
    const listing = listingOf(id);
    if (listing === undefined || page.current === null) return;
    const after = targetAfterRemoving(visibleRowIds(page.current), id);
    void trashRoutine(host, toasts, listing, {
      onTrashed: () => focusOn(after),
      onRestored: () => focusOn({ row: id }),
    });
  };

  const startCreating = () => setCreating(true);
  // A routine needs a hub to live in, and the hubs are known only once the first read is done.
  const canCreate = load.kind === "ready" && host.hubs().length > 0;
  // Ctrl K's New routine waits until the dialog can open; with no hub to put one in, it is dropped.
  const noHubs = load.kind === "ready" && host.hubs().length === 0;
  useEffect(() => {
    if (noHubs) dropNewRoutineRequest();
    return canCreate ? takeNewRoutineRequests(() => setCreating(true)) : undefined;
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
          hubs={routineHubs(host.hubs(), listings)}
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
              description: listWords.emptySentence,
              ...(canCreate
                ? { action: { label: listWords.newRoutine, onClick: startCreating } }
                : {}),
            },
          }}
          loading={load.kind === "loading"}
          quietWhenEmpty
          {...(canCreate
            ? { newButton: { label: listWords.newRoutine, onClick: startCreating } }
            : {})}
          itemMenu={(row) => [
            { id: "open", label: rowMenuWords.open, onSelect: () => openRow(row.id) },
            {
              id: "open-in-new-tab",
              label: rowMenuWords.openInNewTab,
              onSelect: () => openRowInNewTab(row.id),
            },
            {
              id: "delete",
              label: rowMenuWords.delete,
              danger: true,
              onSelect: () => trashRow(row.id),
            },
          ]}
          onOpen={openRow}
          onOpenInNewTab={openRowInNewTab}
        />
      )}
      {creating && (
        <NewRoutineDialog
          hubs={host.hubs()}
          takenIds={(hubId) =>
            listings.filter((listing) => listing.hubId === hubId).map((listing) => listing.id)
          }
          starterTarget={(hubId) => host.starterTarget(hubId)}
          create={(newRoutine) => host.create(newRoutine)}
          onCreated={(ref) => {
            setCreating(false);
            read();
            open?.(ref);
          }}
          onCancel={() => setCreating(false)}
          onNewWorkflow={
            newWorkflow &&
            (() => {
              setCreating(false);
              newWorkflow();
            })
          }
          returnFocus={() => null}
        />
      )}
    </div>
  );
}
