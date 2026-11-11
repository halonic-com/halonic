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

/** A copy of `src/` in a folder with no `node_modules`, as the guard-notes job has it. */
function copyWithoutInstall(): string {
  const folder = mkdtempSync(join(tmpdir(), "guard-notes-"));
  copies.push(folder);
  cpSync(sources, join(folder, "src"), { recursive: true });
  writeFileSync(join(folder, "package.json"), '{ "type": "module" }\n');
  return folder;
}

// guard-notes.yml runs the entry point from the base branch with no
// `pnpm install` (HAL-5613): nothing it reaches may load an npm package.
describe("guard-notes entry point", () => {
  test("loads without node_modules", () => {
    const folder = copyWithoutInstall();
    const result = spawnSync(process.execPath, [join(folder, "src", "cli", "guard-notes.ts")], {
      cwd: folder,
      encoding: "utf8",
    });
    expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(result.stderr).toContain("Usage: node tooling/check/src/cli/guard-notes.ts");
    expect(result.status).toBe(2);
  });

  test("finds the tests covering a requirement ID without node_modules", () => {
    const folder = copyWithoutInstall();
    const script = `
      import { coveredPaths } from "./src/guard/signatures.ts";
      const files = { "a/x.test.ts": 'verifies("a.b", () => {})', "a/y.test.ts": "other" };
      const git = {
        objectId: () => undefined,
        listFiles: () => Object.keys(files),
        readFile: (_commit, path) => files[path],
      };
      console.log(JSON.stringify(coveredPaths(["a.b"], git, "head", "base")));
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: folder,
      encoding: "utf8",
    });
    expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(JSON.parse(result.stdout)).toEqual(["requirement:a.b", "a/x.test.ts"]);
  });
});
