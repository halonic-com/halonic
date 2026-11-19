import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

/**
 * Tailwind drops a class it doesn't know without a word, so a colour or type class the kit's
 * theme doesn't define (`text-danger-text` for `text-danger`) leaves its element in the normal
 * text colour or size. This builds the Studio page's CSS as Vite does and fails on such a class.
 *
 * It lives in the app, not the kit: the app depends on every Studio package, so Turbo runs it
 * again whenever one of them changes.
 */

// Under jsdom `import.meta.url` isn't a file URL, so files are found from the package folder,
// where Vitest runs each package's tests.
const modules = path.join(process.cwd(), "node_modules");
const shellFolder = realpathSync(path.join(modules, "@halonicjs/studio-shell"));
/** The shell's CSS entry, the one the Studio page imports (src/studio/studio.css). */
const studioEntry = path.join(shellFolder, "src/studio.css");
/** The folder the entry's `@source "../.."` gives Tailwind: every Studio package. */
const studioFolder = path.join(shellFolder, "..");

/** Where the entry's bare imports lead, as the app's node_modules resolve them. */
const packageStyles: Record<string, string> = {
  tailwindcss: path.join(modules, "tailwindcss/index.css"),
  "@halonicjs/studio-kit": path.join(modules, "@halonicjs/studio-kit/src/theme.css"),
};

/** The CSS Tailwind writes from the Studio's entry for `classes`. */
async function buildStudioCss(classes: readonly string[]): Promise<string> {
  const compiler = await compile(await readFile(studioEntry, "utf8"), {
    base: path.dirname(studioEntry),
    async loadStylesheet(id, from) {
      const file = packageStyles[id] ?? path.resolve(from, id);
      return { path: file, base: path.dirname(file), content: await readFile(file, "utf8") };
    },
  });
  return compiler.build([...classes]);
}

/** Every shipped source file of the Studio packages: no tests, no e2e pages, no node_modules. */
function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      return ["node_modules", "dist", "e2e"].includes(entry.name) ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** A file's text with its comments blanked, so a comment naming a token isn't read as a class. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) => comment.replace(/[^\n]/g, " "));
}

/**
 * A colour, size or edge utility, after any variants (`hover:`, `phone:`): `text-danger`,
 * `bg-surface-muted`, `border-s-2`, `ring-accent/40`. Its group is the utility without variants.
 */
const utility =
  /(?<![\w:/-])(?:[\w-]+:)*((?:text|bg|border|fill|stroke|ring|outline|divide|decoration|placeholder|caret)-[a-z0-9-]+(?:\/\d+)?)(?![\w/-])/g;

/** Every utility the Studio packages name, with the `file:line` places it's used. */
function usedUtilities(): Map<string, string[]> {
  const places = new Map<string, string[]>();
  for (const file of sourceFiles(studioFolder)) {
    const lines = withoutComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      for (const [, name = ""] of line.matchAll(utility)) {
        const where = `${path.relative(studioFolder, file)}:${index + 1}`;
        places.set(name, [...(places.get(name) ?? []), where]);
      }
    });
  }
  return places;
}

/**
 * Every class a selector in `css` names, unescaped: `.ring-accent\/40:hover` -> `ring-accent/40`.
 * A whole name, so an unknown `bg-surface-sub` doesn't pass as the start of `bg-surface-subtle`.
 */
function classesIn(css: string): Set<string> {
  const names = css.matchAll(/\.((?:\\.|[\w-])+)/g);
  return new Set([...names].map(([, name = ""]) => name.replace(/\\(.)/g, "$1")));
}

describe("the Studio's colour and type classes", () => {
  it("finds the classes it checks, so an empty scan can't pass", () => {
    const places = usedUtilities();
    expect(places.get("text-danger")?.length).toBeGreaterThan(10);
    expect(places.get("bg-surface")?.length).toBeGreaterThan(10);
  });

  it("are all defined by the kit's theme, so none falls back to the normal text", async () => {
    const places = usedUtilities();
    const defined = classesIn(await buildStudioCss([...places.keys()]));
    const unknown = [...places]
      .filter(([name]) => !defined.has(name))
      .map(([name, where]) => `${name} (${where.join(", ")})`);
    expect(unknown).toEqual([]);
  });
});
