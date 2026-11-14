import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openStudioPageFolder } from "./studio-page-folder.ts";

let work: string;
let build: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), "studio-page-"));
  build = join(work, "build");
  await mkdir(join(build, "assets"), { recursive: true });
  await writeFile(join(build, "studio.html"), "<title>Halonic</title>");
  await writeFile(join(build, "assets", "a.js"), "export {};");
  await writeFile(join(work, "outside.js"), "outside");
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

const text = (bytes: Uint8Array | null) =>
  bytes === null ? null : new TextDecoder().decode(bytes);

describe("studio page folder", () => {
  verifies("runtime.studio-page-folder", () => {
    it("reads a file of the build", async () => {
      const page = openStudioPageFolder(build);
      expect(text(await page.read("studio.html"))).toBe("<title>Halonic</title>");
      expect(text(await page.read("assets/a.js"))).toBe("export {};");
    });

    it("answers null for a missing file and for a folder", async () => {
      const page = openStudioPageFolder(build);
      expect(await page.read("assets/missing.js")).toBeNull();
      expect(await page.read("assets")).toBeNull();
    });

    it("answers null for every file when the folder doesn't exist", async () => {
      expect(await openStudioPageFolder(join(work, "none")).read("studio.html")).toBeNull();
    });

    it("answers null for a link that points outside the folder", async () => {
      await symlink(join(work, "outside.js"), join(build, "assets", "link.js"));
      expect(await openStudioPageFolder(build).read("assets/link.js")).toBeNull();
    });

    it("answers null for a path that climbs out of the folder", async () => {
      expect(await openStudioPageFolder(build).read("../outside.js")).toBeNull();
    });
  });
});
