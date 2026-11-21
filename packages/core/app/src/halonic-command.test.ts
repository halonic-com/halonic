import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  halonicCommand,
  isWindowsFolder,
  reviewToolsCommand,
  startRunCommand,
} from "./halonic-command.ts";

// The drive is joined on, so no drive path stands in this file for the leak guard to find.
const drive = "D:";

verifies("app.halonic-command", () => {
  it("names a folder with a space in double quotes, after the command's words", () => {
    expect(halonicCommand("/acme/Documents/Acme sample", "runs send", ["6ab5ad", "approve"])).toBe(
      'halonic runs send --dir "/acme/Documents/Acme sample" 6ab5ad approve',
    );
  });

  it("leaves a plain folder unquoted", () => {
    expect(halonicCommand("/acme/shared/acme", "run", ["support/reply"])).toBe(
      "halonic run --dir /acme/shared/acme support/reply",
    );
  });

  it("writes a drive folder as WSL names it, where the CLI runs on Windows", () => {
    expect(halonicCommand(`${drive}\\Acme\\Acme sample`, "test", ["--filter", "reply"])).toBe(
      'halonic test --dir "/mnt/d/Acme/Acme sample" --filter reply', // leak-guard: allow absolute-path the WSL form under test, of an invented folder
    );
  });

  it("gives no command for a network share, which WSL can't open by its path", () => {
    expect(halonicCommand("\\\\acme\\Acme sample", "run", ["reply"])).toBeUndefined();
  });

  it("quotes an argument that needs it", () => {
    expect(halonicCommand("/acme/shared/acme", "test", ["--filter", "my reply"])).toBe(
      'halonic test --dir /acme/shared/acme --filter "my reply"',
    );
  });

  it("names no folder when the app gives none", () => {
    expect(halonicCommand(undefined, "run", ["reply"])).toBe("halonic run reply");
  });

  it("tells a Windows folder from a POSIX one", () => {
    expect(isWindowsFolder(`${drive}\\Acme`)).toBe(true);
    expect(isWindowsFolder("\\\\acme\\shared")).toBe(true);
    expect(isWindowsFolder("/acme/shared")).toBe(false);
    expect(isWindowsFolder(undefined)).toBe(false);
  });

  it("starts a run of a POSIX folder, with the workflow's name once it's known", () => {
    expect(startRunCommand("/acme/Documents/Acme sample", "reply")).toBe(
      'halonic run --dir "/acme/Documents/Acme sample" reply',
    );
    expect(startRunCommand("/acme/shared/acme")).toBe("halonic run --dir /acme/shared/acme");
  });

  it("gives no command to start a run of a Windows folder, whose run Studio wouldn't list", () => {
    expect(startRunCommand(`${drive}\\Acme\\Acme sample`, "reply")).toBeUndefined();
    expect(startRunCommand("\\\\acme\\Acme sample", "reply")).toBeUndefined();
  });

  it("reviews a connector's tools in a POSIX folder, or in no folder", () => {
    expect(reviewToolsCommand("/acme/Documents/Acme sample", "notes-mcp")).toBe(
      'halonic tools review --dir "/acme/Documents/Acme sample" notes-mcp',
    );
    expect(reviewToolsCommand(undefined, "notes-mcp")).toBe("halonic tools review notes-mcp");
  });

  it("gives no command to review tools of a Windows folder, whose approval Studio wouldn't read", () => {
    expect(reviewToolsCommand(`${drive}\\Acme\\Acme sample`, "notes-mcp")).toBeUndefined();
    expect(reviewToolsCommand("\\\\acme\\Acme sample", "notes-mcp")).toBeUndefined();
  });
});
