/**
 * Builds real CSS from theme.css with Tailwind, the way the app's and the states page's Vite
 * plugin do, for the classes a test names. jsdom can't compute Tailwind's styles (it ignores
 * `@layer`), so a test that cares what a class really does checks this output instead.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { compile } from "tailwindcss";

const kitFolder = path.join(import.meta.dirname, "../..");
/** Tailwind's own entry, through the kit's link to its devDependency. */
const tailwindEntry = path.join(kitFolder, "node_modules/tailwindcss/index.css");

/** The kit's own setup, as the README gives it to the app. */
export const THEME_ENTRY = `@import "tailwindcss";\n@import "./src/theme.css";`;

/**
 * The CSS Tailwind writes for `classes`, from `entry` (CSS text whose imports are relative to
 * `base`, the kit's folder unless given).
 */
export async function buildCss(
  classes: readonly string[],
  entry: string = THEME_ENTRY,
  base: string = kitFolder,
): Promise<string> {
  const compiler = await compile(entry, {
    base,
    async loadStylesheet(id, from) {
      const file = id === "tailwindcss" ? tailwindEntry : path.resolve(from, id);
      return { path: file, base: path.dirname(file), content: await readFile(file, "utf8") };
    },
  });
  return compiler.build([...classes]);
}

/**
 * The selectors of every style rule, in the order written. At-rules (`@media`, `@layer`) are
 * left out. A rule may hold a nested at-rule, as a focus utility does with its forced-colours
 * outline; Tailwind leaves that nesting in, so the rule still counts.
 */
export function ruleSelectors(css: string): string[][] {
  return [...css.matchAll(/(?:^|[{};])\s*([^{}@;]+)\{/g)].map((match) =>
    (match[1] ?? "").split(",").map((selector) => selector.trim()),
  );
}
