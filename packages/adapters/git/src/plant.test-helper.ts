import { access, appendFile, chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { plainGit } from "./fixtures.test-helper.ts";

/** Planted code, shaped like the contract suite's `PlantGitCode`, which only test files may import. */
export interface Plant {
  hook(name: string): Promise<void>;
  config(key: string, value?: string): Promise<void>;
  attributes(line: string): Promise<void>;
  localRemote(): Promise<void>;
  ran(): Promise<boolean>;
}

/**
 * Plants code in the repository at `folder` the way an attacker who can
 * write the folder would. Every planted program is one script in `outside`
 * that creates the file `ran` there, so `ran()` sees whether any ran. A
 * local remote gets `hooks`, the hooks the contract suite plants, and the
 * ones a push runs on the remote's side.
 */
export function plantIn(folder: string, outside: string, hooks: readonly string[]): Plant {
  const program = join(outside, "planted");
  const mark = join(outside, "ran");
  const ready = (async () => {
    await writeFile(program, `#!/bin/sh\ntouch '${mark}'\n`);
    await chmod(program, 0o755);
  })();

  const writeHook = async (hooksFolder: string, name: string): Promise<void> => {
    await mkdir(hooksFolder, { recursive: true });
    await writeFile(join(hooksFolder, name), `#!/bin/sh\nexec '${program}'\n`);
    await chmod(join(hooksFolder, name), 0o755);
  };
  const setConfig = async (key: string, value: string): Promise<void> => {
    await plainGit(folder, ["config", "--local", "--replace-all", key, value]);
  };

  return {
    async hook(name) {
      await ready;
      await writeHook(join(folder, ".git", "hooks"), name);
      await writeHook(join(folder, ".git", "planted-hooks"), name);
      await setConfig("core.hooksPath", join(folder, ".git", "planted-hooks"));
    },
    async config(key, value) {
      await ready;
      await setConfig(key, value ?? plantedValue(key, program));
    },
    async attributes(line) {
      await mkdir(join(folder, ".git", "info"), { recursive: true });
      await appendFile(join(folder, ".git", "info", "attributes"), `${line}\n`);
    },
    async localRemote() {
      await ready;
      const remote = join(folder, "planted.git");
      await plainGit(folder, ["init", "--quiet", "--bare", "--template=", remote]);
      for (const hook of hooks) await writeHook(join(remote, "hooks"), hook);
      for (const hook of ["pre-receive", "update", "post-receive", "post-update"]) {
        await writeHook(join(remote, "hooks"), hook);
      }
      await plainGit(folder, ["remote", "set-url", "origin", remote]);
    },
    async ran() {
      try {
        await access(mark);
        return true;
      } catch {
        // No mark: nothing planted has run.
        return false;
      }
    },
  };
}

/** The program in the form git takes for `key`. */
function plantedValue(key: string, program: string): string {
  const lower = key.toLowerCase();
  if (lower === "core.fsmonitor") return program;
  if (lower === "credential.helper") return `!${program}`;
  if (/^remote\..+\.url$/u.test(lower)) return `ext::${program}`;
  return program;
}
