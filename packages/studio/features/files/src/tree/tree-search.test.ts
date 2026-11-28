import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { buildTree } from "./tree-model.ts";
import { foldersWithout, matchingFiles, searchedTree, searchTextOf } from "./tree-search.ts";

const acme = [
  "src/checkout/cart.ts",
  "src/checkout/totals.ts",
  "tests/subtotal.test.ts",
  "node_modules/totals/index.js",
  "README.md",
];

verifies("files.ui.tree-search", () => {
  it("searches for the typed text without the spaces round it, in lower case", () => {
    expect(searchTextOf("  Total ")).toBe("total");
    expect(searchTextOf("   ")).toBe("");
  });

  it("keeps the files whose path holds the text, whatever the case", () => {
    expect(matchingFiles(acme, "total")).toEqual([
      "src/checkout/totals.ts",
      "tests/subtotal.test.ts",
      "node_modules/totals/index.js",
    ]);
    expect(matchingFiles(acme, "readme")).toEqual(["README.md"]);
  });

  it("finds every file in a folder by the folder's name", () => {
    expect(matchingFiles(acme, "checkout/")).toEqual([
      "src/checkout/cart.ts",
      "src/checkout/totals.ts",
    ]);
  });

  it("keeps every file while nothing is searched", () => {
    expect(matchingFiles(acme, "")).toBe(acme);
  });

  it("counts the files the tree draws and names every folder to open", () => {
    const found = searchedTree(buildTree(matchingFiles(acme, "total")));
    // The file in `node_modules` matches, but the tree never shows that folder.
    expect(found.files).toBe(2);
    expect([...found.folders].sort()).toEqual(["src", "src/checkout", "tests"]);
  });

  it("leaves out the folders closed during the search", () => {
    const folders = new Set(["src", "src/checkout", "tests"]);
    expect([...foldersWithout(folders, new Set(["tests"]))]).toEqual(["src", "src/checkout"]);
  });
});
