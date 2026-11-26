import { readdirSync, readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/**
 * Everything a person can click shows the pointer. theme-cursor.css gives it to the native
 * controls and the clickable roles below; this check catches what that rule can't see: an element
 * with an `onClick` that is none of those and has no cursor of its own, and a `cursor-default` or
 * `cursor-auto` class, which would take the pointer away again. It reads the kit, the shell, every
 * Studio feature and the Studio app, so a new screen is held to it with no list to edit.
 */

/** The tags theme-cursor.css gives the pointer. An `a` counts only with an `href`. */
const pointerTags = ["button", "summary", "select"];

/** The `input` types theme-cursor.css gives the pointer; a text field keeps its text cursor. */
const pointerInputTypes = ["button", "submit", "reset", "checkbox", "radio", "file", "color"];

/** The roles theme-cursor.css gives the pointer. */
const pointerRoles = [
  "button",
  "link",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "treeitem",
  "switch",
  "checkbox",
  "radio",
];

/**
 * Says, in the three lines above an element or a class, why it needs no pointer: an element whose
 * `onClick` only hears its children's clicks, or a row that sets its own cursor in code.
 */
const ignoreMarker = "pointer-check-ignore:";

/** A class that hands a clickable part the arrow: `cursor-default`, `hover:cursor-auto`. */
const arrowClass = /(?<![\w-])(?:[\w-]+:)*cursor-(?:default|auto)(?![\w-])/;

/** An opening JSX tag of a DOM element (lower case), with its attributes and its line. */
interface OpeningTag {
  readonly tag: string;
  readonly text: string;
  readonly line: number;
}

/** A quoted string, in any of the three quotes. */
const quoted = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g;

/** The source with the inside of every string blanked, so a `>` or a brace in one isn't code. */
function withoutStrings(source: string): string {
  return source.replace(quoted, (string) =>
    string.length < 2
      ? string
      : `${string[0]}${string.slice(1, -1).replace(/[^\n]/g, " ")}${string.slice(-1)}`,
  );
}

/** Where the opening tag that starts at `from` ends: its `>` outside braces (strings blanked). */
function tagEnd(code: string, from: number): number {
  let depth = 0;
  for (let index = from; index < code.length; index += 1) {
    const char = code[index];
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return index;
  }
  return code.length;
}

/** Every opening tag of a DOM element in `source`. `Array<string>` and `a < b` aren't tags. */
function openingTags(source: string): OpeningTag[] {
  const starts = /(?<![\w$.)\]])<([a-z][\w-]*)(?=[\s/>])/g;
  const code = withoutStrings(source);
  return [...source.matchAll(starts)].map((match) => ({
    tag: match[1] ?? "",
    text: source.slice(match.index, tagEnd(code, match.index + match[0].length) + 1),
    line: source.slice(0, match.index).split("\n").length,
  }));
}

/** Whether theme-cursor.css gives this element the pointer by its tag, type or role. */
function hasPointerByRule({ tag, text }: OpeningTag): boolean {
  if (pointerTags.includes(tag)) return true;
  if (tag === "a") return /\shref=/.test(text);
  const type = /\stype="([\w-]+)"/.exec(text)?.[1];
  if (tag === "input") return type !== undefined && pointerInputTypes.includes(type);
  const roles = /\srole=(?:"([\w-]+)"|\{[^}]*?"([\w-]+)")/.exec(text);
  return roles !== null && pointerRoles.includes(roles[1] ?? roles[2] ?? "");
}

/** Whether the lines just above `line` explain why the element isn't clickable itself. */
function isIgnored(lines: readonly string[], line: number): boolean {
  return lines.slice(Math.max(0, line - 4), line - 1).some((text) => text.includes(ignoreMarker));
}

/** A quoted string, a block comment or a line comment, in source order. */
const scriptTokens =
  /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/**
 * The source with its comments blanked, line breaks kept so line numbers stay true: a comment
 * inside a tag ("a press here isn't…") would otherwise open a string, and a comment may name a
 * class it explains. Strings are matched first so `"https://…"` isn't read as a comment.
 */
function withoutComments(source: string): string {
  return source.replace(scriptTokens, (token, string?: string) =>
    string === undefined ? token.replace(/[^\n]/g, "") : string,
  );
}

