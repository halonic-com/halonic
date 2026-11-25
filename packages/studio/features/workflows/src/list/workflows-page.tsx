import { ItemChatService, ShowInChatService } from "@halonicjs/studio-feature-assistant/api";
import {
  type BrokenFileActions,
  brokenFileActions,
  brokenFileMenu,
} from "@halonicjs/studio-feature-files/api";
import {
  Button,
  EmptyState,
  inlineLinkClasses,
  usePresentation,
  useToastStore,
} from "@halonicjs/studio-kit";
import {
  copyDetailsWords,
  detailsOf,
  EngineNotAnswering,
  type EngineWords,
  engineReasonFor,
  engineWordsOf,
  FilesWithErrorsService,
  type FilesWithErrorsSource,
  type FileWithErrors,
  type FocusTarget,
  focusRow,
  isUnexplained,
  OverviewPage,
  type PlaceViewProps,
  targetAfterRemoving,
  useBrokenFiles,
  useCopyDetails,
  visibleRowIds,
} from "@halonicjs/studio-shell";
import { defaultHub } from "@halonicjs/workspace";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type WorkflowListing,
  type WorkflowRef,
  type WorkflowsHost,
  WorkflowsHostService,
} from "../api.ts";
import { NewWorkflowDialog } from "../new/new-workflow-dialog.tsx";
import { newWorkflowWords } from "../new/new-workflow-words.ts";
import { listWords } from "./list-words.ts";
import { takeNewWorkflowRequests } from "./new-request.ts";
import { brokenRowId, rowId, workflowHubs } from "./workflow-rows.tsx";

/**
 * Whether the workflows have loaded: the skeleton, a first read that failed, or the list. A list
 * that was read keeps its rows when a later read fails (`stale`, with its error) or is still going
 * (`refreshing`). A failed first read stays on screen while **Try again** reads again (`retrying`).
 */
type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly error: unknown; readonly retrying: boolean }
  | {
      readonly kind: "ready";
      readonly listings: readonly WorkflowListing[];
      readonly stale: { readonly error: unknown } | undefined;
      readonly refreshing: boolean;
    };

/** The Workflows place's page: the open workspace's workflows, from `WorkflowsHostService`. */
export function WorkflowsPage({ context }: PlaceViewProps) {
  const { openItem } = context;
  const { openItemInNewTab } = context;
  const open =
    openItem === undefined
      ? undefined
      : (ref: WorkflowRef) => openItem({ kind: "workflow", hub: ref.hubId, id: ref.id });
  const openInNewTab =
    openItemInNewTab === undefined
      ? undefined
      : (ref: WorkflowRef) => openItemInNewTab({ kind: "workflow", hub: ref.hubId, id: ref.id });
  const filesWithErrors = context.services.find(FilesWithErrorsService);
  const toasts = useToastStore();
  const assistant = context.services.find(ShowInChatService);
  const showInChat = assistant && {
    label: assistant.label,
    show: ({ hubId: hub, id, name }: WorkflowListing) =>
      void assistant.show({ item: { kind: "workflow", hub, id }, name }, context),
  };
  const itemChat = context.services.find(ItemChatService);
  const describe =
    itemChat &&
    ((name: string) => void itemChat.describe(newWorkflowWords.describeStart(name), context));
  return (
    <WorkflowsView
      announceState={(key, text) => context.announcer.announceState(key, text)}
      host={context.services.get(WorkflowsHostService)}
      engine={engineWordsOf(context)}
      brokenActions={brokenFileActions(context, toasts)}
      {...(filesWithErrors ? { filesWithErrors } : {})}
      {...(open ? { open } : {})}
      {...(openInNewTab ? { openInNewTab } : {})}
      {...(showInChat ? { showInChat } : {})}
      {...(describe ? { describe } : {})}
    />
  );
}

