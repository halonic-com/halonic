import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";

const sources = fileURLToPath(new URL("..", import.meta.url));
const copies: string[] = [];

afterAll(() => {
  for (const copy of copies) {
    rmSync(copy, { recursive: true, force: true });
  }
});

describe("guard-notes entry point", () => {
  // guard-notes.yml runs it from the base branch with no `pnpm install`
  // (HAL-5613): a static import of an npm package fails the queue run.
  test("loads without node_modules", () => {
    const folder = mkdtempSync(join(tmpdir(), "guard-notes-"));
    copies.push(folder);
    cpSync(sources, join(folder, "src"), { recursive: true });
    writeFileSync(join(folder, "package.json"), '{ "type": "module" }\n');
    const result = spawnSync(process.execPath, [join(folder, "src", "cli", "guard-notes.ts")], {
      cwd: folder,
      encoding: "utf8",
    });
    expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(result.stderr).toContain("Usage: node tooling/check/src/cli/guard-notes.ts");
    expect(result.status).toBe(2);
  });
});
