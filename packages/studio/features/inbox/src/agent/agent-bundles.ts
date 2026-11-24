import type {
  InboxItem as AgentItem,
  MessagingId,
  MessagingSource,
  WorkItem,
} from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";
import { waitingFor } from "../plain/waiting-time.ts";
import { agentItemKey, authorName } from "./agent-item-text.ts";

/**
 * One row of the agents' items (`inbox.agent-item-bundles`): a single item, or the open items of
 * one work item or, without one, of one agent, bundled so one busy agent doesn't fill the list.
 */
export interface AgentBundle {
  /** The row's key: the item's own while it is alone, so its row keeps its key. */
  readonly key: string;
  /** Oldest first, the order the bundle's card shows them in. */
  readonly items: readonly AgentItem[];
  /** The work they share, when bundled by work. */
  readonly work: MessagingId | undefined;
}

/**
 * What bundles an item: its work, else the agent that asked, else nothing, always within one
 * project, so the project filter never splits a bundle (`inbox.project-filter`). IDs are opaque
 * and name their source, so two sources' items never share a bundle.
 */
function bundleOf(item: AgentItem): string | undefined {
  const project = `project:${item.project?.id ?? ""}`;
  if (item.work !== undefined) return `${project}|work:${item.work}`;
  return item.from.kind === "agent" ? `${project}|agent:${item.from.agent}` : undefined;
}

/**
 * Bundles the open items, newest first as `listInboxItems` gives them: each bundle takes the
 * place of its newest item, and a bundle of one is that item's own row.
 */
export function bundleAgentItems(newestFirst: readonly AgentItem[]): AgentBundle[] {
  const bundles = new Map<string, AgentItem[]>();
  for (const item of newestFirst) {
    const key = bundleOf(item) ?? agentItemKey(item);
    bundles.set(key, [...(bundles.get(key) ?? []), item]);
  }
  return [...bundles].map(([key, items]) => {
    const [first] = items;
    const alone = items.length === 1 && first !== undefined;
    return {
      key: alone ? agentItemKey(first) : `agent-bundle:${key}`,
      items: [...items].reverse(),
      work: items.length > 1 ? first?.work : undefined,
    };
  });
}

/**
 * A bundle's title: "2 cards on ACME-12 · Fix the login" when they share work the source has,
 * else "2 cards from Chief".
 */
export function bundleTitle(bundle: AgentBundle, work: WorkItem | undefined): string {
  const count = `${bundle.items.length} cards`;
  if (work !== undefined) {
    return `${count} on ${markHiddenName(work.label)} · ${markHiddenName(work.title)}`;
  }
  const from = bundle.items[0]?.from;
  return from === undefined || from.kind === "me" ? count : `${count} from ${authorName(from)}`;
}

/**
 * A bundle's meta line: its source, who asks, and how long the oldest has waited, so a bundle
 * never looks newer than the card at its bottom: "Paperclip · Acme · Chief, Ravi · Waiting 3 h".
 */
export function bundleMeta(
  bundle: AgentBundle,
  source: MessagingSource | undefined,
  now: Date,
): string {
  const names = new Set(
    bundle.items.flatMap((item) => (item.from.kind === "me" ? [] : [authorName(item.from)])),
  );
  const from = names.size === 0 ? [] : [[...names].join(", ")];
  const parts = [...(source === undefined ? [] : [source.label]), ...from];
  const oldest = bundle.items[0];
  return oldest === undefined
    ? parts.join(" · ")
    : [...parts, waitingFor(new Date(oldest.createdAt), now)].join(" · ");
}
