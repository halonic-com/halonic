import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { buildCss, THEME_ENTRY } from "./test/build-css.spec.ts";

/** The desktop Studio's setup: the theme, then the fonts (`@halonicjs/studio-kit/fonts`). */
const DESKTOP_ENTRY = `${THEME_ENTRY}\n@import "./src/theme-font.css";`;

/** Every `@font-face` block Tailwind wrote, as its declarations by property. */
function fontFaces(css: string): Map<string, string>[] {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(
    (match) =>
      new Map(
        (match[1] ?? "")
          .split(";")
          .map((line) => line.trim())
          .filter((line) => line !== "")
          .map((line) => {
            const colon = line.indexOf(":");
            return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
          }),
      ),
  );
}

verifies("kit.inter-font", () => {
  describe("theme.css built by Tailwind: the Inter font", () => {
    it("ships upright and italic Inter Variable from files in the kit", async () => {
      const faces = fontFaces(await buildCss([], DESKTOP_ENTRY));
      const inter = faces.filter((face) => face.get("font-family") === '"Inter Variable"');
      expect(inter.map((face) => face.get("font-style")).sort()).toEqual(["italic", "normal"]);
      for (const face of inter) {
        expect(face.get("font-weight")).toBe("100 900");
        expect(face.get("font-display")).toBe("swap");
        const file = /^url\("(\.\/fonts\/[\w-]+\.woff2)"\) format\("woff2"\)$/.exec(
          face.get("src") ?? "",
        )?.[1];
        expect(file, face.get("src")).toBeDefined();
        await access(path.join(import.meta.dirname, file ?? ""));
      }
    });

    it("loads Inter on the states page too, so its screenshots match the Studio", async () => {
      const statesFolder = path.join(import.meta.dirname, "../states");
      const entry = await readFile(path.join(statesFolder, "states.css"), "utf8");
      const faces = fontFaces(await buildCss([], entry, statesFolder));
      const inter = faces.filter((face) => face.get("font-family") === '"Inter Variable"');
      expect(inter.map((face) => face.get("font-style")).sort()).toEqual(["italic", "normal"]);
    });

    it("leaves the font files out of the theme alone, so the phone's connect page stays small", async () => {
      expect(fontFaces(await buildCss([]))).toEqual([]);
    });

    it("names Inter Variable first in --font-sans, fallbacks kept", async () => {
      const css = await buildCss([]);
      const fontSans = /--font-sans:\s*([^;]+);/.exec(css)?.[1] ?? "";
      expect(fontSans.split(",").map((name) => name.trim())).toEqual([
        '"Inter Variable"',
        '"Inter"',
        "ui-sans-serif",
        "system-ui",
        "-apple-system",
        '"Segoe UI"',
        "Roboto",
        "sans-serif",
      ]);
    });

    it("keeps the fonts' licence next to them", async () => {
      const licence = await readFile(path.join(import.meta.dirname, "fonts/LICENSE.txt"), "utf8");
      expect(licence).toContain("SIL Open Font License, Version 1.1");
    });
  });
});
