import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { readCollectionName, renameCollectionText } from "./collection-text.ts";

const collection = [
  "id: claims # the file's id",
  "name: Claims # shown in the list",
  "fields:",
  "  amount: { type: money, required: true }",
  "views:",
  "  open: { where: { status: open } }",
  "",
].join("\n");

function renamed(name: string, text = collection): string {
  const result = renameCollectionText(text, name);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

verifies("app.collection-text", () => {
  it("reads the name", () => {
    expect(readCollectionName(collection)).toEqual({ ok: true, value: "Claims" });
  });

  it("changes only the name and keeps the comments, the id and the rest in order", () => {
    expect(renamed("Open claims")).toBe(collection.replace("name: Claims", "name: Open claims"));
  });

  it("trims the new name", () => {
    expect(renamed("  Open claims  ")).toBe(renamed("Open claims"));
  });

  it("returns the text as it was when the name is unchanged", () => {
    expect(renamed("Claims")).toBe(collection);
    expect(renamed(" Claims ")).toBe(collection);
  });

  it("refuses a name of spaces and returns no text", () => {
    expect(renameCollectionText(collection, "   ")).toEqual({ ok: false, error: "name_missing" });
  });

  it("reads a missing name as empty and adds it on rename", () => {
    const bare = "id: claims\nfields: {}\n";
    expect(readCollectionName(bare)).toEqual({ ok: true, value: "" });
    expect(renamed("Claims", bare)).toContain("name: Claims");
  });

  it("says unreadable for a file that isn't a map or isn't YAML", () => {
    expect(readCollectionName("- a\n- b\n")).toEqual({ ok: false, error: "unreadable" });
    expect(renameCollectionText("a: [", "X")).toEqual({ ok: false, error: "unreadable" });
  });
});