/** Props for {@link WorkflowsView}. */
export interface WorkflowsViewProps {
  readonly host: WorkflowsHost;
  /** Opens a workflow's page in a tab: a row's click, Enter, and a workflow just created. */
  readonly open?: (ref: WorkflowRef) => void;
  /** Opens a workflow's page in a new tab: a Ctrl-click, a middle click and Ctrl Enter. Without it, those open it in the same tab as a click. */
  readonly openInNewTab?: (ref: WorkflowRef) => void;
  /** What the page calls the engine when it can't read, for this window's host; the desktop app's by default. */
  readonly engine?: EngineWords;
  /** Reads how many items a search or hub change left (`announcer.announceState`); absent in tests that don't listen. */
  readonly announceState?: ((key: string, text: string) => void) | undefined;
  /** The workspace's files with errors: a workflow file that didn't load keeps its row (C348 ST4). */
  readonly filesWithErrors?: FilesWithErrorsSource;
  /** What a broken file's row and its ⋮ menu do; without it the row opens nothing and has no menu. */
  readonly brokenActions?: BrokenFileActions;
  /** The row ⋮'s **Show in chat** (`assistant.chat.show-in-chat`); none without the Assistant. */
  readonly showInChat?: {
    readonly label: string;
    readonly show: (workflow: WorkflowListing) => void;
  };
  /** New workflow's Describe link: asks the Assistant with the typed name; no link without it. */
  readonly describe?: ((name: string) => void) | undefined;
}

/**
 * The Workflows list (`workflows.list`): "Workflows", its sentence, then the shell's list page with
 * a row per workflow and **New workflow**. It reads the host again when the host says the workflows
 * may have changed, and keeps the rows it has while that read runs or fails, so a refresh never
 * blanks the list: a failed refresh adds a line with **Try again** above the rows.
 *
 * @example
 * <WorkflowsView host={host} open={openWorkflowTab} />
 */
