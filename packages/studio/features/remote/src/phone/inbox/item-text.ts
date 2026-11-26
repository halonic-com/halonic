import type { InboxItem, WorkItem } from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";
import { type MarkdownInline, readMarkdown } from "@halonicjs/studio-kit";
import { inboxWords } from "./inbox-words.ts";

/*
 * The phone's Inbox says an item as the desktop's Inbox does (`agentItemTitle` and
 * `agentItemBody` in the Inbox feature), which the remote feature can't import.
 */

/**
 * An item's title, for its row and its card: the question's first block as plain text, its marks
 * read, never shown, and a hidden character marked.
 */
export function itemTitle(item: InboxItem): string {
  const [first] = readMarkdown(item.question);
  if (first === undefined) return "";
  if (first.kind === "code") return markHiddenName(first.text);
  const inlines = first.kind === "list" ? (first.items[0] ?? []) : first.inlines;
  return markHiddenName(plainText(inlines).split("\n")[0] ?? "");
}

/**
 * The question as the card's body, without the line its title came from, so the title shows once.
 * A first block the title can't say in full, such as code or a link, stays.
 */
export function itemBody(item: InboxItem): string {
  const [first] = readMarkdown(item.question);
  if (first === undefined) return "";
  if (first.kind === "code") return item.question;
  const inlines = first.kind === "list" ? (first.items[0] ?? []) : first.inlines;
  if (!onlyWords(inlines)) return item.question;
  const [, ...rest] = item.question.trim().split("\n");
  return rest.join("\n").trim();
}

/** An approval offers Approve, as Paperclip's board requests do; anything else asks. */
export function isApproval(item: InboxItem): boolean {
  return item.options.some((option) => option.id === "approve");
}

/**
 * Who asks and where, as the row's meta line says it (p02a): "Chief asks · Halonic apps", or
 * "Chief · approval · Halonic apps". `source` goes between them on the card (p03a):
 * "Chief asks · Paperclip · Halonic · Halonic apps".
 */
export function askerLine(item: InboxItem, source?: string): string {
  const name = item.from.kind === "me" ? undefined : markHiddenName(item.from.name);
  const asker =
    name === undefined
      ? []
      : [isApproval(item) ? inboxWords.approval(name) : inboxWords.asks(name)];
  const project = item.project === undefined ? [] : [markHiddenName(item.project.name)];
  return [...asker, ...(source === undefined ? [] : [source]), ...project].join(" · ");
}

/** The work an item came from, as the card names it under the asker line (p03a): "HAL-17509". */
export function workLabel(work: WorkItem): string {
  return markHiddenName(work.label);
}

/** Whether the inlines are words alone, bold or italic at most, which the title says as they are. */
function onlyWords(inlines: readonly MarkdownInline[]): boolean {
  return inlines.every((inline) => {
    if (inline.kind === "strong" || inline.kind === "em") return onlyWords(inline.children);
    return inline.kind === "text";
  });
}

function plainText(inlines: readonly MarkdownInline[]): string {
  return inlines
    .map((inline) =>
      inline.kind === "strong" || inline.kind === "em" ? plainText(inline.children) : inline.text,
    )
    .join("");
}
