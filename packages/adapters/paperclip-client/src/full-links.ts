/** A fence line opening or closing a code block: three or more backticks or tildes. */
const fenceLine = /^ {0,3}(`{3,}|~{3,})/;

/** An inline code span: a run of backticks, its text, and a run of the same length. */
const codeSpan = /(`+).*?(?<!`)\1(?!`)/g;

/**
 * A Markdown link target that is a path from the root of the connection's Paperclip, such as
 * `](/ACME/issues/ACME-8)`. `//host` names another host, and browsers read `/\host` the same
 * way, so neither matches.
 */
const rootLinkTarget = /\]\((\/(?![/\\])[^\s()<>]*)(?=[\s)])/g;

/**
 * `markdown` with every link to a path on the connection's Paperclip, such as
 * `[ACME-8](/ACME/issues/ACME-8)`, turned into a link to the full address on `origin`
 * (`paperclip-client.full-links`), so the app can open it. Paperclip writes its links from the root
 * of its own site, and Studio has no screen at those paths yet. A link with a scheme or to `//host`
 * stays as written, and so does everything in code spans and code blocks.
 *
 * @example
 * withFullLinks("[ACME-8](/ACME/issues/ACME-8)", "https://paperclip.acme.test");
 * // "[ACME-8](https://paperclip.acme.test/ACME/issues/ACME-8)"
 */
export function withFullLinks(markdown: string, origin: string): string {
  let fence: string | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      const marker = fenceLine.exec(line)?.[1];
      if (fence !== undefined) {
        // Inside a code block until a fence of the same kind, at least as long, closes it.
        if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
          fence = undefined;
        }
        return line;
      }
      if (marker !== undefined) {
        fence = marker;
        return line;
      }
      return outsideCodeSpans(line, (text) => text.replace(rootLinkTarget, `](${origin}$1`));
    })
    .join("\n");
}

/** `line` with `change` applied to the text between its code spans, the spans kept as written. */
function outsideCodeSpans(line: string, change: (text: string) => string): string {
  let result = "";
  let from = 0;
  for (const span of line.matchAll(codeSpan)) {
    result += change(line.slice(from, span.index)) + span[0];
    from = span.index + span[0].length;
  }
  return result + change(line.slice(from));
}
