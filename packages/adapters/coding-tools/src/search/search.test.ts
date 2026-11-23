import { access, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { maxAnswerCharacters } from "../answer-cap.ts";
import { numberedLines, removeTestFolders, testFolders } from "../folders.test-helper.ts";
import { ToolRefusal } from "../tool-input.ts";
import { searchTool } from "./search.ts";

afterEach(removeTestFolders);

/** A `search` tool over fresh folders, and a way to call it. */
async function searchFolders() {
  const folders = await testFolders();
  const tool = searchTool(folders);
  const search = (args: Record<string, unknown>) => tool.run(args, new AbortController().signal);
  return { folders, search };
}

async function refusal(promise: Promise<string>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ToolRefusal) return error.message;
    throw error;
  }
  throw new Error("The call was answered.");
}

verifies("coding-tools.search", () => {
  describe("matching", () => {
    it("gives each match with its line number and the lines around it", async () => {
      const { folders, search } = await searchFolders();
      await folders.write("src/a.ts", "one\ntwo\nneedle here\nfour\nfive\n");
      await folders.write("src/b.ts", "no match\n");
      const answer = await search({ pattern: "needle" });
      expect(answer).toBe(
        "src/a.ts\n1-one\n2-two\n3:needle here\n4-four\n5-five\n\n1 matches in 1 files",
      );
    });

    it("joins close matches and marks a gap with --", async () => {
      const { folders, search } = await searchFolders();
      await folders.write("a.txt", `hit\n${numberedLines(3)}\nhit\n${numberedLines(10)}\nhit\n`);
      const answer = await search({ pattern: "hit", context: 1 });
      expect(answer).toContain(
        "1:hit\n2-line 1\n--\n4-line 3\n5:hit\n6-line 1\n--\n15-line 10\n16:hit",
      );
    });

    it("searches a regular expression, ignoring case when asked", async () => {
      const { folders, search } = await searchFolders();
      await folders.write("a.ts", "export function Alpha() {}\nconst beta = 1;\n");
      const answer = await search({
        pattern: "function\\s+alpha",
        regex: true,
        ignoreCase: true,
        context: 0,
      });
      expect(answer).toContain("1:export function Alpha() {}");
      expect(await search({ pattern: "ALPHA", context: 0 })).toBe("(no matches)");
    });

    it("searches only a path or the files a glob matches", async () => {
      const { folders, search } = await searchFolders();
      await folders.write("src/a.ts", "needle\n");
      await folders.write("src/a.md", "needle\n");
      await folders.write("docs/b.ts", "needle\n");
      expect(await search({ pattern: "needle", glob: "*.ts", context: 0 })).toContain(
        "2 matches in 2 files",
      );
      expect(await search({ pattern: "needle", path: "src", glob: "*.md", context: 0 })).toContain(
        "src/a.md",
      );
      expect(await search({ pattern: "needle", path: "docs/b.ts", context: 0 })).toBe(
        "docs/b.ts\n1:needle\n\n1 matches in 1 files",
      );
    });
  });

  describe("what it leaves out", () => {
    it("honours the .gitignore files and .git/info/exclude", async () => {
      const { folders, search } = await searchFolders();
      await folders.write(".gitignore", "dist/\n*.log\n");
      await folders.write("packages/a/.gitignore", "generated.ts\n");
      await folders.write(".git/info/exclude", "scratch.txt\n");
      for (const path of [
        "dist/app.js",
        "today.log",
        "packages/a/generated.ts",
        "scratch.txt",
        "node_modules/x/i.js",
      ]) {
        await folders.write(path, "needle\n");
      }
      await folders.write("packages/a/kept.ts", "needle\n");
      expect(await search({ pattern: "needle", context: 0 })).toBe(
        "packages/a/kept.ts\n1:needle\n\n1 matches in 1 files",
      );
      expect(await search({ pattern: "needle", path: "packages/a", context: 0 })).toContain(
        "1 matches in 1 files",
      );
    });

    it("leaves out binary files, files over 2 MB and links", async () => {
      const { folders, search } = await searchFolders();
      await folders.write("bin.dat", new Uint8Array([110, 101, 101, 100, 108, 101, 0]));
      await folders.write("big.txt", `needle\n${"x".repeat(2 * 1024 * 1024)}`);
      await writeFile(join(folders.outside, "secret.txt"), "needle\n");
      await symlink(folders.outside, join(folders.workingFolder, "door"), "junction");
      expect(await search({ pattern: "needle" })).toBe("(no matches)");
    });

    it("never starts git, so a repo's core.fsmonitor can't run code", async () => {
      const { folders, search } = await searchFolders();
      const marker = join(folders.outside, "fsmonitor-ran");
      const hook = await folders.write("hook.sh", `#!/bin/sh\necho ran > '${marker}'\n`);
      await folders.write(".git/config", `[core]\n\tfsmonitor = ${hook}\n`);
      await folders.write(".git/HEAD", "ref: refs/heads/main\n");
      await folders.write("a.txt", "needle\n");
      expect(await search({ pattern: "needle", context: 0 })).toContain("a.txt\n1:needle");
      await expect(access(marker)).rejects.toThrow();
    });
  });

  it("reads a pattern naming a skill's scripts/ file only as text, and runs nothing", async () => {
    const { folders, search } = await searchFolders();
    const marker = join(folders.outside, "script-ran");
    await folders.write(
      "skills/acme/scripts/run.js",
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`,
    );
    const answer = await search({
      pattern: "skills/acme/scripts/run\\.js|writeFileSync",
      regex: true,
      context: 0,
    });
    expect(answer).toContain("skills/acme/scripts/run.js\n1:require");
    await expect(access(marker)).rejects.toThrow();
  });

  describe("limits", () => {
    it("gives 30 matches per file and says there are more", async () => {
      const { folders, search } = await searchFolders();
      await folders.write("a.txt", `${Array.from({ length: 40 }, () => "hit").join("\n")}\n`);
      const answer = await search({ pattern: "hit", context: 0 });
      expect(answer).toContain("30:hit\n… more matches in this file");
      expect(answer).not.toContain("31:hit");
    });

    it("stops at 200 matches and keeps the answer within its size", async () => {
      const { folders, search } = await searchFolders();
      for (let file = 0; file < 10; file += 1) {
        await folders.write(
          `f${file}.txt`,
          `${Array.from({ length: 30 }, () => `hit ${"z".repeat(400)}`).join("\n")}\n`,
        );
      }
      const answer = await search({ pattern: "hit", context: 0 });
      expect(answer.length).toBeLessThanOrEqual(maxAnswerCharacters);
      expect(answer).toMatch(/matches in \d+ files; the answer is full/);
      expect(answer).toContain(`hit ${"z".repeat(296)} … [line cut]`);
    });

    it("stops a regular expression that runs too long, and refuses it", async () => {
      const { folders, search } = await searchFolders();
      await folders.write("a.txt", `${"a".repeat(64)}!\n`);
      const started = Date.now();
      const message = await refusal(search({ pattern: "(a+)+$", regex: true }));
      expect(message).toContain("took too long");
      expect(Date.now() - started).toBeLessThan(10_000);
    });
  });

  describe("arguments", () => {
    it.each([
      ["a regular expression that isn't valid", { pattern: "(", regex: true }],
      ["a glob that matches nothing", { pattern: "x", glob: "[z-a]" }],
      ["context over 8", { pattern: "x", context: 9 }],
      ["an empty pattern", { pattern: "" }],
      ["an unknown argument", { pattern: "x", maxCount: 3 }],
      ["a path outside", { pattern: "x", path: ".." }],
    ])("refuses %s", async (_name, args) => {
      const { search } = await searchFolders();
      expect(await refusal(search(args))).not.toBe("");
    });
  });
});
