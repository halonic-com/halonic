import { describeFileChange, type FileReview } from "@halonicjs/app";
import type { ItemRef } from "@halonicjs/studio-shell";
import { placeOf } from "@halonicjs/workspace";
import { cardWords } from "./card-words.ts";

/** What a card's tag says: a new file, a changed one, or a delete. */
export type CardTag = keyof typeof cardWords.tag;

/** What a card says about its change (flow-assistant 3.2). */
export interface CardFacts {
  readonly tag: CardTag;
  /** The item's name, as the toasts say it: "Support triage", never the path. */
  readonly name: string;
  /** "Support triage: 2 steps added", Changes' words for the same change. */
  readonly sentence: string;
  /** The change touches an important setting (AI changes 1.7). */
  readonly important: boolean;
}

/**
 * What the card says about the write of `content` to `path` (`null` for a delete). With its
 * changes to review it describes them from their baseline, as Changes does, so the person reads
 * the same words before and after accepting. Without them (nothing read yet, or all decided
 * before this chat was opened) it says only whether the file was changed or deleted.
 */
export function factsOf(path: string, content: string | null, review?: FileReview): CardFacts {
  if (review === undefined) {
    const deleting = content === null;
    const line = deleting ? cardWords.wholeFile.deleted : cardWords.wholeFile.changed;
    return facts(deleting ? "delete" : "changed", nameOf(path), line, false);
  }
  const after = review.deleted ? null : content;
  const change = describeFileChange(path, review.baseline, after);
  const line = change.lines[0]?.sentence ?? cardWords.wholeFile.changed;
  const important = change.lines.some((each) => each.important === true);
  return facts(tagOf(review), change.name ?? nameOf(path), line, important);
}

/** How many changes to review the file has: its line changes, or one for a delete. */
export function changeCount(review: FileReview): number {
  return review.deleted ? 1 : Math.max(1, review.parts.length);
}

/**
 * Where **Review** goes (flow-assistant 3.2): an agent, workflow or routine opens its page; any
 * other file opens in the code editor; a delete opens Changes, which lists the deleted item.
 */
export function reviewPlaceOf(
  path: string,
  deleting: boolean,
): { readonly kind: "item"; readonly item: ItemRef } | { readonly kind: "changes" } {
  if (deleting) return { kind: "changes" };
  const place = placeOf(path);
  if (place?.placeId !== undefined && pageKinds.includes(place.kind)) {
    return { kind: "item", item: { kind: place.kind, hub: place.hub ?? "", id: place.placeId } };
  }
  return { kind: "item", item: { kind: "file", hub: "workspace", id: path } };
}

/** The kinds with a page of their own, as Changes opens them. */
const pageKinds: readonly string[] = ["agent", "workflow", "routine"];

function tagOf(review: FileReview): CardTag {
  if (review.deleted) return "delete";
  return review.baseline === null ? "new" : "changed";
}

/** An item's name from its path: its id, or the file's name without its extension. */
function nameOf(path: string): string {
  const placeId = placeOf(path)?.placeId;
  if (placeId !== undefined) return placeId;
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.indexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
}

function facts(tag: CardTag, name: string, line: string, important: boolean): CardFacts {
  return { tag, name, sentence: cardWords.sentence(name, line), important };
}