export function WorkflowsView({
  host,
  open,
  openInNewTab,
  engine,
  announceState,
  filesWithErrors,
  brokenActions = {},
  showInChat,
  describe,
}: WorkflowsViewProps) {
  const words = engine ?? engineWordsOf({});
  const phone = usePresentation() === "phone";
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [creating, setCreating] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const emptyTitle = useRef<HTMLHeadingElement>(null);

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
          return was.kind === "failed" ? { ...was, retrying: true } : was;
        });
      }
      host.list().then(
        (listings) => {
          if (mine !== newestRead.current) return;
          setLoad({ kind: "ready", listings, stale: undefined, refreshing: false });
          // The button that had the focus is gone: the page's heading takes it.
          if (showProgress) title.current?.focus();
        },
        (error: unknown) => {
          if (mine !== newestRead.current) return;
          setLoad((was) =>
            was.kind === "ready"
              ? { ...was, stale: { error }, refreshing: false }
              : { kind: "failed", error, retrying: false },
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
  const broken = useBrokenFiles(filesWithErrors, "workflow");
  const brokenOf = (id: string) => broken.find((file) => brokenRowId(file) === id);
  // A broken file has no page: its row opens the file at its first problem.
  const openRow = (id: string) => {
    const listing = listings.find((each) => rowId(each) === id);
    if (listing !== undefined) open?.(listing);
    const file = brokenOf(id);
    if (file !== undefined) brokenActions.open?.(file);
  };
  // A healthy row's ⋮ has only Show in chat so far; a phone's full-page chat comes later.
  const rowMenu = (id: string) => {
    const listing = listings.find((each) => rowId(each) === id);
    if (showInChat === undefined || listing === undefined || phone) return [];
    return [
      { id: "show-in-chat", label: showInChat.label, onSelect: () => showInChat.show(listing) },
    ];
  };
  // Where focus goes once it can, after Delete on a broken row or its Undo: the shared list of
  // broken files has to be read again before the row leaves or comes back, so the target waits for
  // the next read of that list, and after a delete also until the deleted row has left.
  const pendingFocus = useRef<
    | { target: FocusTarget; brokenAtStart: readonly FileWithErrors[]; gone?: string | undefined }
    | undefined
  >(undefined);
  const latestBroken = useRef(broken);
  latestBroken.current = broken;
  const applyFocus = useCallback(() => {
    const pending = pendingFocus.current;
    if (pending === undefined || page.current === null) return;
    const { target, gone } = pending;
    const listReadAgain = latestBroken.current !== pending.brokenAtStart;
    if (gone !== undefined && visibleRowIds(page.current).includes(gone)) {
      // A read that still shows the row leaves focus where it is.
      if (listReadAgain) pendingFocus.current = undefined;
      return;
    }
    const shown = focusTarget(page.current, target, emptyTitle.current);
    if (shown || listReadAgain) pendingFocus.current = undefined;
  }, []);
  // Runs after every render, to catch the row when it appears or the deleted one when it goes.
  useEffect(applyFocus);
  const focusOn = (target: FocusTarget, gone?: string) => {
    pendingFocus.current = { target, brokenAtStart: latestBroken.current, gone };
    applyFocus();
  };
  const brokenMenu = (file: FileWithErrors, id: string) =>
    brokenFileMenu(file, brokenActions, {
      removed: () => {
        if (page.current === null) return;
        // The row is still drawn until the shared list reads again, so the next one is found now.
        focusOn(targetAfterRemoving(visibleRowIds(page.current), id), id);
      },
      restored: () => focusOn({ row: id }),
    });
  const openRowInNewTab = (id: string) => {
    const listing = listings.find((each) => rowId(each) === id);
    if (listing !== undefined) (openInNewTab ?? open)?.(listing);
    const file = brokenOf(id);
    if (file !== undefined) brokenActions.open?.(file);
  };
  const startCreating = () => setCreating(true);
  // A workflow needs a hub to live in, and the hubs are known only once the first read is done. A
  // workspace with no hub gets the Default hub with its first workflow (`workflows.new.first-hub`).
  const canCreate = load.kind === "ready";
  const hubsForNew = host.hubs().length > 0 ? host.hubs() : [defaultHub];
  // A phone doesn't edit workflows, so its list has no New workflow (UX 10.15).
  const offersNew = canCreate && !phone;
  // Ctrl K's New workflow waits until the dialog can open.
  useEffect(() => {
    // A phone takes the request and drops it, so the dialog doesn't open later, unasked, on a desktop.
    if (phone) return takeNewWorkflowRequests(() => undefined);
    return offersNew ? takeNewWorkflowRequests(() => setCreating(true)) : undefined;
  }, [offersNew, phone]);

  return (
    <div ref={page} className="flex w-full flex-col gap-4 px-6 py-5">
      <header className={phone ? "sr-only" : "flex flex-col gap-1"}>
        <h1 ref={title} tabIndex={-1} className="text-title">
          {listWords.title}
        </h1>
        {(listings.length > 0 || load.kind !== "ready") && (
          <p className="text-body text-fg-muted">{listWords.sentence}</p>
        )}
      </header>
      {load.kind === "ready" && load.stale !== undefined && (
        <RefreshFailed
          error={load.stale.error}
          words={words}
          refreshing={load.refreshing}
          tryAgain={tryAgain}
        />
      )}
      {load.kind === "failed" ? (
        <LoadFailed error={load.error} words={words} retrying={load.retrying} tryAgain={tryAgain} />
      ) : (
        <OverviewPage
          announceState={announceState}
          hubs={workflowHubs(host.hubs(), listings, broken)}
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
            shownCount: listWords.shownCount,
            nothingYet: {
              title: listWords.nothingYetTitle,
              description: listWords.sentence,
              ...(offersNew
                ? { action: { label: listWords.newWorkflow, onClick: startCreating } }
                : {}),
            },
          }}
          loading={load.kind === "loading"}
          quietWhenEmpty
          emptyTitleRef={emptyTitle}
          itemMenu={(row) => {
            const file = brokenOf(row.id);
            return file === undefined ? rowMenu(row.id) : brokenMenu(file, row.id);
          }}
          {...(offersNew
            ? { newButton: { label: listWords.newWorkflow, onClick: startCreating } }
            : {})}
          onOpen={openRow}
          onOpenInNewTab={openRowInNewTab}
          {...altOpenOf(
            showInChat,
            phone,
            (id) => listings.find((each) => rowId(each) === id),
            openRow,
          )}
        />
      )}
      {creating && (
        <NewWorkflowDialog
          hubs={hubsForNew}
          takenIds={(hubId) =>
            listings.filter((listing) => listing.hubId === hubId).map((listing) => listing.id)
          }
          create={(newWorkflow) => host.create(newWorkflow)}
          onCreated={(ref) => {
            setCreating(false);
            read();
            open?.(ref);
          }}
          onCancel={() => setCreating(false)}
          onDescribe={
            describe &&
            ((name) => {
              setCreating(false);
              describe(name);
            })
          }
          returnFocus={() => null}
        />
      )}
    </div>
  );
}

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

