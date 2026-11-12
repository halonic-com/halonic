import { describe, expect, it } from "vitest";
import { shellWord } from "./shell-word.ts";

describe("shellWord", () => {
  it("leaves a plain name unquoted", () => {
    expect(shellWord("agent", "linux")).toBe("agent");
  });

  it("quotes a name containing a space on POSIX", () => {
    expect(shellWord("my agents", "linux")).toBe('"my agents"');
  });

  it("escapes a double quote inside POSIX double quotes", () => {
    expect(shellWord('agent"name', "linux")).toBe('"agent\\"name"');
  });

  it("escapes a dollar sign inside POSIX double quotes", () => {
    expect(shellWord("agent$name", "linux")).toBe('"agent\\$name"');
  });

  it("escapes a backtick inside POSIX double quotes", () => {
    expect(shellWord("agent`name", "linux")).toBe('"agent\\`name"');
  });

  it("escapes a backslash inside POSIX double quotes", () => {
    expect(shellWord("agent\\name", "linux")).toBe('"agent\\\\name"');
  });

  it("keeps Windows path separators unchanged", () => {
    expect(shellWord("agents\\acme", "win32")).toBe("agents\\acme");
  });

  it("preserves Windows path separators when quoting a path", () => {
    expect(shellWord("agents\\my folder", "win32")).toBe('"agents\\my folder"');
  });

  it("does not escape characters inside Windows double quotes", () => {
    expect(shellWord("agent$name", "win32")).toBe('"agent$name"');
  });
});
