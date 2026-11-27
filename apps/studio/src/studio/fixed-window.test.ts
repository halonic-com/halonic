import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { compile } from "tailwindcss";
import { expect, it } from "vitest";

// Under jsdom `import.meta.url` isn't a file URL, so files are found from the package folder,
// where Vitest runs each package's tests.
const modules = path.join(process.cwd(), "node_modules");
/** The shell's CSS entry, the one the Studio page imports (src/studio/studio.css). */
const studioEntry = path.join(
  realpathSync(path.join(modules, "@halonicjs/studio-shell")),
  "src/studio.css",
);

/** Where the entry's bare imports lead, as the app's node_modules resolve them. */
const packageStyles: Record<string, string> = {
  tailwindcss: path.join(modules, "tailwindcss/index.css"),
  "@halonicjs/studio-kit": path.join(modules, "@halonicjs/studio-kit/src/theme.css"),
  "@halonicjs/studio-kit/fonts": path.join(modules, "@halonicjs/studio-kit/src/theme-font.css"),
};

/** The CSS Tailwind writes from the Studio's entry, with no classes asked for. */
async function buildStudioCss(): Promise<string> {
  const compiler = await compile(await readFile(studioEntry, "utf8"), {
    base: path.dirname(studioEntry),
    async loadStylesheet(id, from) {
      const file = packageStyles[id] ?? path.resolve(from, id);
      return { path: file, base: path.dirname(file), content: await readFile(file, "utf8") };
    },
  });
  return compiler.build([]);
}

verifies("studio.fixed-window", () => {
  it("fills the window with the document, its body and the root, and never lets them scroll", async () => {
    const css = await buildStudioCss();
    const rule = /(?:^|[{}\s])html, body, #root \{([^}]*)\}/.exec(css)?.[1] ?? "";

    expect(rule).toMatch(/height: 100%;/);
    expect(rule).toMatch(/overflow: hidden;/);
  });
});
