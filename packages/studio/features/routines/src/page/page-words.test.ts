import { KindedError } from "@halonicjs/std";
import { EngineNotAnswering } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { failureReason } from "./page-words.ts";

verifies("routines.page.frame-and-states", () => {
  // C600 #3 (HAL-15607): with the shell's git failing, the page blamed the engine, which was fine.
  it("doesn't blame the engine for an error that has no reason of its own", () => {
    expect(failureReason(new Error("git exited with 128"))).toBe(
      "Halonic ran into a problem it can't explain yet.",
    );
    expect(failureReason(new KindedError("unavailable", ""))).toBe(
      "Halonic ran into a problem it can't explain yet.",
    );
  });

  it("says the engine isn't answering only when it can't be reached, in the words for where Studio runs", () => {
    expect(
      failureReason(new EngineNotAnswering(), "Halonic on your computer isn't answering."),
    ).toBe("Halonic on your computer isn't answering.");
  });

  it("gives a kinded error's own reason, ending in a full stop", () => {
    expect(failureReason(new KindedError("unavailable", "Another program is using it"))).toBe(
      "Another program is using it.",
    );
  });
});
