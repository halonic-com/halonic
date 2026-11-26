import { type MarkdownInline, readMarkdown } from "./markdown.ts";

/*
 * What an Inbox card says about a question an agent wrote in Markdown, on the computer and on the
 * phone alike (`kit.question-text`): its first line is the card's title, the rest its body. The
 * caller marks hidden characters, as in every other title.
 */

/**
 * A question's title: its first block as plain text, its Markdown marks read, never shown; a
 * code block as it is. Empty for an empty question.
 *
 * @example
 * questionTitle("# **Hire** an agent\n\nIris, designer"); // "Hire an agent"
 */
export function questionTitle(question: string): string {
  const [first] = readMarkdown(question);
  if (first === undefined) return "";
  if (first.kind === "code") return first.text;
  const inlines = first.kind === "list" ? (first.items[0] ?? []) : first.inlines;
  return plainText(inlines).split("\n")[0] ?? "";
}

/**
 * A question without the line its title came from, so a heading such as "New secret:
 * GOOGLE_ADS_TOKEN" shows once. Empty when the question is no more than its title. A first block
 * the title can't say in full, such as code or a link, stays.
 *
 * @example
 * questionBody("New secret: ACME_TOKEN\n\n- Key: ACME_TOKEN"); // "- Key: ACME_TOKEN"
 */
export function questionBody(question: string): string {
  const [first] = readMarkdown(question);
  if (first === undefined) return "";
  if (first.kind === "code") return question;
  const inlines = first.kind === "list" ? (first.items[0] ?? []) : first.inlines;
  if (!onlyWords(inlines)) return question;
  const [, ...rest] = question.trim().split("\n");
  return rest.join("\n").trim();
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
