import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { isReactionEmoji, reactionEmoji } from "./message-reactions.ts";

verifies("ports.message-reactions", () => {
  describe("reaction emoji", () => {
    it("are the six, in the order apps show them", () => {
      expect(reactionEmoji).toEqual(["👍", "❤️", "😂", "😮", "✅", "👀"]);
    });

    it("accepts only the six", () => {
      expect(reactionEmoji.every((emoji) => isReactionEmoji(emoji))).toBe(true);
      for (const other of ["🎉", "thumbs up", "", undefined, 1, "👍👍", "❤"]) {
        expect(isReactionEmoji(other)).toBe(false);
      }
    });
  });
});
