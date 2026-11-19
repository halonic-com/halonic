import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { refusalLine, refusalLineText } from "./refusal-line.ts";

verifies("library.refusal-line", () => {
  it("names the source, what was refused, the tool and the reason", () => {
    expect(
      refusalLine({
        source: "notes",
        name: "look up",
        refused: "tool",
        reason: "its name breaks the name rule",
      }),
    ).toEqual([{ text: 'notes: left out "look up": its name breaks the name rule' }]);
  });

  it("leaves the quotes out when a whole tool list is refused", () => {
    expect(
      refusalLine({ source: "notes", refused: "listing", reason: "it isn't a list of tools" }),
    ).toEqual([{ text: "notes: left out the listing: it isn't a list of tools" }]);
  });

  it("words a refused keyword as the listed-tools review does", () => {
    const line = refusalLine({ source: "notes", name: "find", refused: "keyword", reason: "why" });
    expect(refusalLineText(line)).toBe(
      'notes: "find": Halonic left out part of its arguments: why',
    );
  });

  it("says a refused call as a sentence, with the tool's name apart in code type", () => {
    expect(
      refusalLine({
        source: "notes-mcp",
        name: "create_note",
        refused: "call",
        reason: "the folder is read-only",
      }),
    ).toEqual([
      { text: "notes-mcp refused a call to " },
      { text: "create_note", code: true },
      { text: ": the folder is read-only." },
    ]);
  });

  it("ends a refused call with one full stop, and leaves out the name when it has none", () => {
    expect(
      refusalLineText(refusalLine({ source: "notes-mcp", refused: "call", reason: "Not now." })),
    ).toBe("notes-mcp refused a call: Not now.");
  });
});
