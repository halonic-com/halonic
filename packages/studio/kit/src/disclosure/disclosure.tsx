import type { ReactNode } from "react";
import { ChevronDownIcon } from "../icons/chevron-down-icon.tsx";
import { WarningIcon } from "../icons/warning-icon.tsx";

/** `label` for a summary that names something, `value` for a summary that's a value. */
export type DisclosureTone = "label" | "value";

/** The props of `Disclosure`. */
export interface DisclosureProps {
  /** The row's words: "How the budget works", or a value under a `label`: "3 items". */
  readonly summary: string;
  /** The row's words while it is open, when they say what activating it does: "Hide the report". */
  readonly openSummary?: string;
  /** `label` (the default) is `text-body-strong`, `value` is `text-body`. */
  readonly tone?: DisclosureTone;
  /** Open when it first renders. After that the user opens and closes it. */
  readonly defaultOpen?: boolean;
  /**
   * A caption above the row, for a summary that's only a value: "What's in it" over "3 items".
   * Screen readers hear it inside the row: "What's in it, 3 items, collapsed".
   */
  readonly label?: string;
  /** Muted words after the summary that say what is inside: "Base URL, secret name, local". */
  readonly detail?: string;
  /**
   * `warning` puts the triangle in the attention colour before the words, hidden from screen
   * readers: the rows inside carry the warning in words, so the row's name stays the same.
   */
  readonly mark?: "warning";
  /** What opens in place. Nothing in it is part of the row. */
  readonly children: ReactNode;
}

/** The warning mark before the words: 16px, in the attention colour like the Callout's. */
const warningMarkClasses = "inline-grid size-icon-sm shrink-0 text-attention *:size-full";

/**
 * The row: at least 48px, padded 0 16px like a List row, with the 20px chevron at the right.
 * `summary-plain` hides the browser's own triangle, in WebKitGTK and Safari too. In forced
 * colours a browser may paint a summary in the link colour; the row isn't a link, so it keeps
 * the text colour. That is a variant, not part of `summary-plain`: Tailwind sorts variants after
 * `text-fg`, so it wins.
 */
const summaryClasses = [
  "flex min-h-touch cursor-pointer items-center summary-plain gap-3 px-4 text-fg",
  "forced-colors:text-[CanvasText]",
  "transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-subtle",
  "focus-ring-inset",
].join(" ");

/**
 * Points down when closed and up when open. It flips at once: no animation in v0.1. Its own
 * `text-fg-subtle` would beat the row's colour, so in forced colours it takes CanvasText itself.
 */
const chevronClasses = [
  "inline-grid size-icon-md shrink-0 place-items-center text-fg-subtle *:size-full",
  "forced-colors:text-[CanvasText]",
  "group-open/disclosure:rotate-180",
].join(" ");

/**
 * A row that opens more in place: "How the budget works". A native `<details>`, so the browser
 * opens and closes it with a click, Enter and Space, and tells screen readers whether it's open.
 * It draws no lines of its own: in a flush List it takes the List's line like any row.
 *
 * @example
 * <Disclosure summary="How the budget works">
 *   Budgets reset on the first of each month.
 * </Disclosure>
 * <Disclosure label="What's in it" summary="3 items" tone="value">…</Disclosure>
 */
export function Disclosure({
  summary,
  openSummary,
  tone = "label",
  defaultOpen = false,
  label,
  detail,
  mark,
  children,
}: DisclosureProps) {
  const hasLabel = label !== undefined && label !== "";
  const details = (
    <details open={defaultOpen} className="group/disclosure">
      <summary
        className={`${summaryClasses} ${tone === "label" ? "text-body-strong" : "text-body"}`}
      >
        {hasLabel ? <span className="sr-only">{`${label}, `}</span> : null}
        {mark === "warning" ? (
          <span aria-hidden="true" className={warningMarkClasses}>
            <WarningIcon />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 wrap-break-word">
          <SummaryWords summary={summary} openSummary={openSummary} />
          {detail === undefined || detail === "" ? null : (
            <span className="text-small font-normal text-fg-muted">{` ${detail}`}</span>
          )}
        </span>
        <span aria-hidden="true" className={chevronClasses}>
          <ChevronDownIcon />
        </span>
      </summary>
      <div className="px-4 pt-1 pb-4 text-small text-fg-muted">{children}</div>
    </details>
  );
  if (!hasLabel) {
    return details;
  }
  return (
    <div>
      {/* Seen, not read: the row says the same words, so it's heard once, as part of its name. */}
      <p aria-hidden="true" className="px-4 pt-2 text-caption text-fg-muted">
        {label}
      </p>
      {details}
    </div>
  );
}

/**
 * The summary, swapped for `openSummary` while the `<details>` is open. CSS swaps them, so the
 * browser alone still opens and closes it; the hidden words are `display: none`, so the row's
 * name is only the words in view.
 */
function SummaryWords({
  summary,
  openSummary,
}: {
  readonly summary: string;
  readonly openSummary: string | undefined;
}) {
  if (openSummary === undefined) {
    return summary;
  }
  return (
    <>
      <span className="group-open/disclosure:hidden">{summary}</span>
      <span className="hidden group-open/disclosure:inline">{openSummary}</span>
    </>
  );
}
