import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type ProgramStart, pathsNamedBy } from "./program-start.ts";

const start = (
  program: string,
  args: string[] = [],
  env: Record<string, string> = {},
): ProgramStart => ({ cwd: ".", program, args, env });

/** The paths a start names, without where they come from. */
function pathsOf(named: ProgramStart): string[] {
  return pathsNamedBy(named).map(({ path }) => path);
}

verifies("format.program-start-paths", () => {
  describe("pathsNamedBy", () => {
    it("lists the program first, and not the start folder", () => {
      expect(pathsNamedBy({ cwd: "tools", program: "node", args: [] })).toEqual([
        { path: "node", shown: "node" },
      ]);
    });

    it("keeps the argument a value comes from, for messages", () => {
      expect(pathsNamedBy(start("node", ["--config=tools/mail.json"]))).toEqual([
        { path: "node", shown: "node" },
        { path: "--config=tools/mail.json", shown: "--config=tools/mail.json" },
        { path: "--config", shown: "--config=tools/mail.json" },
        { path: "tools/mail.json", shown: "--config=tools/mail.json" },
      ]);
    });

    it.each([
      ["after an =", "--file=tools/x.js", "tools/x.js"],
      ["after a second =", "--define=KEY=tools/x.js", "tools/x.js"],
      ["after a :", "file:tools/x.js", "tools/x.js"],
      ["after an @", "@tools/args.txt", "tools/args.txt"],
      ["between spaces", "--require tools/x.js", "tools/x.js"],
      ["behind a short flag", "-ctools/x.js", "tools/x.js"],
      ["behind a short flag after a split", "--opt=-ctools/x.js", "tools/x.js"],
    ])("reads a path %s", (_, arg, path) => {
      expect(pathsOf(start("node", [arg]))).toContain(path);
    });

    it.each([
      ["an =", "--file=my tools/x.js", "my tools/x.js"],
      ["a second =", "--define=KEY=a:b", "a:b"],
      ["a :", "file:a@b", "a@b"],
      ["an @", "@a=b", "a=b"],
    ])("keeps the whole text after %s, separators and all", (_, arg, path) => {
      expect(pathsOf(start("node", [arg]))).toContain(path);
    });

    it("keeps the whole argument too", () => {
      expect(pathsOf(start("node", ["tools/x.js"]))).toEqual(["node", "tools/x.js"]);
    });

    it("lists each path once per argument", () => {
      expect(pathsOf(start("node", ["a=a"]))).toEqual(["node", "a=a", "a"]);
    });

    it("leaves a long flag whole", () => {
      expect(pathsOf(start("node", ["--verbose"]))).toEqual(["node", "--verbose"]);
    });

    it.each([
      ["after -m", ["-m", "tools.mail"]],
      ["written with -m", ["-mtools.mail"]],
      ["after -m among short flags", ["-Im", "tools.mail"]],
      ["written with -m among short flags", ["-Imtools.mail"]],
      ["after -m among short flags with an -O", ["-OIm", "tools.mail"]],
      ["written with -m after a group of short flags ending in m", ["-Wm", "-mtools.mail"]],
    ])("reads the folder path of a module %s", (_, args) => {
      expect(pathsOf(start("python", args))).toContain("tools/mail");
    });

    it("reads no module from a lone -m", () => {
      expect(pathsOf(start("python", ["-m"]))).toEqual(["python", "-m"]);
    });

    it("reads no module after short flags without an m, or after a long flag", () => {
      expect(pathsOf(start("python", ["-I", "tools.mail"]))).not.toContain("tools/mail");
      expect(pathsOf(start("python", ["--mode", "tools.mail"]))).not.toContain("tools/mail");
    });

    it.each([
      ["in double quotes", '--require "tools/x.js"', "tools/x.js"],
      ["in single quotes", "--require 'tools/x.js'", "tools/x.js"],
      ["in quotes after an =", '--file="tools/x.js"', "tools/x.js"],
      ["in quotes with a space", '--require "my tools/x.js"', "my tools/x.js"],
      ["in quotes behind a short flag", '-c"tools/x.js"', "tools/x.js"],
      ["in double quotes after a stray apostrophe", `it's --require "my x.js" '`, "my x.js"],
    ])("reads a path %s without its quotes (HAL-4903)", (_, arg, path) => {
      expect(pathsOf(start("node", [arg]))).toContain(path);
    });

    it("reads the paths in env values, shown with their names", () => {
      const named = pathsNamedBy(start("node", [], { NODE_PATH: "tools/lib:/usr/lib" }));
      expect(named).toContainEqual({ path: "tools/lib", shown: "NODE_PATH=tools/lib:/usr/lib" });
      expect(named).toContainEqual({ path: "/usr/lib", shown: "NODE_PATH=tools/lib:/usr/lib" });
    });

    it("keeps the drive letter of a Windows path list", () => {
      const list = "C:\\py;D:\\more"; // leak-guard: allow absolute-path made-up Windows path list
      const paths = ["C:\\py", "D:\\more"]; // leak-guard: allow absolute-path made-up Windows paths
      expect(pathsOf(start("node", [], { PYTHONPATH: list }))).toEqual(
        expect.arrayContaining(paths),
      );
    });

    it("reads no env names", () => {
      expect(pathsOf(start("node", [], { "tools/x.js": "1" }))).toEqual(["node", "1"]);
    });

    it("reads a scoped package name as a path too", () => {
      expect(pathsOf(start("npx", ["@acme/mail-mcp"]))).toContain("acme/mail-mcp");
    });

    it("reads a start without env", () => {
      expect(pathsOf({ cwd: ".", program: "node", args: ["x.js"] })).toEqual(["node", "x.js"]);
    });
  });
});
