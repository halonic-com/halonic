/** A fence line opening or closing a code block: three or more backticks or tildes. */
const fenceLine = /^ {0,3}(`{3,}|~{3,})/;

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
  const result: string[] = [];
  // Code spans can wrap onto the next line, so links are read a paragraph at a time, as the kit does.
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length > 0) {
      result.push(fullLinksIn(paragraph.join("\n"), origin));
      paragraph = [];
    }
  };
  let fence: string | undefined;
  for (const line of markdown.split("\n")) {
    const marker = fenceLine.exec(line)?.[1];
    if (fence !== undefined) {
      // Inside a code block until a fence of the same kind, at least as long, closes it.
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
        fence = undefined;
      }
      result.push(line);
    } else if (marker !== undefined || line.trim() === "") {
      endParagraph();
      fence = marker;
      result.push(line);
    } else {
      paragraph.push(line);
    }
  }
  endParagraph();
  return result.join("\n");
}

/** `text` with its root links made full addresses on `origin`, its code spans kept as written. */
function fullLinksIn(text: string, origin: string): string {
  // A replacer function, because a replacement string would read `$1` or `$&` in the origin.
  const change = (part: string) =>
    part.replace(rootLinkTarget, (_target, path: string) => `](${origin}${path}`);
  let result = "";
  let from = 0;
  for (const [start, end] of codeSpans(text)) {
    result += change(text.slice(from, start)) + text.slice(start, end);
    from = end;
  }
  return result + change(text.slice(from));
}

/**
 * Where `text`'s code spans start and end: a run of backticks up to the next run of the same
 * length. One pass over the runs, so a long run of backticks that never closes stays cheap.
 */
function codeSpans(text: string): Array<[number, number]> {
  const runs = [...text.matchAll(/`+/g)].map((match) => ({
    at: match.index,
    size: match[0].length,
  }));
  const startsBySize = new Map<number, { starts: number[]; next: number }>();
  for (const run of runs) {
    const same = startsBySize.get(run.size) ?? { starts: [], next: 0 };
    same.starts.push(run.at);
    startsBySize.set(run.size, same);
  }
  const spans: Array<[number, number]> = [];
  let from = 0;
  for (const run of runs) {
    const same = startsBySize.get(run.size);
    if (run.at < from || same === undefined) {
      continue;
    }
    while ((same.starts[same.next] ?? Number.POSITIVE_INFINITY) <= run.at) {
      same.next += 1;
    }
    const close = same.starts[same.next];
    // A run with no run of the same length after it is text.
    if (close !== undefined) {
      spans.push([run.at, close + run.size]);
      from = close + run.size;
    }
  }
  return spans;
}
