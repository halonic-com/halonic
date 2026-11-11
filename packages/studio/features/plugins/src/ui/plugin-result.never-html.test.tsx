// @vitest-environment jsdom
// The ADR's test (section 5): whatever a plugin answers, Studio draws only its
// own elements, with no script, no event handler and no link but a web page.
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { PluginResult, type ResultShow } from "./plugin-result.tsx";

afterEach(unmountAll);

/** Every element PluginResult draws. A new one needs a reason, here and in AGENTS.md. */
const ALLOWED_ELEMENTS = new Set([
  "div",
  "bdi",
  "p",
  "blockquote",
  "pre",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "code",
  "span",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "class",
  "dir",
  "scope",
  "title",
  "href",
  "target",
  "rel",
  "aria-hidden",
]);

/** Pieces of Markdown, HTML and links an answer is built from. */
const PIECES = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "<a href='javascript:alert(1)'>x</a>",
  "<iframe src=https://example.com></iframe>",
  '<b style="color:red">',
  "[x](javascript:alert(1))",
  "[x](data:text/html,<script>alert(1)</script>)",
  "[x](https://example.com/a)",
  '[<b>x</b>](https://example.com/"onmouseover=alert(1))',
  "![x](https://example.com/x.png)",
  "# ",
  "- ",
  "1. ",
  "> ",
  "```\n",
  "**",
  "*",
  "_",
  "`",
  "\\",
  "\n",
  "\n\n",
  " ",
  "word",
];

/** Keys a table row is built from, values from the pieces. */
const KEYS = ["<b>", "onclick", "a", "__proto__", "constructor"];

/**
 * The same answers on every run: a small seeded generator (mulberry32), as
 * the studio layer has no property-test library (docs/guides/dependencies.md).
 */
function answers(count: number, seed: number): string[] {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
  const text = () => Array.from({ length: Math.floor(next() * 24) }, () => pick(PIECES)).join("");
  const row = () => Object.fromEntries(Array.from({ length: 3 }, () => [pick(KEYS), text()]));
  return Array.from({ length: count }, (_, index) =>
    index % 3 === 2
      ? JSON.stringify(Array.from({ length: 1 + Math.floor(next() * 3) }, row))
      : text(),
  );
}

function problems(view: HTMLElement): string[] {
  const found: string[] = [];
  for (const element of view.querySelectorAll("*")) {
    const tag = element.tagName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(tag)) found.push(`element ${tag}`);
    for (const { name, value } of element.attributes) {
      if (!ALLOWED_ATTRIBUTES.has(name)) found.push(`attribute ${name} on ${tag}`);
      if (name === "href" && !/^https?:\/\//.test(value)) found.push(`link to ${value}`);
    }
  }
  return found;
}

// In batches of 25, so each test stays well inside the time limit on a busy runner.
const BATCHES = Array.from({ length: 6 }, (_, index) => ({
  index,
  answers: answers(150, 1740).slice(index * 25, index * 25 + 25),
}));
const SHOWS: readonly ResultShow[] = ["text", "markdown", "table"];

verifies("plugins.plugin-text", () => {
  describe("plugin text never renders as HTML", () => {
    describe.each(SHOWS)("for a %s answer", (show) => {
      it.each(BATCHES)("draws only Studio's own elements, batch $index", ({ answers: batch }) => {
        for (const answer of batch) {
          const view = render(<PluginResult show={show} text={answer} />);
          expect(problems(view), answer).toEqual([]);
          unmountAll();
        }
      });
    });

    it.each(BATCHES)(
      "keeps a text answer's characters exactly, batch $index",
      ({ answers: batch }) => {
        for (const answer of batch) {
          const view = render(<PluginResult show="text" text={answer} />);
          expect(view.textContent).toBe(answer);
          unmountAll();
        }
      },
    );
  });
});
