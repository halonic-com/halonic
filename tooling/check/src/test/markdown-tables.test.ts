import { describe, expect, it } from "vitest";
import { compactTables, firstPaddedLine } from "../lib/markdown-tables.ts";

describe("tooling/check: markdown tables", () => {
  it("removes the padding and shortens the delimiter row", () => {
    const padded = "| Part   | What it does |\n| ------ | ------------ |\n| `Bus`  | one handler |";
    expect(compactTables(padded)).toBe(
      "| Part | What it does |\n| --- | --- |\n| `Bus` | one handler |",
    );
  });

  it("keeps alignment colons and escaped pipes", () => {
    const padded = "| a  | b  | c |\n| :-- | --: | :-: |\n| x\\|y | 1 | 2 |";
    expect(compactTables(padded)).toBe("| a | b | c |\n| :--- | ---: | :---: |\n| x\\|y | 1 | 2 |");
  });

  it("leaves tables in code fences and plain text alone", () => {
    const text = "```md\n| a   | b |\n| --- | - |\n```\n\n| not a table\nplain | text";
    expect(compactTables(text)).toBe(text);
  });

  it("is idempotent and keeps CRLF line ends", () => {
    const once = compactTables("| a  | b |\r\n| -- | -- |\r\n| 1  | 2 |\r\n");
    expect(once).toBe("| a | b |\r\n| --- | --- |\r\n| 1 | 2 |\r\n");
    expect(compactTables(once)).toBe(once);
  });

  it("keeps the indent of a table nested in a list", () => {
    const nested = "- item\n\n  | a  | b |\n  | -- | -- |\n  | 1  | 2 |\n";
    expect(compactTables(nested)).toBe("- item\n\n  | a | b |\n  | --- | --- |\n  | 1 | 2 |\n");
  });

  it("names the first padded line, or none", () => {
    expect(firstPaddedLine("text\n\n| a | b |\n| --- | --- |\n| 1 | 2 |")).toBeUndefined();
    expect(firstPaddedLine("text\n\n| a | b |\n| --- | --- |\n| 1   | 2 |")).toBe(5);
  });
});
