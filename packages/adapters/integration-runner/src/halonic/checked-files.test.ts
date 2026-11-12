import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type CheckedFile, checkedFilesProblems } from "./checked-files.ts";

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A real folder of files by path, and the hashes a trust check would have listed. */
function folderOf(files: Record<string, string>): { folder: string; checked: CheckedFile[] } {
  const folder = mkdtempSync(join(tmpdir(), "checked-files-"));
  folders.push(folder);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(folder, path, ".."), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  const checked = Object.entries(files).map(([path, text]) => ({
    path,
    sha256: createHash("sha256").update(text).digest("hex"),
  }));
  return { folder, checked };
}

verifies("integration-runner.plugin-backend", () => {
  describe("checkedFilesProblems, on a real folder", () => {
    it("finds nothing in a folder that is exactly what was checked", () => {
      const { folder, checked } = folderOf({ "plugin.yaml": "id: a", "backend/index.js": "run()" });
      expect(checkedFilesProblems(folder, checked)).toEqual([]);
    });

    it("names a file that changed, was added or is missing, and no contents", () => {
      const { folder, checked } = folderOf({ "plugin.yaml": "id: a", "backend/index.js": "run()" });
      writeFileSync(join(folder, "backend/index.js"), "steal()");
      writeFileSync(join(folder, "extra.js"), "more()");
      rmSync(join(folder, "plugin.yaml"));
      expect(checkedFilesProblems(folder, checked).sort()).toEqual([
        "backend/index.js changed",
        "extra.js was added",
        "plugin.yaml is missing",
      ]);
    });

    it("refuses a link added after the check, and a link in place of a checked file", () => {
      const { folder, checked } = folderOf({ "plugin.yaml": "id: a", "backend/index.js": "run()" });
      symlinkSync(join(folder, "plugin.yaml"), join(folder, "alias.js"));
      symlinkSync(tmpdir(), join(folder, "dir-link"));
      rmSync(join(folder, "backend/index.js"));
      symlinkSync(join(folder, "plugin.yaml"), join(folder, "backend/index.js"));
      expect(checkedFilesProblems(folder, checked).sort()).toEqual([
        "alias.js was added",
        "backend/index.js can't be read",
        "dir-link was added",
      ]);
    });

    it("finds a folder it can't list", () => {
      expect(checkedFilesProblems(join(tmpdir(), "no-such-checked-folder"), [])).toEqual([
        "the folder can't be listed",
      ]);
    });
  });
});
