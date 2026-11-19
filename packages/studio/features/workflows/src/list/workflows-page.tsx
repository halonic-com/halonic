import { Button, EmptyState, inlineLinkClasses, usePresentation } from "@halonicjs/studio-kit";
import {
  copyDetailsWords,
  detailsOf,
  EngineNotAnswering,
  type EngineWords,
  engineWordsOf,
  errorReasonFor,
  OverviewPage,
  type PlaceViewProps,
  useCopyDetails,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type WorkflowListing,
  type WorkflowRef,
  type WorkflowsHost,
  WorkflowsHostService,
} from "../api.ts";
import { NewWorkflowDialog } from "../new/new-workflow-dialog.tsx";
import { listWords } from "./list-words.ts";
import { dropNewWorkflowRequest, takeNewWorkflowRequests } from "./new-request.ts";
import { rowId, workflowHubs } from "./workflow-rows.tsx";

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
  return (
    <WorkflowsView
      host={context.services.get(WorkflowsHostService)}
      engine={engineWordsOf(context)}
      {...(open ? { open } : {})}
      {...(openInNewTab ? { openInNewTab } : {})}
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
export function WorkflowsView({ host, open, openInNewTab, engine }: WorkflowsViewProps) {
  const words = engine ?? engineWordsOf({});
  const phone = usePresentation() === "phone";
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [creating, setCreating] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);

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
  const openRow = (id: string) => {
    const listing = listings.find((each) => rowId(each) === id);
    if (listing !== undefined) open?.(listing);
  };
  const openRowInNewTab = (id: string) => {
    const listing = listings.find((each) => rowId(each) === id);
    if (listing !== undefined) (openInNewTab ?? open)?.(listing);
  };
  const startCreating = () => setCreating(true);
  // A workflow needs a hub to live in, and the hubs are known only once the first read is done.
  const canCreate = load.kind === "ready" && host.hubs().length > 0;
  // A phone doesn't edit workflows, so its list has no New workflow (UX 10.15).
  const offersNew = canCreate && !phone;
  // Ctrl K's New workflow waits until the dialog can open; with no hub to put one in, it is dropped.
  const noHubs = load.kind === "ready" && host.hubs().length === 0;
  useEffect(() => {
    if (noHubs) dropNewWorkflowRequest();
    return canCreate ? takeNewWorkflowRequests(() => setCreating(true)) : undefined;
  }, [canCreate, noHubs]);

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-5">
      <header className={phone ? "sr-only" : "flex flex-col gap-1"}>
        <h1 ref={title} tabIndex={-1} className="text-title outline-none">
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
          hubs={workflowHubs(host.hubs(), listings)}
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
              ...(offersNew
                ? { action: { label: listWords.newWorkflow, onClick: startCreating } }
                : {}),
            },
          }}
          loading={load.kind === "loading"}
          quietWhenEmpty
          {...(offersNew
            ? { newButton: { label: listWords.newWorkflow, onClick: startCreating } }
            : {})}
          onOpen={openRow}
          onOpenInNewTab={openRowInNewTab}
        />
      )}
      {creating && (
        <NewWorkflowDialog
          hubs={host.hubs()}
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
          returnFocus={() => null}
        />
      )}
    </div>
  );
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
        : `${listWords.refreshFailed} ${reasonOf(error, words)}`}
      {unexplained(error) && (
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
      description={reasonOf(error, words)}
      action={{ label: listWords.tryAgain, onClick: tryAgain, busy: retrying }}
      {...(unexplained(error)
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
 * Why the list couldn't be read. The list reads the workspace's files, which works while the
 * engine is stopped, so only a host that says the engine can't be reached gets "isn't answering";
 * any other failure gives a kinded error's own reason, else "Halonic ran into a problem it can't
 * explain yet." (microcopy 22 F13).
 */
function reasonOf(error: unknown, words: EngineWords): string {
  return error instanceof EngineNotAnswering ? words.notAnswering : errorReasonFor(error);
}

/** Whether the failure has no reason of its own to show, so the page offers Copy details. */
function unexplained(error: unknown): boolean {
  return !(error instanceof EngineNotAnswering) && errorReasonFor(error, "") === "";
}
