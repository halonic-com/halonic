import type { FileReview, LeftOutFile, ReviewService } from "@halonicjs/app";
import type { TryItChanges, TryItLeftOutReason } from "@halonicjs/studio-feature-agents/api";

/** What the Try it line needs of the workspace's review service. */
export interface TryItChangesParts {
  readonly review: Pick<ReviewService, "tryItSource" | "changesIn" | "onDidChange">;
  /** The workspace's name, for "…before you trusted *Acme*." */
  readonly workspaceName: string;
  /** Hears a count that couldn't be read; the line then keeps what it last showed. */
  readonly reportError: (error: unknown) => void;
}

/** Reads the item's file path; rejects like the host's read when the item isn't there. */
export type ItemPath = () => Promise<string>;

/** Watches one item's changes to review, as a host part: `itemPath` reads where it is now. */
export type WatchItemTryItChanges = (
  itemPath: ItemPath,
  listener: (changes: TryItChanges) => void,
) => () => void;

/** The order the line names the reasons in, as the flow lists them (flow-assistant 4.4). */
const reasonOrder: readonly TryItLeftOutReason[] = [
  "permissions",
  "trust-and-sandbox",
  "connections",
  "models",
];

/**
 * Watches one agent's or workflow's changes to review for the Try it line
 * (`studio.try-it-changes`): reads them now and each time the review records change, and gives
 * `listener` only the newest answer, so a slow read never overwrites a newer one. Returns the
 * way to stop.
 */
export function watchTryItChanges(
  parts: TryItChangesParts,
  itemPath: ItemPath,
  listener: (changes: TryItChanges) => void,
): () => void {
  let stopped = false;
  let asked = 0;
  const refresh = () => {
    asked += 1;
    const turn = asked;
    tryItChangesOf(parts, itemPath).then(
      (changes) => {
        if (!stopped && turn === asked) listener(changes);
      },
      (error: unknown) => parts.reportError(error),
    );
  };
  const stopListening = parts.review.onDidChange(refresh);
  refresh();
  return () => {
    stopped = true;
    stopListening();
  };
}

/**
 * The item's changes to review as Try it reads them: those in its own file that the source
 * uses, and, over every file its run reads, those left out by reason and from before trust.
 */
export async function tryItChangesOf(
  parts: TryItChangesParts,
  itemPath: ItemPath,
): Promise<TryItChanges> {
  const path = await itemPath();
  const { leftOut } = await parts.review.tryItSource({ item: path });
  const inItem = changeCount(await parts.review.changesIn(path));
  const leftOutOfItem = sumOf(leftOut.files.filter((file) => file.path === path));
  return {
    included: Math.max(0, inItem - leftOutOfItem),
    leftOut: reasonOrder.map((reason) => ({
      reason,
      changes: sumOf(leftOut.files.filter((file) => file.reason === reason)),
    })),
    beforeTrust: leftOut.beforeTrust,
    workspaceName: parts.workspaceName,
  };
}

/** The changes to review in one file, as Changes counts them: a deleted file is one. */
function changeCount(review: FileReview | null): number {
  if (review === null) return 0;
  if (review.deleted) return 1;
  return review.parts.length;
}

function sumOf(files: readonly LeftOutFile[]): number {
  return files.reduce((total, file) => total + file.changes, 0);
}
