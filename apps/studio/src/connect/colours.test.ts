import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Under jsdom `import.meta.url` isn't a file URL, so both files are found from
// the package folder, where Vitest runs each package's tests.
const pageStyles = join(process.cwd(), "src/connect/connect.css");
const kitTheme = join(process.cwd(), "node_modules/@halonicjs/studio-kit/src/theme.css");

/** A file's text without its comments. */
function readCss(file: string): string {
  return readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The `--color-…` declarations in a piece of CSS, by name. */
function colours(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/(--color-[a-z-]+):\s*([^;]+);/g)) {
    found.set(name as string, (value as string).trim());
  }
  return found;
}

/** The text between the brace after `start` and the brace that closes it. */
function blockAfter(css: string, start: string): string {
  const open = css.indexOf("{", css.indexOf(start));
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    if (css[index] === "{") {
      depth++;
    } else if (css[index] === "}" && --depth === 0) {
      return css.slice(open + 1, index);
    }
  }
  throw new Error(`No block after "${start}".`);
}

/** The kit's colours, each split into its light and dark value. */
function kitColours(): Map<string, { light: string; dark: string }> {
  const pairs = new Map<string, { light: string; dark: string }>();
  for (const [name, value] of colours(readCss(kitTheme))) {
    const match = /^light-dark\((.+), (.+)\)$/.exec(value);
    if (match) {
      pairs.set(name, { light: match[1] as string, dark: match[2] as string });
    }
  }
  return pairs;
}

describe("the connect page's colours", () => {
  const css = readCss(pageStyles);
  // The first `:root` is the light one; the dark one sits in the media query after it.
  const light = blockAfter(css, ":root");
  const dark = blockAfter(css, "@media (prefers-color-scheme: dark)");
  const kit = kitColours();

  it("copies each of the kit's light values exactly", () => {
    const page = colours(light);
    expect(page.size).toBeGreaterThan(0);
    for (const [name, value] of page) {
      expect({ name, value }).toEqual({ name, value: kit.get(name)?.light });
    }
  });

  it("copies each of the kit's dark values exactly, for every light one", () => {
    const page = colours(dark);
    expect([...page.keys()]).toEqual([...colours(light).keys()]);
    for (const [name, value] of page) {
      expect({ name, value }).toEqual({ name, value: kit.get(name)?.dark });
    }
  });
});
