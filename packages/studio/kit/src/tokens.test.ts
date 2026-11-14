import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Colours and motion come only from the theme. A part that draws a raw `#3b8bff`, `rgb()` or a
 * hard-coded `200ms` skips dark, more-contrast, forced-colours and reduced motion, and no other
 * test would notice. Parts name a token instead (`bg-surface`, `duration-(--duration-fast)`); a
 * missing value becomes a new token in `theme*.css`. `halo-presets.ts` is the one exception: its
 * hex values are colours a user picks, so they are data.
 */

/** A hex colour: `#fff`, `#3b8bff`, `#3b8bff80`. Not an id such as `url(#clip)`. */
const hexColour = /(?<![\w&-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i;

/** A colour function: `rgb(…)`, `rgba(…)`, `hsl(…)`, `oklch(…)`. Not `color-mix(…)` or `var(…)`. */
const colourFunction = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;

/** A time written as a number: `200ms`, `0.2s`. Not `--duration-fast` or `var(…)`. */
const time = String.raw`(?<![\w.-])\d*\.?\d+m?s(?![\w-])`;

/** A transition or animation (CSS, or an inline style) with a time written in it. */
const motionDeclaration = new RegExp(
  `(?:transition|animation)[\\w-]*["']?\\s*:[^;\\n]*${time}`,
  "i",
);

/** A Tailwind class with a time: `duration-200`, `delay-[150ms]`, `animate-[spin_1s_linear]`. */
const motionClass =
  /(?<![\w-])(?:[\w-]+:)*(?:(?:duration|delay)-(?:\d|\[)|animate-\[[^\]]*\d(?:ms|s))/;

/** What is wrong with a line of source, or `null` when it draws only from tokens. */
function problemWith(line: string): string | null {
  if (hexColour.test(line) || colourFunction.test(line)) {
    return "a raw colour: use a colour token from theme.css";
  }
  if (motionDeclaration.test(line) || motionClass.test(line)) {
    return "a hard-coded duration: use a --duration-* token from theme.css";
  }
  return null;
}

/** A quoted string, a block comment, or (in script, not CSS) a line comment, in source order. */
const scriptTokens =
  /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const cssTokens = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\/\*[\s\S]*?\*\//g;

/**
 * The source with its comments blanked, line breaks kept so line numbers stay true. A comment may
 * explain a colour ("#3B8BFF") or a delay ("300ms"); only code is held to the rule. Strings are
 * matched first so `"https://…"` isn't read as a comment.
 */
function withoutComments(source: string, file: string): string {
  const tokens = file.endsWith(".css") ? cssTokens : scriptTokens;
  return source.replace(tokens, (token, string?: string) => string ?? token.replace(/[^\n]/g, ""));
}

/** Each line of `source` that breaks the rule, as `file:line  reason: the line`. */
function problems(file: string, source: string): string[] {
  return withoutComments(source, file)
    .split("\n")
    .flatMap((line, index) => {
      const problem = problemWith(line);
      return problem === null ? [] : [`${file}:${index + 1}  ${problem}\n    ${line.trim()}`];
    });
}

/** Source the rule covers: the kit's parts, not its tests, test helpers, theme or halo presets. */
function isCovered(file: string): boolean {
  const name = file.split("/").pop() ?? file;
  return (
    /\.(?:css|tsx?)$/.test(file) &&
    !/\.(?:test|spec)\.tsx?$/.test(file) &&
    !file.startsWith("test/") &&
    !/^theme.*\.css$/.test(file) &&
    name !== "halo-presets.ts"
  );
}

describe("studio-kit tokens", () => {
  it.each([
    'className="bg-[#3b8bff] text-fg"',
    "color: #fff;",
    "border-color: #3B8BFF80;",
    "background: rgb(0 0 0 / 50%);",
    "const shadow = `0 0 0 1px rgba(0, 0, 0, 0.2)`;",
    'style={{ color: "hsl(210 100% 50%)" }}',
    "outline-color: oklch(62% 0.2 255);",
  ])("flags the raw colour in %s", (line) => {
    expect(problemWith(line)).toMatch(/raw colour/);
  });

  it.each([
    "transition: background-color 200ms ease;",
    "transition: opacity .2s;",
    "animation: spin 1s linear infinite;",
    "transition-duration: 150ms;",
    'style={{ transition: "opacity 200ms" }}',
    'style={{ transitionDuration: "200ms" }}',
    '"transition-opacity duration-[200ms] ease-enter"',
    '"transition-colors duration-200"',
    '"hover:delay-150 transition-colors"',
    '"animate-[spin_1s_linear_infinite]"',
  ])("flags the hard-coded duration in %s", (line) => {
    expect(problemWith(line)).toMatch(/hard-coded duration/);
  });

  it.each([
    '"bg-surface text-fg border-border"',
    "color: var(--color-fg);",
    "background: color-mix(in srgb, var(--color-fg) 8%, transparent);",
    "outline: 2px solid Highlight;",
    '<use href="#clip" />',
    'url("https://example.com/#top")',
    "transition: background-color var(--default-transition-duration) var(--ease-standard);",
    '"transition-opacity duration-(--duration-fast) ease-enter starting:opacity-0"',
    '"transition-colors focus-ring"',
    '"border-b border-border pr-2.5"',
  ])("lets %s through", (line) => {
    expect(problemWith(line)).toBeNull();
  });

  it("ignores a colour or a time in a comment, not in code", () => {
    const source = [
      "/** Six hex digits: #3B8BFF. */",
      "// Shows after 300ms, fades in 200ms.",
      'const link = "https://example.com";',
      'const bad = "bg-[#3b8bff]"; // not #fff',
      "/* a block",
      "   of #fff and 1s */",
      "transition: opacity 1s;",
    ].join("\n");
    expect(problems("x.ts", source)).toEqual([
      'x.ts:4  a raw colour: use a colour token from theme.css\n    const bad = "bg-[#3b8bff]";',
      "x.ts:7  a hard-coded duration: use a --duration-* token from theme.css\n    transition: opacity 1s;",
    ]);
  });

  it("draws every colour and duration in the kit from the theme", () => {
    const sourceFolder = new URL("./", import.meta.url);
    const files = readdirSync(sourceFolder, { recursive: true, encoding: "utf8" }).filter(
      isCovered,
    );
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.flatMap((file) =>
      problems(file, readFileSync(new URL(file, sourceFolder), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
