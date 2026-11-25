import { readFile } from "node:fs/promises";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { buttonNamed } from "./screen.ts";
import { buttonLabels, errorCodeIn, screenText, words } from "./words.ts";

const repo = new URL("../../../../", import.meta.url);

verifies("studio-click-test.steps", () => {
  describe("buttonLabels", () => {
    it.each(Object.values(buttonLabels))("$text is still in $file", async ({ text, file }) => {
      const source = await readFile(new URL(file, repo), "utf8");
      expect(source.includes(`"${text}"`) || source.includes(`>${text}<`)).toBe(true);
    });
  });

  describe("screenText", () => {
    it.each(Object.values(screenText))("$text is still in $file", async ({ text, file }) => {
      const source = await readFile(new URL(file, repo), "utf8");
      expect(source).toContain(text);
    });
  });

  describe("errorCodeIn", () => {
    it("names the code of a known error line, and nothing for a clean screen", () => {
      expect(errorCodeIn(`Settings ${words.listFailed}`)).toBe("LIST_FAILED");
      expect(errorCodeIn(words.engineNotStarted)).toBe("ENGINE_NOT_STARTED");
      expect(errorCodeIn(words.chatHeading)).toBeUndefined();
    });
  });

  describe("buttonNamed", () => {
    it("quotes a label with an apostrophe in an XPath", () => {
      expect(buttonNamed("Don't")).toContain(`normalize-space()="Don't"`);
      expect(buttonNamed(`It's "x"`)).toContain(`concat('It', "'", 's "x"')`);
    });

    // Run 45618406555: Open demo also holds its hidden "Copying the demo…" copy,
    // so a match on the whole button's text never found it.
    it("also finds a button by a part that isn't hidden, or by its accessible name", () => {
      const xpath = buttonNamed("Open demo");
      expect(xpath).toContain(".//*[normalize-space()='Open demo' and not(ancestor-or-self::*[");
      expect(xpath).toContain("' invisible '");
      expect(xpath).toContain("@aria-label='Open demo'");
    });
  });
});
