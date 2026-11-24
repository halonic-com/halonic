import type { ReactNode } from "react";
import { ChangeMark, type ChangeMarkKind } from "./change-mark.tsx";
import { changesDecided } from "./changes-decided.ts";
import type { ItemChangeToReview, ItemReview } from "./item-review-api.ts";
import { itemReviewWords as words } from "./item-review-words.ts";
import type { ItemReviewMarks } from "./use-item-review.tsx";

/**
 * The mark for one of the changes {@link useItemReview} read, with its Accept and Reject. When a
 * decision also settles other changes (`needs`), the mark names them under its sentence. Around a
 * field (`children`), the field sits between those lines and the buttons.
 *
 * @example
 * <ItemChangeMark marks={changes.marks} change={change}>
 *   <Field label="Model">…</Field>
 * </ItemChangeMark>
 */
export function ItemChangeMark({
  marks,
  change,
  children,
}: {
  readonly marks: ItemReviewMarks;
  readonly change: ItemChangeToReview;
  readonly children?: ReactNode;
}) {
  const { review, decide, busy, held } = marks;
  return (
    <ChangeMark
      id={change.id}
      sentence={change.sentence}
      kind={changeMarkKindOf(review, change)}
      important={change.important}
      before={shownValue(change.before?.value)}
      onAccept={() => decide(change, "accept")}
      onReject={() => decide(change, "reject")}
      deletesFile={review.created}
      busy={busy?.id === change.id ? busy.verb : undefined}
      waiting={held}
    >
      <TakenAlong review={review} change={change} />
      {children}
    </ChangeMark>
  );
}

/** How a change looks in place: a change to a file the assistant created is all added. */
export function changeMarkKindOf(review: ItemReview, change: ItemChangeToReview): ChangeMarkKind {
  if (review.created) return "added";
  return change.before === undefined && !review.whole ? "added" : "changed";
}

/** The other changes Accept and Reject settle along with this one, each named by its sentence. */
function TakenAlong({
  review,
  change,
}: {
  readonly review: ItemReview;
  readonly change: ItemChangeToReview;
}) {
  if (review.whole) return null;
  const others = (verb: "accept" | "reject") =>
    changesDecided(review, change, verb)
      .slice(1)
      .map((other) => other.sentence);
  const accepts = others("accept");
  const rejects = others("reject");
  if (accepts.length === 0 && rejects.length === 0) return null;
  return (
    <ul className="text-small text-fg-muted">
      {accepts.length > 0 && <li>{words.alsoAccepts(accepts)}</li>}
      {rejects.length > 0 && <li>{words.alsoRejects(rejects)}</li>}
    </ul>
  );
}

/** The old value as the mark strikes it through; a value with no short text shows none. */
function shownValue(value: unknown): string | undefined {
  if (value === "") return undefined;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value) && value.every((each) => typeof each === "string")) {
    return value.join(", ");
  }
  return undefined;
}
