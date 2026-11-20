import { describe, expect, it } from "vitest";
import { defineMessages } from "./define.ts";
import {
  bold,
  dim,
  dimmed,
  joinedFacts,
  lineOfFacts,
  markGlyph,
  markPart,
  type Part,
  phrase,
  plainText,
  pushText,
} from "./phrase.ts";

describe("phrase", () => {
  it("joins text and numbers into one part and keeps marks and emphasis as parts", () => {
    const inner = phrase`${bold("reply")} ${dim("(12 s)")}`;
    expect(phrase`Wrote ${12} files ${markPart("separator")} ${inner}`).toEqual([
      "Wrote 12 files ",
      { mark: "separator" },
      " ",
      { text: "reply", emphasis: "bold" },
      " ",
      { text: "(12 s)", emphasis: "dim" },
    ]);
  });

  it("dims every text of a phrase and keeps its marks", () => {
    expect(dimmed(["Today ", markPart("separator"), bold("14:02")])).toEqual([
      dim("Today "),
      markPart("separator"),
      dim("14:02"),
    ]);
  });
});

describe("plainText", () => {
  it("writes the Unicode marks and the Unicode padding, without emphasis", () => {
    const line: Part[] = [
      markPart("done"),
      { padding: { unicode: 2, ascii: 1 } },
      bold("Disk"),
      " 48 GB free",
    ];
    expect(plainText(line)).toBe("✓  Disk 48 GB free");
  });

  it("has a Unicode text for every mark", () => {
    expect(
      (["done", "failed", "needsYou", "working", "separator", "studioPath"] as const).map(
        markGlyph,
      ),
    ).toEqual(["✓", "✕", "!", "◌", "·", "›"]);
  });
});

describe("facts", () => {
  it("joins facts with the separator, and a line of facts starts with a capital", () => {
    expect(plainText(joinedFacts(["Writer", "smart"]))).toBe("Writer · smart");
    expect(plainText(lineOfFacts(["sent nothing", "asked you once"]))).toBe(
      "Sent nothing · asked you once",
    );
    expect(lineOfFacts([])).toEqual([]);
  });
});

describe("pushText", () => {
  it("adds to the plain text before it, starts a new part after a mark, and skips empty text", () => {
    const parts: Part[] = ["Wrote "];
    pushText(parts, "12");
    pushText(parts, "");
    expect(parts).toEqual(["Wrote 12"]);
    parts.push(markPart("separator"));
    pushText(parts, " done");
    expect(parts).toEqual(["Wrote 12", markPart("separator"), " done"]);
  });
});

describe("defineMessages", () => {
  it("keys each entry by its area and name", () => {
    const schema = defineMessages("schema", {
      wrote: (count: number, folder: string) => phrase`Wrote ${count} JSON Schemas to ${folder}.`,
    });
    const message = schema.wrote(12, "./schemas");
    expect(message.key).toBe("schema.wrote");
    expect(plainText(message.phrase)).toBe("Wrote 12 JSON Schemas to ./schemas.");
  });
});
