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

  it("escapes a dollar sign for PowerShell, so a pasted path never runs $(…)", () => {
    expect(shellWord("agents\\$(Remove-Item x)", "win32")).toBe('"agents\\`$(Remove-Item x)"');
    expect(shellWord("agent$name", "win32")).toBe('"agent`$name"');
  });

  it("escapes a backtick for PowerShell", () => {
    expect(shellWord("agent`name", "win32")).toBe('"agent``name"');
  });

  it("doubles a double quote on Windows, so cmd.exe keeps the rest inside the quotes", () => {
    expect(shellWord('agent" & calc & "x', "win32")).toBe('"agent"" & calc & ""x"');
  });

  it("escapes the curly double quotes PowerShell also ends a string at", () => {
    expect(shellWord("agent“name”„", "win32")).toBe('"agent`“name`”`„"');
  });

  it("leaves characters PowerShell reads literally inside double quotes", () => {
    expect(shellWord("my agents & 'co' 50%", "win32")).toBe("\"my agents & 'co' 50%\"");
  });
});
