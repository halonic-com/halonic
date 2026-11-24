import {
  type ChangeLine,
  type FileReview,
  partValueIn,
  type ReviewOutcome,
  type ReviewService,
  type ReviewTarget,
} from "@halonicjs/app";
import { type KindName, type KindValues, parseFile } from "@halonicjs/format";
import { applyLineChanges } from "@halonicjs/std";
import type {
  ItemChangeToReview,
  ItemReview,
  ItemReviewDecision,
  ItemReviewHost,
  ItemReviewTarget,
} from "@halonicjs/studio-shell";
import { placeOf } from "@halonicjs/workspace";

/** What {@link WorkspaceItemReview} needs. */
export interface WorkspaceItemReviewParts<Ref, Kind extends KindName> {
  /** The workspace's review service (`workspace.review`). */
  readonly review: Pick<
    ReviewService,
    "changesIn" | "accept" | "reject" | "restore" | "onDidChange"
  >;
  /** The item's file from the workspace folder; rejects when the item isn't there. */
  readonly pathOf: (ref: Ref) => Promise<string>;
  /** The kind of file the item is, such as `agent`. */
  readonly kind: Kind;
  /** The item's describer from `@halonicjs/app`, such as `describeAgentChange`. */
  readonly describe: (
    before: KindValues[Kind] | undefined,
    after: KindValues[Kind] | undefined,
  ) => ChangeLine[];
}

/**
 * An item page's changes to review, over the workspace's review service: one change per line the
 * item's describer names, from the file with every open change rejected (the baseline) to the
 * saved file. The agents and workflows pages each provide one under their own service key.
 *
 * @example
 * new WorkspaceItemReview({ review, pathOf, kind: "agent", describe: describeAgentChange });
 */
export class WorkspaceItemReview<Ref, Kind extends KindName> implements ItemReviewHost<Ref> {
  readonly #parts: WorkspaceItemReviewParts<Ref, Kind>;

  constructor(parts: WorkspaceItemReviewParts<Ref, Kind>) {
    this.#parts = parts;
  }

  async changesIn(ref: Ref): Promise<ItemReview | null> {
    const path = await this.#parts.pathOf(ref);
    const found = await this.#parts.review.changesIn(path);
    return found === null ? null : this.#reviewOf(found);
  }

  accept(target: ItemReviewTarget): Promise<ItemReviewDecision> {
    return this.#decide(target, "accept");
  }

  reject(target: ItemReviewTarget): Promise<ItemReviewDecision> {
    return this.#decide(target, "reject");
  }

  subscribe(ref: Ref, listener: () => void): () => void {
    let path: string | undefined;
    // Until the path is known (or when it can't be read), every change counts, so none is missed:
    // reading again once too often costs nothing.
    this.#parts.pathOf(ref).then(
      (found) => {
        path = found;
      },
      () => {},
    );
    return this.#parts.review.onDidChange((paths) => {
      if (path === undefined || paths.includes(path)) listener();
    });
  }

  async #decide(target: ItemReviewTarget, decision: Decision): Promise<ItemReviewDecision> {
    const reviewTarget = reviewTargetOf(target, decision);
    const outcome: ReviewOutcome = await this.#parts.review[decision](reviewTarget);
    if (outcome.status !== "done") return { status: outcome.status };
    if (outcome.held.includes(reviewTarget.path)) return { status: "held" };
    const { step } = outcome;
    return {
      status: "done",
      undo: async () => {
        const undone = await this.#parts.review.restore(step, "before");
        return undone.status === "done" && undone.held.length > 0 ? "held" : "done";
      },
    };
  }

  /** The changes of one file's review, read as the item before and after. */
  #reviewOf(found: FileReview): ItemReview {
    const { path, baseline, seen } = found;
    // The parts are the line changes from the baseline to the text they were worked out from.
    const current = found.deleted ? null : applyLineChanges(baseline ?? "", found.parts);
    const before = this.#itemIn(path, baseline);
    const after = this.#itemIn(path, current);
    const lines =
      before === "unreadable" || after === "unreadable" ? [] : this.#parts.describe(before, after);
    // Only comments or spacing changed, or a text doesn't read as the item: one change for the file.
    const whole = baseline === null || current === null || lines.length === 0;
    const changes = whole
      ? [wholeFileChange(baseline, current)]
      : lines.map((line) => changeOf(line, baseline));
    return { path, whole, created: baseline === null, changes, seen };
  }

  /** The item a text holds, `undefined` for no text, or `unreadable`. */
  #itemIn(path: string, text: string | null): KindValues[Kind] | undefined | "unreadable" {
    if (text === null) return undefined;
    const id = placeOf(path)?.placeId;
    const parsed = parseFile(this.#parts.kind, text, id === undefined ? {} : { id });
    return parsed.ok ? parsed.value.value : "unreadable";
  }
}

type Decision = "accept" | "reject";

/**
 * The service's target for a decision. A review that is decided as a whole, and Accept all or
 * Reject all, cover the file; any other change covers its own parts and those of the changes
 * {@link changesDecided} takes along.
 */
function reviewTargetOf(
  target: ItemReviewTarget,
  decision: Decision,
): Extract<ReviewTarget, { path: string }> {
  if (target.kind === "all") return { kind: "file", path: target.path };
  const { review, change } = target;
  if (review.whole) return { kind: "file", path: review.path };
  const parts = changesDecided(review, change, decision).flatMap((decided) => decided.parts);
  return { kind: "change", path: review.path, parts, seen: review.seen };
}

/**
 * The changes one decision covers: Accept keeps the changes the change needs, and Reject undoes
 * the changes that need it, each in turn, so the item never points at a step that isn't there.
 */
function changesDecided(
  review: ItemReview,
  change: ItemChangeToReview,
  decision: Decision,
): ItemChangeToReview[] {
  const takesAlong = (decided: ItemChangeToReview, other: ItemChangeToReview): boolean =>
    decision === "accept"
      ? (decided.needs ?? []).includes(other.id)
      : (other.needs ?? []).includes(decided.id);
  const decided = [change];
  // The loop also visits the changes it adds, so the ones they take along come too.
  for (const next of decided) {
    for (const other of review.changes) {
      if (!decided.includes(other) && takesAlong(next, other)) decided.push(other);
    }
  }
  return decided;
}

function changeOf(line: ChangeLine, baseline: string | null): ItemChangeToReview {
  const [first] = line.parts;
  const before = first === undefined ? undefined : partValueIn(baseline, first);
  return {
    id: line.id,
    sentence: line.sentence,
    important: line.important === true,
    parts: line.parts,
    ...(before?.found === true ? { before: { value: before.value } } : {}),
    ...(line.needs === undefined ? {} : { needs: line.needs }),
  };
}

/** The one change of a file decided as a whole, in the words `describeFileChange` uses. */
function wholeFileChange(baseline: string | null, current: string | null): ItemChangeToReview {
  return {
    id: "item",
    sentence: wholeFileSentence(baseline, current),
    important: false,
    parts: [],
  };
}

function wholeFileSentence(baseline: string | null, current: string | null): string {
  if (baseline === null) return "New";
  if (current === null) return "Deleted";
  return "Changed";
}
