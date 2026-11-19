import { shortRunId } from "@halonicjs/app";
import { Button, EmptyState, List, StatusChip } from "@halonicjs/studio-kit";
import { type EngineWords, PageBackLinkSlot } from "@halonicjs/studio-shell";
import type { ReactNode } from "react";
import type { SourcedRun } from "../api.ts";
import { FailureReason, RefreshFailedLine } from "../load-failure.tsx";
import { runPageWords } from "../run-words.ts";
import type { RunAgain } from "./run-again.ts";
import { RunAgainFailed } from "./run-again-failed.tsx";
import { type RunPageContext, runHeader } from "./run-page-model.ts";

/** What stands where the receipt and Every step go while the log isn't read: a skeleton, or why not. */
export function LogUnread({
  failure,
  retry,
  engine,
}: {
  readonly failure: unknown;
  readonly retry: () => void;
  readonly engine: EngineWords;
}) {
  if (failure === undefined) {
    return (
      <List
        label={runPageWords.loadingLog}
        rows={[]}
        loading
        loadingLabel={runPageWords.loadingLog}
      />
    );
  }
  return (
    <EmptyState
      tone="error"
      align="start"
      title={runPageWords.logFailed}
      description={<FailureReason what={runPageWords.logFailed} error={failure} engine={engine} />}
      action={{ label: "Try again", onClick: retry }}
    />
  );
}

/** The header, the line when a later read failed, then what goes under them. */
export function RunLayout({
  run,
  context,
  refreshError,
  engine,
  phone,
  runAgain,
  children,
}: {
  readonly run: SourcedRun;
  readonly context: RunPageContext;
  /** Why the latest read of the runs failed; the page keeps what it showed. */
  readonly refreshError: unknown;
  readonly engine: EngineWords;
  readonly phone: boolean;
  readonly runAgain: RunAgain | undefined;
  readonly children: ReactNode;
}) {
  const header = runHeader(run, context);
  return (
    <div className={`flex w-full min-w-0 flex-col gap-4 ${phone ? "px-4 py-4" : "px-6 py-5"}`}>
      <PageBackLinkSlot />
      <header className="flex flex-col gap-1">
        <p className="text-small text-fg-muted">{header.kindLabel}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={phone ? "sr-only" : "text-title"}>{header.title}</h1>
          <StatusChip tone={header.chip.tone} dot={header.chip.dot}>
            {header.chip.word}
          </StatusChip>
          {runAgain === undefined ? null : (
            <Button variant="secondary" size="sm" busy={runAgain.busy} onClick={runAgain.start}>
              {runPageWords.runAgain}
            </Button>
          )}
        </div>
        <p className="text-small text-fg-muted">{header.line}</p>
        {header.catchUpLine === undefined ? null : (
          <p className="text-small text-fg-muted">{header.catchUpLine}</p>
        )}
      </header>
      <RunAgainFailed runAgain={runAgain} engine={engine} />
      {refreshError === undefined ? null : (
        <RefreshFailedLine
          what={runPageWords.refreshFailed(shortRunId(run.summary.id))}
          error={refreshError}
          engine={engine}
        />
      )}
      {children}
    </div>
  );
}
