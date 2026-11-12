import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeFolder } from "./remove-folder.ts";

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "halonic-remove-folder-test-"));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("removeFolder", () => {
  it("removes a folder with its files and folders", async () => {
    const folder = join(base, "made");
    await mkdir(join(folder, "inner"), { recursive: true });
    await writeFile(join(folder, "inner", "file.txt"), "x");

    await removeFolder(folder);

    expect(existsSync(folder)).toBe(false);
  });

  it("does nothing for a folder that is already gone", async () => {
    await expect(removeFolder(join(base, "missing"))).resolves.toBeUndefined();
  });
});
