import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { windowsCommandLine } from "./command-line.ts";

// Made-up Windows paths, each marked for the leak guard on its own line.
const acmeDir = "C:\\acme dir\\"; // leak-guard: allow absolute-path made-up Windows path for a test
const quotedAcmeDir = '"C:\\acme dir\\\\"'; // leak-guard: allow absolute-path made-up Windows path for a test
const gitExe = "C:\\Program Files\\git\\git.exe"; // leak-guard: allow absolute-path made-up Windows path for a test
const quotedGitExe = '"C:\\Program Files\\git\\git.exe"'; // leak-guard: allow absolute-path made-up Windows path for a test
const nodeExe = "C:\\Program Files\\nodejs\\NODE.EXE"; // leak-guard: allow absolute-path made-up Windows path for a test
const setupBat = "C:\\acme\\setup.BAT "; // leak-guard: allow absolute-path made-up Windows path for a test

verifies("sandbox-mxc.box-request", () => {
  describe("windowsCommandLine", () => {
    it("joins plain words with spaces", () => {
      expect(windowsCommandLine("git", ["status", "--short"])).toBe("git status --short");
    });

    it.each([
      ["a space", "my file.txt", '"my file.txt"'],
      ["an empty argument", "", '""'],
      ["a quote", 'say "hi"', '"say \\"hi\\""'],
      ["a trailing backslash in a quoted argument", acmeDir, quotedAcmeDir],
      ["backslashes before a quote", 'a\\\\"b', '"a\\\\\\\\\\"b"'],
      ["a backslash that is not before a quote", "a\\b c", '"a\\b c"'],
    ])("quotes %s so Windows reads it back as given", (_what, argument, quoted) => {
      expect(windowsCommandLine("tool", [argument])).toBe(`tool ${quoted}`);
    });

    it("quotes a program with a space in its path", () => {
      expect(windowsCommandLine(gitExe, ["log"])).toBe(`${quotedGitExe} log`);
    });

    it.each(["node", "node.exe", nodeExe])(
      "gives %s the two symlink flags before its arguments",
      (program) => {
        const line = windowsCommandLine(program, ["build.js", "--fast"]);
        expect(line).toMatch(/ --preserve-symlinks --preserve-symlinks-main build\.js --fast$/);
      },
    );

    it("gives no other program the flags", () => {
      expect(windowsCommandLine("nodemon", ["app.js"])).toBe("nodemon app.js");
      expect(windowsCommandLine("git", [])).toBe("git");
    });

    it.each(["", "  ", "build.cmd", setupBat, "x.bat.", "x.cmd. .", "x.CMD  "])(
      "refuses the program %j",
      (program) => {
        expect(() => windowsCommandLine(program, [])).toThrow();
      },
    );

    it("refuses a NUL character anywhere", () => {
      expect(() => windowsCommandLine("git", ["a\0b"])).toThrow("NUL");
    });
  });
});
