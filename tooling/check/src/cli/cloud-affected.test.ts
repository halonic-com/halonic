import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { cloudPathsChangedSince } from "./cloud-affected.ts";

verifies("check.cloud-affected", () => {
  describe("cloudPathsChangedSince", () => {
    let directory: string | undefined;
    afterEach(() => {
      if (directory !== undefined) {
        rmSync(directory, { recursive: true, force: true });
      }
    });

    function repo(): { root: string; git: (...args: string[]) => string } {
      const root = mkdtempSync(join(tmpdir(), "cloud-affected-"));
      directory = root;
      const git = (...args: string[]): string =>
        execFileSync(
          "git",
          [
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.com",
            "-c",
            "commit.gpgsign=false",
            ...args,
          ],
          { cwd: root, encoding: "utf8" },
        );
      git("init", "-q", "-b", "main");
      mkdirSync(join(root, "packages/host/server/src"), { recursive: true });
      writeFileSync(
        join(root, "packages/host/server/src/handler.ts"),
        "export const handler = 1;\n",
      );
      git("add", "-A");
      git("commit", "-q", "-m", "base");
      return { root, git };
    }

    it("lists a file moved out of a cloud path by its old path", () => {
      const { root, git } = repo();
      git("switch", "-q", "-c", "pr");
      mkdirSync(join(root, "docs"));
      git("mv", "packages/host/server/src/handler.ts", "docs/handler.ts");
      git("commit", "-q", "-m", "move");
      expect(cloudPathsChangedSince(root, "main")).toEqual(["packages/host/server/src/handler.ts"]);
    });

    it("answers no for a change outside the cloud paths", () => {
      const { root, git } = repo();
      git("switch", "-q", "-c", "pr");
      writeFileSync(join(root, "README.md"), "x\n");
      git("add", "-A");
      git("commit", "-q", "-m", "docs");
      expect(cloudPathsChangedSince(root, "main")).toEqual([]);
    });
  });
});
