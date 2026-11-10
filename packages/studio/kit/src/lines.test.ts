import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every divider in the kit names its colour. A one-sided border with no colour class falls back
 * to theme.css's base rule (the soft `border` token) since HAL-2818; before that it drew in the
 * text colour. This keeps the colour in the part itself, on the same line as the width, so a
 * reader sees it and a variant can change it.
 */

/** A one-sided 1px or wider border: `border-b`, `border-s-2`, `before:border-t`. Not `-0`. */
const dividerWidth = /^(?:[\w-]+:)*border-[xytbselr](?:-[1-9]\d*)?$/;

/** A border colour: `border-border`, `before:border-border`, `border-t-transparent`. */
const borderColour = /^(?:[\w-]+:)*border(?:-[xytbselr])?-[a-z][\w-]*$/;

/** Class names on a line, split from the quotes, backticks and `${…}` round them. */
function classTokens(line: string): string[] {
  return line.split(/[\s"'`{}$]+/).filter((token) => token !== "");
}

/** A line of source that draws a divider without naming its colour. */
function lacksColour(line: string): boolean {
  const tokens = classTokens(line);
  return (
    tokens.some((token) => dividerWidth.test(token)) &&
    !tokens.some((token) => borderColour.test(token) && !dividerWidth.test(token))
  );
}

describe("studio-kit lines", () => {
  it.each([
    '"flex h-12 items-center gap-2 border-b pr-2.5 pl-4"',
    'return props.facing === "end" ? "border-e" : "border-s";',
    'className={props.flush ? "pb-1 border-b" : "pb-1"}',
    '"relative before:absolute before:border-t"',
  ])("flags %s", (line) => {
    expect(lacksColour(line)).toBe(true);
  });

  it.each([
    '"flex h-12 items-center gap-2 border-b border-border pr-2.5 pl-4"',
    'className={props.flush ? "pb-1 border-b border-border" : "pb-1"}',
    '"relative before:absolute before:border-t before:border-border"',
    '"rounded-md border border-border phone:rounded-none phone:border-x-0"',
    '"flex h-12 items-center gap-2 pr-2.5 pl-4"',
  ])("lets %s through", (line) => {
    expect(lacksColour(line)).toBe(false);
  });

  it("names the colour of every divider in its source", () => {
    const sourceFolder = new URL("./", import.meta.url);
    const files = readdirSync(sourceFolder, { recursive: true, encoding: "utf8" }).filter(
      (file) => /\.tsx?$/.test(file) && !/\.(?:test|spec)\.tsx?$/.test(file),
    );
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.flatMap((file) =>
      readFileSync(new URL(file, sourceFolder), "utf8")
        .split("\n")
        .flatMap((line, index) => (lacksColour(line) ? [`${file}:${index + 1}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});
