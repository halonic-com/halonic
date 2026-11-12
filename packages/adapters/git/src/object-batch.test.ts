import { describe, expect, it } from "vitest";
import { fitsOnBatchLine, isRegularFileMode, parseBatch, treeEntries } from "./object-batch.ts";

const commitId = "a".repeat(40);
const blobId = "b".repeat(40);

describe("parseBatch", () => {
  it("reads found objects and missing names in order, content with line breaks included", () => {
    const output = Buffer.from(
      `${commitId} commit 3\nc\nd\n` + `${commitId}:gone missing\n` + `${blobId} blob 0\n\n`,
    );
    expect(parseBatch(output, 3)).toEqual([
      { id: commitId, type: "commit", content: Buffer.from("c\nd") },
      null,
      { id: blobId, type: "blob", content: Buffer.alloc(0) },
    ]);
  });

  it("refuses output cut short", () => {
    expect(() => parseBatch(Buffer.from(`${blobId} blob 5\nab\n`), 1)).toThrow("cut short");
    expect(() => parseBatch(Buffer.from(`${blobId} blob 0\n\n`), 2)).toThrow("ends early");
  });
});

describe("treeEntries", () => {
  it("reads mode, name bytes and id, with a space in a name", () => {
    const id = Buffer.alloc(20, 0xab);
    const tree = Buffer.concat([
      Buffer.from("100644 a b.yaml\0"),
      id,
      Buffer.from("40000 sub\0"),
      id,
    ]);
    expect(treeEntries(tree, 20)).toEqual([
      { mode: "100644", name: Buffer.from("a b.yaml"), id: "ab".repeat(20) },
      { mode: "40000", name: Buffer.from("sub"), id: "ab".repeat(20) },
    ]);
  });

  it("refuses bytes that aren't a tree", () => {
    expect(() => treeEntries(Buffer.from("100644 a\0short"), 20)).toThrow("isn't one");
  });
});

describe("isRegularFileMode", () => {
  it.each([
    ["100644", true],
    ["100755", true],
    ["100664", true],
    ["120000", false],
    ["160000", false],
    ["40000", false],
    ["", false],
    ["10064x", false],
  ])("%s is a regular file: %s", (mode, regular) => {
    expect(isRegularFileMode(mode)).toBe(regular);
  });
});

describe("fitsOnBatchLine", () => {
  it("refuses a name with a line break or a carriage return", () => {
    expect(fitsOnBatchLine("a b.yaml")).toBe(true);
    expect(fitsOnBatchLine("a\nb")).toBe(false);
    expect(fitsOnBatchLine("a\rb")).toBe(false);
  });
});
