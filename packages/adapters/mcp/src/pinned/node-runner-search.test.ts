import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { windowsPath } from "./fake-runners.spec.ts";
import { createRunnerSearch } from "./node-runner-search.ts";

verifies("mcp.runner-lookup", () => {
  describe("the app's environment on Windows", () => {
    it("reads PATH, PATHEXT and the user's folders in any letter case", () => {
      const nodejs = windowsPath("C", "Program Files", "nodejs");
      const search = createRunnerSearch(
        {
          Path: nodejs,
          pathext: ".EXE;.CMD",
          UserProfile: windowsPath("D", "acme"),
          PROGRAMFILES: windowsPath("C", "Program Files"),
          AppData: windowsPath("D", "acme", "AppData", "Roaming"),
          localappdata: windowsPath("D", "acme", "AppData", "Local"),
          HOME: windowsPath("E", "not-the-home"),
        },
        "win32",
      );
      expect(search).toMatchObject({
        platform: "win32",
        path: nodejs,
        pathExt: ".EXE;.CMD",
        home: windowsPath("D", "acme"),
        programFiles: windowsPath("C", "Program Files"),
        appData: windowsPath("D", "acme", "AppData", "Roaming"),
        localAppData: windowsPath("D", "acme", "AppData", "Local"),
      });
    });

    it("has an empty PATH and no home folder when the environment sets neither", () => {
      const search = createRunnerSearch({}, "win32");
      expect(search.path).toBe("");
      expect(search.home).toBeUndefined();
      expect(search.pathExt).toBeUndefined();
    });
  });

  describe("the app's environment on macOS and Linux", () => {
    it("reads variables by their exact name, with HOME as the home folder", () => {
      const search = createRunnerSearch(
        { PATH: "/usr/bin:/acme/bin", Path: "/not/this", HOME: "/acme/home" },
        "linux",
      );
      expect(search.path).toBe("/usr/bin:/acme/bin");
      expect(search.home).toBe("/acme/home");
      expect(search.pathExt).toBeUndefined();
    });

    it("has an empty PATH when the environment sets none", () => {
      expect(createRunnerSearch({ Path: "/acme/bin" }, "linux").path).toBe("");
    });
  });

  describe("telling programs and files apart", () => {
    let folder = "";
    let program = "";
    let plainFile = "";
    let subfolder = "";

    beforeAll(async () => {
      folder = await mkdtemp(join(tmpdir(), "halonic-runner-search-"));
      program = join(folder, "npx");
      plainFile = join(folder, "npx-cli.js");
      subfolder = join(folder, "node");
      await writeFile(program, "");
      await chmod(program, 0o755);
      await writeFile(plainFile, "");
      await chmod(plainFile, 0o644);
      await mkdir(subfolder);
    });

    afterAll(async () => {
      await rm(folder, { recursive: true, force: true });
    });

    it("takes a file it may run as a program on macOS and Linux, and any file as a file", async () => {
      const search = createRunnerSearch({}, "linux");
      expect(await search.isProgram(program)).toBe(true);
      expect(await search.isFile(program)).toBe(true);
      expect(await search.isFile(plainFile)).toBe(true);
    });

    it.skipIf(process.platform === "win32")(
      "doesn't take a file it may not run as a program on macOS and Linux",
      async () => {
        expect(await createRunnerSearch({}, "linux").isProgram(plainFile)).toBe(false);
      },
    );

    it("takes any existing file as a program on Windows, where no file has a run permission", async () => {
      expect(await createRunnerSearch({}, "win32").isProgram(plainFile)).toBe(true);
    });

    it("takes neither a folder nor a missing path as a program or a file", async () => {
      const search = createRunnerSearch({}, "linux");
      expect(await search.isProgram(subfolder)).toBe(false);
      expect(await search.isFile(subfolder)).toBe(false);
      expect(await search.isFile(join(folder, "missing"))).toBe(false);
      expect(await search.isProgram(join(folder, "missing"))).toBe(false);
    });
  });
});
