import type { MessagingSource, SearchHit } from "@halonicjs/ports";

/** The kinds of hit, in the order the results show them. */
export const searchKinds: readonly SearchHit["kind"][] = [
  "agent",
  "conversation",
  "message",
  "inbox-item",
  "work",
];

/** The hits of one source within one kind. */
export interface SearchSourceGroup {
  readonly source: string;
  /** The source's label, such as "Paperclip · Acme"; its ID when the source is gone. */
  readonly label: string;
  readonly hits: readonly SearchHit[];
}

/** The hits of one kind, by source. */
export interface SearchKindGroup {
  readonly kind: SearchHit["kind"];
  readonly sources: readonly SearchSourceGroup[];
}

/**
 * Groups hits by kind, in {@link searchKinds} order, then by source in the
 * order the sources are listed. Kinds and sources with no hit are left out;
 * hits keep the order the search gave them.
 */
export function groupHits(
  hits: readonly SearchHit[],
  sources: readonly MessagingSource[],
): SearchKindGroup[] {
  const sourceOrder = sources.map((source) => source.id);
  const labelOf = (id: string) => sources.find((source) => source.id === id)?.label ?? id;
  const groups: SearchKindGroup[] = [];
  for (const kind of searchKinds) {
    const ofKind = hits.filter((hit) => hit.kind === kind);
    if (ofKind.length === 0) continue;
    const sourceIds = [...new Set(ofKind.map((hit) => hit.source))].sort(
      (a, b) => rank(sourceOrder, a) - rank(sourceOrder, b),
    );
    groups.push({
      kind,
      sources: sourceIds.map((source) => ({
        source,
        label: labelOf(source),
        hits: ofKind.filter((hit) => hit.source === source),
      })),
    });
  }
  return groups;
}

/** A source's place in the list; unknown sources go last. */
function rank(order: readonly string[], id: string): number {
  const index = order.indexOf(id);
  return index === -1 ? order.length : index;
}
