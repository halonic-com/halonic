import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { listedToolsWords, toolCount } from "./listed-tools-words.ts";

verifies("library.listed-tools-review", () => {
  it("counts tools in words and numbers", () => {
    expect(toolCount(1)).toBe("1 tool");
    expect(toolCount(2)).toBe("2 tools");
  });

  it("says what changed since the last approval, only the parts that apply", () => {
    expect(listedToolsWords.whatChanged("Notes server", 1, 1)).toBe(
      "Since you last approved, Notes server changed 1 tool and listed 1 you haven't approved.",
    );
    expect(listedToolsWords.whatChanged("Notes server", 0, 2)).toBe(
      "Since you last approved, Notes server listed 2 you haven't approved.",
    );
    expect(listedToolsWords.whatChanged("Notes server", 0, 0)).toBe("");
  });

  it("names the tool of an unreadable approval only when the service gives it", () => {
    expect(listedToolsWords.unreadable("Notes server", "lookup")).toContain(
      "your approval for lookup",
    );
    expect(listedToolsWords.unreadable("Notes server", undefined)).toContain(
      "an approval for Notes server",
    );
  });

  it("ends Approved without a leftover sentence when nothing stays off", () => {
    expect(listedToolsWords.approved(2, "Notes server", 0)).toBe(
      "Approved 2 tools from Notes server",
    );
  });
});
