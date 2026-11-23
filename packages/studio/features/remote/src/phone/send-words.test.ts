import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { sendOutcomeLine } from "./send-words.ts";

verifies("remote.phone-remote-answers", () => {
  it("says an answer the owner check stopped wasn't sent, and that trying again on the phone works", () => {
    expect(sendOutcomeLine("answer", { kind: "not-sent", reason: "not-confirmed" })).toBe(
      "Not sent. Your phone couldn't confirm it's you. Try again, or answer this on your computer.",
    );
  });

  it("keeps the prompt's line for not-confirmed, since only an answer gets it", () => {
    expect(sendOutcomeLine("prompt", { kind: "not-sent", reason: "not-confirmed" })).toBe(
      "Your phone can't send this. Send it from your computer.",
    );
  });

  it("keeps the risky line for an answer the phone may not send", () => {
    expect(sendOutcomeLine("answer", { kind: "not-sent", reason: "not-allowed" })).toBe(
      "Answer this on your computer.",
    );
  });
});
