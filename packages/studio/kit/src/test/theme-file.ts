/**
 * Reads theme.css as text for the token tests. A small reader for the plain shape of our own file,
 * not a general CSS parser: top-level blocks, `--name: value;` declarations and light-dark().
 */
import { readFileSync } from "node:fs";

/** One top-level block of the file, such as `@theme static { … }` or `:root { … }`. */
export interface CssBlock {
  readonly header: string;
  readonly body: string;
}

/** The theme file's text, without comments. */
export function readThemeFile(): string {
  const text = readFileSync(new URL("../theme.css", import.meta.url), "utf8");
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Splits the file into its top-level blocks, in order. Nested blocks stay inside their body. */
export function topLevelBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let depth = 0;
  let headerStart = 0;
  let bodyStart = 0;
  for (let index = 0; index < css.length; index++) {
    const character = css[index];
    if (character === "{") {
      if (depth === 0) {
        bodyStart = index + 1;
      }
      depth++;
    } else if (character === "}") {
      depth--;
      if (depth === 0) {
        const header = css.slice(headerStart, bodyStart - 1).trim();
        blocks.push({ header, body: css.slice(bodyStart, index) });
        headerStart = index + 1;
      }
    }
  }
  return blocks;
}

/**
 * The bodies of every top-level block with exactly this header, joined. Throws when there is
 * none, so a renamed selector fails the test instead of checking nothing.
 */
export function blockBody(css: string, header: string): string {
  const matches = topLevelBlocks(css).filter((block) => block.header === header);
  if (matches.length === 0) {
    throw new Error(`Expected a "${header}" block in theme.css, found none.`);
  }
  return matches.map((block) => block.body).join("\n");
}

/**
 * The custom properties declared directly in a block body, by name. Declarations inside nested
 * blocks (such as `@keyframes`) are left out.
 */
export function customProperties(body: string): Map<string, string> {
  const properties = new Map<string, string>();
  const withoutNestedBlocks = body.replace(/@[\w-]+[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
  for (const match of withoutNestedBlocks.matchAll(/(--[\w*-]+)\s*:\s*([^;]+);/g)) {
    const [, name = "", value = ""] = match;
    properties.set(name, value.replace(/\s+/g, " ").trim());
  }
  return properties;
}

/** The light and dark halves of `light-dark(light, dark)`, or `undefined` for any other value. */
export function lightDarkPair(value: string): { light: string; dark: string } | undefined {
  const match = /^light-dark\((.*)\)$/.exec(value.trim());
  if (match === null) {
    return undefined;
  }
  const [, inner = ""] = match;
  let depth = 0;
  for (let index = 0; index < inner.length; index++) {
    const character = inner[index];
    if (character === "(") {
      depth++;
    } else if (character === ")") {
      depth--;
    } else if (character === "," && depth === 0) {
      return { light: inner.slice(0, index).trim(), dark: inner.slice(index + 1).trim() };
    }
  }
  return undefined;
}