/**
 * The line over the rows the list kept when a later read failed, with **Try again**, and **Copy
 * details** when there's no reason to show (as the Runs list's).
 */
function RefreshFailed({
  error,
  words,
  refreshing,
  tryAgain,
}: {
  readonly error: unknown;
  readonly words: EngineWords;
  readonly refreshing: boolean;
  readonly tryAgain: () => void;
}) {
  const copyDetails = useCopyDetails();
  return (
    <p className="flex flex-wrap items-center gap-2 text-small text-fg-muted">
      {error instanceof EngineNotAnswering
        ? words.showingLast
        : `${listWords.refreshFailed} ${engineReasonFor(error, words.notAnswering)}`}
      {isUnexplained(error) && (
        <button
          type="button"
          className={inlineLinkClasses}
          onClick={() => void copyDetails(detailsOf(listWords.refreshFailed, error))}
        >
          {copyDetailsWords.label}
        </button>
      )}
      <Button
        variant="ghost"
        busy={refreshing}
        busyLabel={listWords.tryingAgain}
        onClick={tryAgain}
      >
        {listWords.tryAgain}
      </Button>
    </p>
  );
}

/** A first read that failed: why, **Try again**, and **Copy details** when there's no reason to show. */
function LoadFailed({
  error,
  words,
  retrying,
  tryAgain,
}: {
  readonly error: unknown;
  readonly words: EngineWords;
  readonly retrying: boolean;
  readonly tryAgain: () => void;
}) {
  const copyDetails = useCopyDetails();
  return (
    <EmptyState
      tone="error"
      title={listWords.loadFailedTitle}
      description={engineReasonFor(error, words.notAnswering)}
      action={{ label: listWords.tryAgain, onClick: tryAgain, busy: retrying }}
      {...(isUnexplained(error)
        ? {
            link: {
              label: copyDetailsWords.label,
              onClick: () => void copyDetails(detailsOf(listWords.loadFailedTitle, error)),
            },
          }
        : {})}
    />
  );
}

/**
 * The rows' Alt-click and Alt Enter (flow-assistant 5.7): show the workflow in chat, as its ⋮'s
 * **Show in chat**; a broken file's row opens as on a plain click. None without the Assistant or
 * on a phone, where the ⋮ has no Show in chat either.
 */
function altOpenOf(
  showInChat: WorkflowsViewProps["showInChat"],
  phone: boolean,
  listingOf: (id: string) => WorkflowListing | undefined,
  openRow: (id: string) => void,
): { readonly onAltOpen?: (id: string) => void } {
  if (showInChat === undefined || phone) return {};
  return {
    onAltOpen: (id) => {
      const listing = listingOf(id);
      if (listing === undefined) openRow(id);
      else showInChat.show(listing);
    },
  };
}
