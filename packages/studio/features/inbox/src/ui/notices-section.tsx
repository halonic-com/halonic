import { Button, CloseIcon, EmptyState, ListHeading } from "@halonicjs/studio-kit";
import { type EngineWords, errorMessageFor } from "@halonicjs/studio-shell";
import { useId, useRef } from "react";
import type { InboxNotice, InboxNotices } from "../notices/inbox-notices.ts";
import { type NoticesState, useNotices } from "../notices/use-notices.ts";
import { markedName } from "../plain/hidden-characters.ts";

const loadFailed = "Couldn't load notices";

/**
 * The notices under Needs you (flow-inbox 3.2): flat rows acted on in place, each with its one
 * link and **×**. A fixed notice says "Fixed" instead of the link and keeps the ×. The heading is
 * hidden when there is nothing to show. Returns `null` with no source.
 *
 * @param openRun Opens a run's page; without it a notice has no **Open run**.
 * @param openBudget Opens the budget in Settings; without it the monthly budget notice has no **Change budget**.
 * @param onEmptied Called as the last notice is dismissed, to move focus somewhere that stays on the
 *   page: the section's heading goes with it.
 */
export function NoticesSection({
  source,
  openRun,
  openBudget,
  onEmptied,
  words,
}: {
  readonly source: InboxNotices | undefined;
  readonly openRun: ((hubId: string, runId: string) => void) | undefined;
  readonly openBudget?: (() => void) | undefined;
  readonly onEmptied: () => void;
  readonly words: EngineWords;
}) {
  const { notices, error, retry } = useNotices(source);
  const rows = useRef<HTMLUListElement>(null);
  // The dismissed row goes away, so focus moves first: to the next notice's ×, else the previous one's.
  const dismiss = (source: InboxNotices, index: number, key: string) => {
    const buttons = rows.current?.querySelectorAll<HTMLElement>("li button[aria-label^='Dismiss']");
    const next = buttons?.[index + 1] ?? buttons?.[index - 1];
    if (next === undefined) onEmptied();
    else next.focus();
    source.dismiss(key);
  };
  if (source === undefined) return null;
  if (notices.length === 0 && error === undefined) return null;
  return (
    <section aria-labelledby="inbox-notices">
      <ListHeading
        id="inbox-notices"
        name="Notices"
        {...(notices.length === 0 ? {} : { detail: String(notices.length) })}
      />
      {error === undefined ? null : (
        <NoticesError error={error} words={words} onRetry={retry} stale={notices.length > 0} />
      )}
      <ul ref={rows}>
        {notices.map((notice, index) => (
          <NoticeRow
            key={notice.key}
            notice={notice}
            openRun={openRun}
            openBudget={openBudget}
            dismiss={() => dismiss(source, index, notice.key)}
          />
        ))}
      </ul>
    </section>
  );
}

function NoticeRow({
  notice,
  openRun,
  openBudget,
  dismiss,
}: {
  readonly notice: InboxNotice;
  readonly openRun: ((hubId: string, runId: string) => void) | undefined;
  readonly openBudget: (() => void) | undefined;
  readonly dismiss: () => void;
}) {
  const title = markedName(notice.title);
  const titleId = useId();
  const failed = notice.kind === "failed-run" ? notice : undefined;
  const run = notice.kind === "failed-run" || notice.kind === "budget-run" ? notice : undefined;
  const link =
    openRun === undefined || run === undefined ? null : (
      <Button
        variant="ghost"
        size="sm"
        aria-describedby={titleId}
        onClick={() => openRun(run.hubId, run.runId)}
      >
        Open run
      </Button>
    );
  const changeBudget =
    openBudget === undefined || notice.kind !== "budget-month" ? null : (
      <Button variant="ghost" size="sm" aria-describedby={titleId} onClick={openBudget}>
        Change budget
      </Button>
    );
  return (
    <li className="flex items-center gap-2 border-b border-border px-4 py-2">
      <p id={titleId} className="min-w-0 flex-1 text-body">
        {title}
      </p>
      {notice.kind === "sandbox-fixed" || failed?.fixed ? (
        <span className="text-small text-success">Fixed</span>
      ) : (
        (link ?? changeBudget)
      )}
      <Button
        variant="ghost"
        size="sm"
        icon={<CloseIcon />}
        label={`Dismiss ${title}`}
        onClick={dismiss}
      />
    </li>
  );
}

/** The section's own error (microcopy 10.1): Needs you stays as it is. */
function NoticesError({
  error,
  words,
  onRetry,
  stale,
}: {
  readonly error: NoticesState["error"];
  readonly words: EngineWords;
  readonly onRetry: () => void;
  readonly stale: boolean;
}) {
  const message = errorMessageFor(error, { title: loadFailed });
  const reason =
    message.kind === "internal" || message.body.trim() === ""
      ? words.notAnswering
      : message.body.trim();
  if (stale) return <p className="px-4 pb-2 text-small text-fg-muted">{words.showingLast}</p>;
  return (
    <EmptyState
      tone="error"
      align="start"
      title={loadFailed}
      description={reason}
      action={{ label: "Try again", onClick: onRetry }}
    />
  );
}