/** Each element or line in `source` that breaks the rule, as `file:line  reason`. */
function problems(file: string, rawSource: string): string[] {
  const rawLines = rawSource.split("\n");
  const source = withoutComments(rawSource);
  const lines = source.split("\n");
  const clickable = openingTags(source)
    .filter((tag) => /\sonClick=/.test(tag.text))
    .filter((tag) => !hasPointerByRule(tag) && !/(?<![\w-])cursor-/.test(tag.text))
    .filter((tag) => !isIgnored(rawLines, tag.line))
    .map(
      ({ tag, line }) =>
        `${file}:${line}  a clickable <${tag}> without the pointer: give it a role or cursor-pointer`,
    );
  const arrows = lines.flatMap((text, index) =>
    arrowClass.test(text) && !isIgnored(rawLines, index + 1)
      ? [`${file}:${index + 1}  ${text.trim()}: a clickable part shows the pointer, not the arrow`]
      : [],
  );
  return [...clickable, ...arrows];
}

/** Source the check reads: components, not tests, test helpers or end-to-end pages. */
function isCovered(file: string): boolean {
  return (
    (file.endsWith(".tsx") || (file.endsWith(".ts") && !file.endsWith(".d.ts"))) &&
    !/\.(?:test|spec)\.tsx?$/.test(file) &&
    !/(?:^|\/)(?:test|e2e|generated)\//.test(file)
  );
}

/** The source folders of every Studio feature. */
function featureFolders(): string[] {
  const features = new URL("../../features/", import.meta.url);
  return readdirSync(features).map((name) => `../../features/${name}/src/`);
}

verifies("kit.pointer-cursor", () => {
  describe("the pointer check", () => {
    it.each([
      ["<div onClick={open}>", 1],
      ['<li className="flex gap-2" onClick={() => pick(row)}>', 1],
      ['<span role="status" onClick={open} />', 1],
      ["<a onClick={open}>Open</a>", 1],
      ['const row = "flex h-10 cursor-default items-center";', 1],
      ['<button className="hover:cursor-auto" type="button">', 1],
    ])("flags %s", (source, count) => {
      expect(problems("x.tsx", source)).toHaveLength(count);
    });

    it.each([
      '<button type="button" onClick={run}>',
      "<a href={link} onClick={track}>",
      '<div role="menuitem" onClick={pick}>',
      '<div role={inMenu ? "menuitem" : undefined} onClick={pick}>',
      '<input type="checkbox" onClick={toggle} />',
      '<div className="cursor-pointer" onClick={open}>',
      '<div className="cursor-col-resize" onClick={reset}>',
      "<Row onClick={open} />",
      "const items = new Array<string>(); if (a < b) run();",
      '<div className="flex">',
    ])("lets %s through", (source) => {
      expect(problems("x.tsx", source)).toEqual([]);
    });

    it("reads an onClick past an arrow and a nested brace in the tag", () => {
      const source =
        '<div\n  style={{ top: 0 }}\n  onKeyDown={(event) => event.key === ">"}\n  onClick={open}\n>';
      expect(problems("x.tsx", source)).toEqual([
        "x.tsx:1  a clickable <div> without the pointer: give it a role or cursor-pointer",
      ]);
    });

    it("lets an element or a class through that says above it why it needs no pointer", () => {
      const source = [
        `{/* ${ignoreMarker} it only hears its links' clicks. */}`,
        "<div onClick={closeOnLink}>",
        `// ${ignoreMarker} an inert row does nothing on a click.`,
        'const inert = "cursor-default";',
      ].join("\n");
      expect(problems("x.tsx", source)).toEqual([]);
    });

    it("still flags an element whose marker is more than three lines above it", () => {
      const source = [`// ${ignoreMarker} too far.`, "", "", "", "<div onClick={open}>"].join("\n");
      expect(problems("x.tsx", source)).toHaveLength(1);
    });
  });

  it("names every tag, type and role of the check in theme-cursor.css", () => {
    const css = readFileSync(new URL("./theme-cursor.css", import.meta.url), "utf8");
    for (const tag of [...pointerTags, "a[href]"]) expect(css).toContain(`${tag},`);
    for (const type of pointerInputTypes) expect(css).toContain(`[type="${type}"]`);
    for (const role of pointerRoles) expect(css).toContain(`[role="${role}"]`);
    expect(css).toMatch(/:is\(:disabled, \[aria-disabled="true"\]\)\s*\{\s*cursor: not-allowed;/);
    expect(css).toMatch(/@layer base \{\s*:where\(/);
  });

  it.each([
    ["the kit", "./"],
    ["the shell", "../../shell/src/"],
    ["the Studio app", "../../../../apps/studio/src/"],
    ...featureFolders().map((folder) => [folder.split("/")[3] ?? folder, folder]),
  ])("shows the pointer on every clickable element in %s", (_name, folder) => {
    const sourceFolder = new URL(folder, import.meta.url);
    const files = readdirSync(sourceFolder, { recursive: true, encoding: "utf8" }).filter(
      isCovered,
    );
    const offenders = files.flatMap((file) =>
      problems(file, readFileSync(new URL(file, sourceFolder), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
