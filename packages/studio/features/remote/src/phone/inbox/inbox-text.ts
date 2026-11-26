import type { InboxItem } from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";
import { type MarkdownInline, readMarkdown } from "@halonicjs/studio-kit";

/*
 * What a phone Inbox row and card say about an item (HAL-17514 p02a and p03a), as the desktop
 * Inbox says it: the question's first line is the card's title, the rest its body.
 */

/** The card's title: the question's first block as plain text, its Markdown marks read, not shown. */
export function cardTitle(item: InboxItem): string {
  const [first] = readMarkdown(item.question);
  if (first === undefined) return "";
  if (first.kind === "code") return markHiddenName(first.text);
  const inlines = first.kind === "list" ? (first.items[0] ?? []) : first.inlines;
  return markHiddenName(plainText(inlines).split("\n")[0] ?? "");
}

/**
 * The question without the line its title came from, so the title shows once; empty when the
 * question is no more than its title. A first block the title can't say in full, such as code or a
 * link, stays.
 */
export function cardBody(item: InboxItem): string {
  const [first] = readMarkdown(item.question);
  if (first === undefined) return "";
  if (first.kind === "code") return item.question;
  const inlines = first.kind === "list" ? (first.items[0] ?? []) : first.inlines;
  if (!onlyWords(inlines)) return item.question;
  const [, ...rest] = item.question.trim().split("\n");
  return rest.join("\n").trim();
}

/** Who asks and for what project: "Chief asks · Halonic apps", or "Chief asks" without one. */
export function askerLine(item: InboxItem): string {
  const asker = item.from.kind === "me" ? "" : `${markHiddenName(item.from.name)} asks`;
  const project = item.project === undefined ? "" : markHiddenName(item.project.name);
  return [asker, project].filter((part) => part !== "").join(" · ");
}

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
