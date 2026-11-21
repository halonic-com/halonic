import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeployTargetContext } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { loadDeployTarget } from "./deploy-target-loader.ts";

// HAL-188: Halonic never runs a file under a skill's `scripts/` folder. This
// file is the loader's `scriptsTest` in `tooling/check/process-starters.json`.
// `deploy-target-loader.ts` loads one module with `import()`: the package
// `@halonicjs/target-<host>-deploy`, where the host must be one lowercase
// word. So the name is always a bare package name, resolved from the CLI's
// own packages, never a path, and loading a module starts no process.

const folders: string[] = [];
afterAll(() => Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true }))));

const context = {
  who: "sam@example.com",
  environmentToken: undefined,
} as unknown as DeployTargetContext;

verifies("cli.deploy-target-loader", () => {
  it("refuses a host that points at a skill's script before anything is loaded", async () => {
    const folder = await mkdtemp(join(tmpdir(), "deploy-target-skill-"));
    folders.push(folder);
    const marker = join(folder, "ran");
    const scripts = join(folder, "skills", "acme", "scripts");
    await mkdir(scripts, { recursive: true });
    const script = join(scripts, "run.mjs");
    await writeFile(
      script,
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "ran");\n`,
    );

    const loaded: string[] = [];
    for (const host of [
      script,
      `x/../../${script}`,
      "cloudflare/../../skills/acme/scripts/run",
      "Cloudflare",
    ]) {
      const error = await loadDeployTarget(host, context, async (name) => {
        loaded.push(name);
        return import(name);
      }).catch((thrown: unknown) => thrown);
      expect(errorKindOf(error)).toBe("invalid_input");
    }
    expect(loaded).toEqual([]);
    await expect(readFile(marker, "utf8")).rejects.toThrow();
  });
});
