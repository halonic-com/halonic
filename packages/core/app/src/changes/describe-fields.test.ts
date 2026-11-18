import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { sentenceChanges, sentencesChanged } from "./describe-fields.ts";

verifies("app.change-sentences", () => {
  describe("sentenceChanges", () => {
    it("gives the one sentence an edit changed and leaves out the others", () => {
      const was = "Write short sentences.\nNever promise money back.";
      const is = "Write short, warm sentences.\nNever promise money back.";
      expect(sentenceChanges(was, is)).toEqual([
        { removed: ["Write short sentences."], added: ["Write short, warm sentences."] },
      ]);
      expect(sentencesChanged(was, is)).toBe(1);
    });

    it("gives an added sentence with nothing removed", () => {
      expect(sentenceChanges("Be brief.", "Be brief. Use English.")).toEqual([
        { removed: [], added: ["Use English."] },
      ]);
    });

    it("gives nothing when only the spacing between sentences changed", () => {
      expect(sentenceChanges("Be brief.  Use English.", "Be brief.\nUse English.")).toEqual([]);
    });
  });
});
