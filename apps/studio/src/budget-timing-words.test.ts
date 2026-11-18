import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Studio says when Halonic checks the budget in one way only: "before each step. A step can make
 * several model calls, so a run can go over." (HAL-12693, F1; HAL-12742). The Models step and
 * the run page's budget banner both say it, and the Inbox's budget notice sends people from one
 * to the other. This keeps an older, wrong timing from coming back in any of Studio's text.
 */
const wrongTimings: readonly RegExp[] = [
  /before each model call/i,
  /before each paid call/i,
  /before the next paid call/i,
];

const folders = [
  new URL("../../../packages/studio/", import.meta.url),
  new URL("./", import.meta.url),
];

/** Installed packages and build output, which aren't Studio's own text. */
const skippedFolders = new Set(["node_modules", "dist", "coverage", ".turbo"]);

/** Studio's source and requirements, without tests, which may name a wrong line to reject it. */
function textFiles(folder: URL): URL[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return skippedFolders.has(entry.name) ? [] : textFiles(new URL(`${entry.name}/`, folder));
    }
    return entry.isFile() &&
      /\.(?:tsx?|md)$/.test(entry.name) &&
      !/\.(?:test|spec)\.tsx?$/.test(entry.name)
      ? [new URL(entry.name, folder)]
      : [];
  });
}

describe("Studio's budget timing", () => {
  it.each([
    "Halonic checks the budget before each model call, so calls already under way can take a run over it.",
    "The budget is checked before each paid call.",
    "Halonic stops before the next paid call.",
  ])("flags %s", (line) => {
    expect(wrongTimings.some((pattern) => pattern.test(line))).toBe(true);
  });

  it("lets the settled line through", () => {
    const line =
      "Halonic checks the budget before each step. A step can make several model calls, so a run can go over.";
    expect(wrongTimings.some((pattern) => pattern.test(line))).toBe(false);
  });

  it("says no wrong timing anywhere in Studio's text", () => {
    const files = folders.flatMap(textFiles);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          wrongTimings.some((pattern) => pattern.test(line))
            ? [`${file.pathname}:${index + 1}`]
            : [],
        ),
    );
    expect(offenders).toEqual([]);
  });
});
