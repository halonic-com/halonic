import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { privateDefinitionPaths, unsafeDefinitionPaths } from "./definition-store.ts";

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

verifies("ports.definition-store-private-entries", () => {
  // The same for private paths: each kind the port doc names is in the list.
  const segments = (path: string) => path.split("/");
  it.each([
    [".git in another case", (path: string) => segments(path).includes(".GIT")],
    [".git with a code point HFS+ ignores", (path: string) => path.includes(".g\u200Cit")],
    [".studio", (path: string) => segments(path).includes(".studio")],
    [".studio with a long s", (path: string) => segments(path).includes(".\u017Ftudio")],
    [".studio with an st ligature", (path: string) => segments(path).includes(".\uFB06udio")],
    [".git with a dotless i", (path: string) => segments(path).includes(".g\u0131t")],
    [".env", (path: string) => segments(path).includes(".env")],
    [".envrc", (path: string) => segments(path).includes(".envrc")],
    [".env.*", (path: string) => segments(path).includes(".env.local")],
    ["a trailing dot or space", (path: string) => segments(path).includes(".env. ")],
    ["an NTFS stream", (path: string) => path.includes(":")],
    ["an 8.3 short name", (path: string) => /~\d/u.test(path)],
    ["a private segment below the root", (path: string) => path.startsWith("hubs/.GIT/")],
  ])("has a path with %s", (_kind, matches) => {
    expect(privateDefinitionPaths.some(matches)).toBe(true);
  });
});
