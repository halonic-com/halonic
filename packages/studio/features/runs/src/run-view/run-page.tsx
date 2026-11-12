import { shortRunId } from "@halonicjs/app";
import { Callout, type CalloutAction, EmptyState, List, StatusChip } from "@halonicjs/studio-kit";
import { ItemGone, type ItemViewProps } from "@halonicjs/studio-shell";
import { type ReactNode, useCallback, useSyncExternalStore } from "react";
import type { SourcedRun } from "../api.ts";
import { loadFailureReason } from "../load-failure.ts";
import { emptyListWords, runPageWords } from "../run-words.ts";
import { type RunsList, RunsListService } from "../runs-list.ts";
import {
  type BannerAction,
  type RunBanner,
  type RunPageContext,
  runBanner,
  runHeader,
} from "./run-page-model.ts";

/** The `run` item kind's page: one run of the open workspace, from `RunsListService`. */
export function RunPage({ item, context }: ItemViewProps) {
  const { openPlace, openItem } = context;
  return (
    <RunView
      list={context.services.get(RunsListService)}
      runId={item.id}
      {...(openPlace === undefined
        ? {}
        : { goToRuns: () => openPlace("runs"), reviewInInbox: () => openPlace("inbox") })}
      {...(openItem === undefined
        ? {}
        : {
            openRun: (runId: string) => openItem({ kind: "run", hub: item.hub, id: runId }),
          })}
    />
  );
}

/** Props for {@link RunView}. */
export interface RunViewProps {
  readonly list: RunsList;
  readonly runId: string;
  /** Opens the Runs list, for a run that isn't there any more. */
  readonly goToRuns?: () => void;
  /** Opens the Inbox, for Review in Inbox; without it the button isn't there. */
  readonly reviewInInbox?: () => void;
  /** Opens another run's page, for a child run; without it the button isn't there. */
  readonly openRun?: (runId: string) => void;
  /** The clock for the start time and due times; tests pass a fixed one. */
  readonly now?: () => Date;
}

/**
 * The run page on the desktop (checklist part 1, 1.5, 1.6 and 1.8): the
 * header, then a banner only when the run needs attention. It reads the same
 * runs as the Runs list, so it updates in place as the run moves on (R14,
 * D1), and keeps what it showed when a later load fails (R18).
 *
 * Not here yet: the receipt, Every step and Details (the next pull request),
 * Started by, the header's ⋮, Run again (T7) and the failed banners by cause
 * (HAL-1845).
 */
export function RunView({
  list,
  runId,
  goToRuns,
  reviewInInbox,
  openRun,
  now = () => new Date(),
}: RunViewProps) {
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  const run = state.runs.find((candidate) => candidate.summary.id === runId);
  const title = runPageWords.title(shortRunId(runId));
  const retry = () => void list.refresh();

  if (run !== undefined) {
    const context = pageContext(list, state.runs, run, now());
    return (
      <RunLayout run={run} context={context} showingLast={state.error !== undefined}>
        <Banner banner={runBanner(run, context)} reviewInInbox={reviewInInbox} openRun={openRun} />
      </RunLayout>
    );
  }
  if (state.loaded) {
    return goToRuns === undefined ? (
      <EmptyState title={runPageWords.notHere} />
    ) : (
      <ItemGone kindName="run" place="Runs" onGoTo={goToRuns} />
    );
  }
  return (
    <div className="flex w-full flex-col gap-4 px-6 py-5">
      <h1 className="text-title">{title}</h1>
      {state.error === undefined ? (
        <List
          label={title}
          rows={[]}
          loading
          loadingLabel={runPageWords.loading(shortRunId(runId))}
          onRetry={retry}
        />
      ) : (
        <EmptyState
          tone="error"
          align="start"
          title={runPageWords.loadFailed(shortRunId(runId))}
          description={loadFailureReason(state.error)}
          action={{ label: "Try again", onClick: retry }}
        />
      )}
    </div>
  );
}

/** The header, the engine line while the engine doesn't answer, then what goes under them. */
function RunLayout({
  run,
  context,
  showingLast,
  children,
}: {
  readonly run: SourcedRun;
  readonly context: RunPageContext;
  readonly showingLast: boolean;
  readonly children: ReactNode;
}) {
  const header = runHeader(run, context);
  return (
    <div className="flex w-full flex-col gap-4 px-6 py-5">
      <header className="flex flex-col gap-1">
        <p className="text-small text-fg-muted">{header.kindLabel}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-title">{header.title}</h1>
          <StatusChip tone={header.chip.tone} dot={header.chip.dot}>
            {header.chip.word}
          </StatusChip>
        </div>
        <p className="text-small text-fg-muted">{header.line}</p>
      </header>
      {showingLast ? (
        <p className="text-small text-fg-muted">{emptyListWords.showingLast}</p>
      ) : null}
      {children}
    </div>
  );
}

/**
 * The one banner: a Callout in a region named by its hidden title, or the
 * cancelled run's plain note. A banner that appears mid-run doesn't take focus.
 */
function Banner({
  banner,
  reviewInInbox,
  openRun,
}: {
  readonly banner: RunBanner | undefined;
  readonly reviewInInbox: (() => void) | undefined;
  readonly openRun: ((runId: string) => void) | undefined;
}) {
  if (banner === undefined) {
    return null;
  }
  if (banner.kind === "note") {
    return <p className="text-body">{banner.text}</p>;
  }
  const action = bannerAction(banner.action, reviewInInbox, openRun);
  return (
    <section aria-label={banner.name}>
      <Callout
        tone={banner.tone}
        {...(banner.title === undefined ? {} : { title: banner.title })}
        {...(action === undefined ? {} : { action })}
      >
        {banner.lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </Callout>
    </section>
  );
}

/** The banner's button, when the page can do what it asks. */
function bannerAction(
  action: BannerAction | undefined,
  reviewInInbox: (() => void) | undefined,
  openRun: ((runId: string) => void) | undefined,
): CalloutAction | undefined {
  if (action?.kind === "review-in-inbox" && reviewInInbox !== undefined) {
    return { label: runPageWords.reviewInInbox, onClick: reviewInInbox };
  }
  if (action?.kind === "open-run" && openRun !== undefined) {
    const { runId } = action;
    return { label: action.label, onClick: () => openRun(runId) };
  }
  return undefined;
}

/** What the page's words need: the run's workflow, the child runs' workflows, the currency, the time. */
function pageContext(
  list: RunsList,
  runs: readonly SourcedRun[],
  run: SourcedRun,
  now: Date,
): RunPageContext {
  const { source } = list;
  return {
    workflow: source.workflow(run.summary.hubId, run.summary.workflowId),
    workflowOfRun: (runId) => {
      const other = runs.find((candidate) => candidate.summary.id === runId)?.summary;
      if (other === undefined) {
        return undefined;
      }
      return source.workflow(other.hubId, other.workflowId)?.name ?? other.workflowId;
    },
    currency: source.currency(),
    now,
  };
}
