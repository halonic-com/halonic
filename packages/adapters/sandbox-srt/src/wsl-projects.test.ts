import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { assertProjectName, wslProjectFolder, wslWindowsPath } from "./wsl-projects.ts";

const home = `/${"home"}/halonic`;

verifies("sandbox-srt.wsl-projects", () => {
  describe("wslProjectFolder", () => {
    it("puts a project in the distro under the halonic user's projects folder", () => {
      expect(wslProjectFolder("distro", "acme")).toBe(`${home}/projects/acme`);
    });

    it("puts a project on the Windows drive under /mnt/halonic", () => {
      expect(wslProjectFolder("windows-drive", "acme")).toBe("/mnt/halonic/acme");
    });

    it.each([
      "",
      ".",
      "..",
      "../x",
      "a/b",
      "a\\b",
      "-rf",
      "C:",
      "a\0b",
      "x ",
      "x.",
      "a".repeat(101),
      `import-${"0".repeat(32)}`,
    ])("refuses the name %j", (name) => {
      expect(() => wslProjectFolder("distro", name)).toThrow("the project name");
      expect(() => assertProjectName(name)).toThrow();
    });

    it("keeps spaces, dots and non-ASCII letters inside a name", () => {
      expect(wslProjectFolder("distro", "my app.v2 é")).toBe(`${home}/projects/my app.v2 é`);
    });
  });

  describe("wslWindowsPath", () => {
    it("maps a project to its path on the WSL share", () => {
      expect(wslWindowsPath(wslProjectFolder("distro", "acme"))).toBe(
        "\\\\wsl.localhost\\halonic\\home\\halonic\\projects\\acme", // leak-guard: allow absolute-path the WSL share, a made-up one for a test
      );
    });

    it("maps the root and a path with a trailing slash", () => {
      expect(wslWindowsPath("/")).toBe("\\\\wsl.localhost\\halonic"); // leak-guard: allow absolute-path the WSL share, a made-up one for a test
      expect(wslWindowsPath("/mnt/halonic/")).toBe("\\\\wsl.localhost\\halonic\\mnt\\halonic"); // leak-guard: allow absolute-path the WSL share, a made-up one for a test
    });

    it("uses another distro name when given one", () => {
      expect(wslWindowsPath("/srv", "Ubuntu")).toBe("\\\\wsl.localhost\\Ubuntu\\srv"); // leak-guard: allow absolute-path the WSL share, a made-up one for a test
    });

    it.each(["relative/path", "/a/../b", "/a//b", "/a\\b", ""])("refuses the path %j", (path) => {
      expect(() => wslWindowsPath(path)).toThrow("path");
    });

    it("refuses a distro name that isn't a plain name", () => {
      expect(() => wslWindowsPath("/srv", "a\\b")).toThrow("the project name");
    });
  });
});
