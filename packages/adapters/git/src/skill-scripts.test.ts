import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import {
  plainGit,
  repositoryWith,
  Scratch,
  testAuthor,
  testRunner,
} from "./fixtures.test-helper.ts";
import type { ConfigEntry } from "./hardening.ts";

// HAL-188: Halonic never runs a file under a skill's `scripts/` folder. This
// file is the runner's `scriptsTest` in `tooling/check/process-starters.json`.
// `src/node/run-process.ts` only ever starts the absolute git the runner
// gives it, so what is left to show is that git, run hardened, doesn't
// start a skill's script either, through the ways the runner itself
// closes. Filters and diff programs are the repository checks' part.

const scratch = new Scratch();
afterAll(() => scratch.remove());

const scriptFolder = "skills/acme/scripts";

/** A repository with a skill whose script appends to a marker file outside it when run. */
async function repositoryWithSkillScript(): Promise<{
  folder: string;
  script: string;
  marker: string;
}> {
  const marker = join(await scratch.folder(), "ran");
  const folder = await repositoryWith(scratch);
  const script = join(folder, scriptFolder, "pre-commit");
  await mkdir(join(folder, scriptFolder), { recursive: true });
  await writeFile(script, `#!/bin/sh\nprintf ran >> '${marker}'\n`);
  await chmod(script, 0o755);
  return { folder, script, marker };
}

async function scriptRan(marker: string): Promise<boolean> {
  return readFile(marker, "utf8").then(
    () => true,
    () => false,
  );
}

interface Route {
  /** How the repository wires the script in. */
  readonly name: string;
  readonly plant: (folder: string, script: string) => Promise<void>;
  /** The git call that would run the script. */
  readonly args: readonly string[];
}

const commit = ["commit", "--allow-empty", "--quiet", "--message=Acme"];

const routes: readonly Route[] = [
  {
    name: "a hook in .git/hooks",
    plant: async (folder, script) => {
      const hook = join(folder, ".git", "hooks", "pre-commit");
      await mkdir(join(folder, ".git", "hooks"), { recursive: true });
      await writeFile(hook, `#!/bin/sh\nexec '${script}'\n`);
      await chmod(hook, 0o755);
    },
    args: commit,
  },
  {
    name: "core.hooksPath",
    plant: async (folder) => {
      await plainGit(folder, ["config", "core.hooksPath", scriptFolder]);
    },
    args: commit,
  },
  {
    name: "core.fsmonitor",
    plant: async (folder, script) => {
      await plainGit(folder, ["config", "core.fsmonitor", script]);
    },
    args: ["status"],
  },
  {
    name: "commit signing (gpg.program)",
    plant: async (folder, script) => {
      await plainGit(folder, ["config", "commit.gpgSign", "true"]);
      await plainGit(folder, ["config", "gpg.program", script]);
    },
    args: commit,
  },
];

const identity: readonly ConfigEntry[] = [
  ["user.name", testAuthor.name],
  ["user.email", testAuthor.email],
];

verifies("git.hardened", () => {
  describe.skipIf(process.platform === "win32")("a skill's scripts/ folder", () => {
    for (const route of routes) {
      it(`never runs a skill's script through ${route.name}`, async () => {
        const planted = await repositoryWithSkillScript();
        await route.plant(planted.folder, planted.script);

        // Plain git runs it, so the hardened run below could fail.
        await plainGit(planted.folder, route.args).catch(() => undefined);
        expect(await scriptRan(planted.marker)).toBe(true);
        await rm(planted.marker);

        const runner = await testRunner(scratch);
        await runner.run({ cwd: planted.folder, args: route.args, config: identity });
        expect(await scriptRan(planted.marker)).toBe(false);
      });
    }
  });
});
