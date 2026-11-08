import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { unsafeDefinitionPaths } from "./definition-store.ts";

verifies("contracts.definition-source", () => {
  // The suite is only as strong as this list: each kind of unsafe path from the port doc is in it.
  it.each([
    ["absolute", (path: string) => path.startsWith("/")],
    ["a .. segment", (path: string) => path.split("/").includes("..")],
    ["a . segment", (path: string) => path.split("/").includes(".")],
    ["an empty segment", (path: string) => path.split("/").includes("")],
    ["a backslash", (path: string) => path.includes("\\")],
    ["a NUL", (path: string) => path.includes("\u0000")],
  ])("has a path that is %s", (_kind, matches) => {
    expect(unsafeDefinitionPaths.some(matches)).toBe(true);
  });
});
