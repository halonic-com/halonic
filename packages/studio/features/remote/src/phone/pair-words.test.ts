import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MAKE_NEW_CODE } from "../pairing/pairing-words.ts";
import { pairWords } from "./pair-words.ts";

const laptop = "Tim's laptop";

verifies("remote.phone-pairing-problems", () => {
  it("says the tries left in the typed field's error, in the plural forms", () => {
    expect(pairWords.typed.wrong(4)).toBe("That code doesn't match. 4 tries left.");
    expect(pairWords.typed.wrong(1)).toBe("That code doesn't match. 1 try left.");
  });

  it("names the computer on every problem screen that has it", () => {
    expect(pairWords.ended.bodyNoAllow(laptop)).toContain("Allow wasn't pressed on Tim's laptop");
    expect(pairWords.used.body(laptop)).toContain("If Tim's laptop asks you to allow a phone");
    expect(pairWords.refused.title(laptop)).toBe("Tim's laptop didn't allow this phone");
    expect(pairWords.unreachable.title(laptop)).toBe("Can't reach Tim's laptop");
    expect(pairWords.rateLimited.title(laptop)).toBe("Too many tries on Tim's laptop");
    expect(pairWords.cantConfirm.title(laptop)).toBe("Can't confirm it's Tim's laptop");
    expect(pairWords.cantConfirm.body(laptop)).toContain("same network as Tim's laptop");
  });

  it("names the button the computer's ended screens show, not New code (C626 #3)", () => {
    const named = `choose **${MAKE_NEW_CODE}**`;
    expect(pairWords.ended.body).toContain(named);
    expect(pairWords.ended.bodyNoAllow(laptop)).toContain(named);
    const allWords = JSON.stringify([
      pairWords.ended.body,
      pairWords.ended.bodyNoAllow(laptop),
      pairWords.used.next,
      pairWords.used.nextTyped,
    ]);
    expect(allWords).not.toContain("New code");
  });

  it("names the computer on Check the code and Paired", () => {
    expect(pairWords.check.question(laptop)).toBe("Is this the same code as on Tim's laptop?");
    expect(pairWords.check.hint(laptop)).toContain("Press **Allow** on Tim's laptop.");
    expect(pairWords.check.waiting(laptop)).toBe("Waiting for you to press Allow on Tim's laptop…");
    expect(pairWords.done.heading(laptop)).toBe("Paired with Tim's laptop");
  });
});
