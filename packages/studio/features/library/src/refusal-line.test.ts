import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { refusalLine } from "./refusal-line.ts";

verifies("library.refusal-line", () => {
  it("names the source, what was refused, the tool and the reason", () => {
    expect(
      refusalLine({
        source: "notes",
        name: "look up",
        refused: "tool",
        reason: "its name breaks the name rule",
      }),
    ).toBe('notes: left out "look up": its name breaks the name rule');
  });

  it("leaves the quotes out when a whole listing is refused", () => {
    expect(
      refusalLine({ source: "notes", refused: "listing", reason: "it isn't a list of tools" }),
    ).toBe("notes: left out the listing: it isn't a list of tools");
  });

  it("says what each other kind of refusal did", () => {
    const line = (refused: "keyword" | "call") =>
      refusalLine({ source: "notes", name: "find", refused, reason: "why" });
    expect(line("keyword")).toBe('notes: changed "find": why');
    expect(line("call")).toBe('notes: refused a call to "find": why');
  });
});
