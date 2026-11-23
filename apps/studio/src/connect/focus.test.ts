import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Found from the package folder, where Vitest runs each package's tests (see colours.test.ts).
const pageStyles = join(process.cwd(), "src/connect/connect.css");

/** The page's styles without their comments. */
function readCss(): string {
  return readFileSync(pageStyles, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The selectors of every rule that removes the focus ring. */
function selectorsWithoutRing(css: string): string[] {
  const found: string[] = [];
  for (const [, selector] of css.matchAll(/([^{}]+)\{[^{}]*outline:\s*(?:none|0)\s*;[^{}]*\}/g)) {
    found.push((selector as string).trim());
  }
  return found;
}

describe("the connect page's focus rings", () => {
  const css = readCss();
  // The message's rule names the 0.1 screens, like every rule inside them (HAL-16709).
  const message = 'main > section:not([data-screen="tunnel"]) .message:focus';

  it("draws none around the message, which only takes the focus to be read (HAL-7122)", () => {
    expect(selectorsWithoutRing(css)).toContain(message);
  });

  it("removes no other ring, so the field and the buttons keep theirs", () => {
    expect(selectorsWithoutRing(css)).toEqual([message]);
  });
});
