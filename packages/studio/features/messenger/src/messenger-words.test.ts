import { describe, expect, it } from "vitest";
import { messengerWords } from "./messenger-words.ts";

describe("messengerWords", () => {
  it("says where a message the chat refused stays, as the other kept lines do (HAL-18099)", () => {
    expect(messengerWords.kept["bad-answer"]()).toBe(
      "This can't be sent in this chat. Your message stays here and isn't sent.",
    );
  });
});
