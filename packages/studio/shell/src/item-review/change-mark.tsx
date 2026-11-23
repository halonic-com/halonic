import { Button } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { itemReviewWords as words } from "./item-review-words.ts";

/**
 * How a change looks in place: an added step or field has a green edge, a removed one stays
 * visible struck through in red, and a changed field shows its old value struck through above it.
 */
export type ChangeMarkKind = "added" | "removed" | "changed";

/** Which of the mark's decisions is running, so its button shows it is busy. */
export type ChangeMarkBusy = "accept" | "reject";

/** Props for {@link ChangeMark}. */
export interface ChangeMarkProps {
  /** The change's id, as the item page steps to it: see {@link changeMarkSelector}. */
  readonly id: string;
  /** The change in words, as the describers say it: "Model: claude → gpt". */
  readonly sentence: string;
  readonly kind: ChangeMarkKind;
  /** Instructions, permissions, trust and sandbox, connections, models (AI changes 1.7). */
  readonly important?: boolean | undefined;
  /** The value before the change, struck through: above the field when changed, alone when removed. */
  readonly before?: string | undefined;
  readonly onAccept: () => void;
  readonly onReject: () => void;
  /**
   * The only change of a file the assistant created: rejecting it deletes the file, so Reject says
   * "Reject and delete file" (T14 review panel note 3).
   */
  readonly deletesFile?: boolean | undefined;
  readonly busy?: ChangeMarkBusy | undefined;
  /** Where the decisions wait, as the bar's do while the file changed outside Halonic. */
  readonly waiting?: boolean | undefined;
  /** The field or step as it is now. */
  readonly children?: ReactNode;
}

/** The edge on the mark's start side, by kind. */
const edgeClasses: Readonly<Record<ChangeMarkKind, string>> = {
  added: "border-success",
  removed: "border-danger",
  changed: "border-accent",
};

/**
 * One of the assistant's changes marked in place on an item page (`shell.change-mark`, AI changes
 * 1.2), around the field or step it changed, with its own Accept and Reject. The mark is a fieldset
 * named by the change's sentence, and Previous and Next in the item bar move the focus to it.
 *
 * @example
 * <ChangeMark id="field:model" sentence="Model: claude → gpt" kind="changed" before="claude" onAccept={accept} onReject={reject}>
 *   <ModelField />
 * </ChangeMark>
 */
export function ChangeMark({
  id,
  sentence,
  kind,
  important = false,
  before,
  onAccept,
  onReject,
  deletesFile = false,
  busy,
  waiting = false,
  children,
}: ChangeMarkProps) {
  return (
    <fieldset
      aria-label={sentence}
      tabIndex={-1}
      data-change-id={id}
      className={`focus-ring flex flex-col gap-2 rounded-md border-s-2 py-1 ps-3 ${edgeClasses[kind]}`}
    >
      <p className="flex flex-wrap items-center gap-x-2 text-small text-fg-muted">
        {important && (
          <span className="text-label font-medium text-warning uppercase">{words.important}</span>
        )}
        <span>{sentence}</span>
      </p>
      {before !== undefined && (
        <del className={kind === "removed" ? "text-danger" : "text-fg-muted"}>{before}</del>
      )}
      {children}
      {!waiting && (
        <span className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" busy={busy === "accept"} onClick={onAccept}>
            {words.accept}
          </Button>
          <Button variant="secondary" size="sm" busy={busy === "reject"} onClick={onReject}>
            {deletesFile ? words.rejectAndDelete : words.reject}
          </Button>
        </span>
      )}
    </fieldset>
  );
}

/**
 * The CSS selector of the mark for the change `id`, for a page that scrolls Previous's or Next's
 * change into view and moves the focus to it.
 *
 * @example
 * page.querySelector<HTMLElement>(changeMarkSelector("field:model"))?.focus();
 */
export function changeMarkSelector(id: string): string {
  return `[data-change-id="${CSS.escape(id)}"]`;
}
