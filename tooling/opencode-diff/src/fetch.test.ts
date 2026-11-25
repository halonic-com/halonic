import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchVersion, type RunProgram } from "./fetch.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "opencode-diff-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const tarballBytes = "made-up tarball";

/** Stands in for npm and tar: `npm pack` writes a tarball, `tar` writes the package's files. */
function fakePrograms(calls: string[]): RunProgram {
  return async (program, args, cwd) => {
    calls.push(`${program} ${args.join(" ")}`);
    if (program === "npm") {
      await writeFile(join(cwd, "package.tgz"), tarballBytes);
      return "package.tgz\n";
    }
    if (cwd.endsWith("program")) {
      await mkdir(join(cwd, "package", "bin"), { recursive: true });
      await writeFile(join(cwd, "package", "bin", "opencode"), "\u0000OPENCODE_DB\u0000");
    } else {
      await mkdir(join(cwd, "package", "dist"), { recursive: true });
      await writeFile(join(cwd, "package", "dist", "config.js"), "({\n    update: x,\n})");
    }
    return "";
  };
}

verifies("tooling-opencode-diff.diff", () => {
  describe("fetchVersion", () => {
    it("packs both packages at the version, unpacks them and reads them", async () => {
      const calls: string[] = [];

      const facts = await fetchVersion("2.3.0", folder, fakePrograms(calls));

      expect(calls).toEqual([
        "npm pack @opencode/cli-linux-x64@2.3.0 --silent",
        "tar -xzf package.tgz",
        "npm pack @opencode/schema@2.3.0 --silent",
        "tar -xzf package.tgz",
      ]);
      const digest = createHash("sha512").update(tarballBytes).digest("base64");
      expect(facts).toEqual({
        version: "2.3.0",
        integrity: `sha512-${digest}`,
        envNames: ["OPENCODE_DB"],
        schemaKeys: ["config.js: update"],
      });
    });

    it("stops when npm pack names no file", async () => {
      const silent: RunProgram = async () => "";
      await expect(fetchVersion("2.3.0", folder, silent)).rejects.toThrow(
        "npm pack @opencode/cli-linux-x64@2.3.0 named no file.",
      );
    });
  });
});
