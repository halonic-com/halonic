import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { teamWords } from "./team-words.ts";

verifies("team.spend-and-seats", () => {
  describe("counts on the spend and seats page", () => {
    it("says its for 1 seat near the limit and their for 2 or more", () => {
      expect(teamWords.nearLimit(0)).toBe("None near their limit");
      expect(teamWords.nearLimit(1)).toBe("1 near its limit");
      expect(teamWords.nearLimit(2)).toBe("2 near their limit");
    });

    it("says run for 1 unpriced run and runs for more", () => {
      expect(teamWords.notPriced(1)).toBe("1 run not priced yet");
      expect(teamWords.notPriced(560)).toBe("560 runs not priced yet");
    });
  });
});

verifies("team.notices", () => {
  describe("the held queue line", () => {
    it("says PR for 1 pull request and PRs for more", () => {
      expect(teamWords.notice.queueHeldLine(12, 1)).toBe("Longest wait 12 min · 1 PR in the queue");
      expect(teamWords.notice.queueHeldLine(12, 7)).toBe(
        "Longest wait 12 min · 7 PRs in the queue",
      );
    });
  });
});
