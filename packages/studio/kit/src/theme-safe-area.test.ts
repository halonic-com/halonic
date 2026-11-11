import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCss } from "./test/build-css.spec.ts";

/** The value of `property` in the one rule Tailwind wrote for `.phone-top-bar`. */
function declaration(css: string, property: string): string {
  const rule = /\.phone-top-bar\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  return new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(rule)?.[1]?.trim() ?? "";
}

/** A length in px: `calc(a + b)` and `var(--x)` resolved from `variables`. */
function pixels(value: string, variables: Readonly<Record<string, number>>): number {
  const terms = value.replace(/^calc\((.*)\)$/, "$1").split("+");
  return terms.reduce((sum, term) => {
    const name = /var\((--[\w-]+)\)/.exec(term.trim())?.[1];
    const px = name === undefined ? Number.parseFloat(term) : variables[name];
    if (px === undefined || Number.isNaN(px)) throw new Error(`can't resolve ${term}`);
    return sum + px;
  }, 0);
}

describe("the phone top bar (component specs 15.1)", () => {
  it.each([0, 20, 47, 59])(
    "keeps at least 56px below a %ipx notch, border-box padding included",
    async (notch) => {
      const css = await buildCss(["phone-top-bar"]);
      const variables = { "--safe-top": notch, "--spacing-phone-bar": 56 };
      const padding = pixels(declaration(css, "padding-top"), variables);
      const minHeight = pixels(declaration(css, "min-height"), variables);
      expect(padding).toBe(notch);
      // Border-box: the row the Back button sits in is the min-height less the padding.
      expect(minHeight - padding).toBe(56);
    },
  );

  it("is how every kit top bar sets its height, never min-h-phone-bar beside pt-safe", async () => {
    const files = (await readdir(import.meta.dirname, { recursive: true })).filter(
      (file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"),
    );
    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(path.join(import.meta.dirname, file), "utf8");
      for (const [className] of source.matchAll(/"[^"\n]*"/g)) {
        if (className.includes("min-h-phone-bar") && className.includes("pt-safe")) {
          offenders.push(`${file}: ${className}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
