import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLoginShellPath } from "./login-shell-path.ts";
import { createRunnerSearch } from "./node-runner-search.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "adapter-mcp-shell-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/**
 * A stand-in login shell: it checks it was asked as `-l -c`, leaves a
 * file to show it ran, prints noise around the script's output as a
 * profile might, and runs the script with its own `PATH`.
 */
async function fakeShell(at: string, body = 'eval "$3"'): Promise<string> {
  const script = [
    "#!/bin/sh",
    '[ "$1" = "-l" ] && [ "$2" = "-c" ] || exit 3',
    `touch "${folder}/ran"`,
    'echo "profile says hello"',
    "PATH=/acme/login/bin:/usr/bin",
    body,
    'echo "and goodbye"',
  ].join("\n");
  await mkdir(join(at, ".."), { recursive: true });
  await writeFile(at, `${script}\n`);
  await chmod(at, 0o755);
  return at;
}

// These start a POSIX shell script; a login shell's PATH is only read on macOS.
describe.skipIf(process.platform === "win32")("a login shell's PATH", () => {
  verifies("mcp.login-shell-path", () => {
    it("reads only the PATH the login shell prints, around whatever its profile prints", async () => {
      const shell = await fakeShell(join(folder, "bin", "zsh"));
      expect(await readLoginShellPath({ SHELL: shell, HOME: folder })).toBe(
        "/acme/login/bin:/usr/bin",
      );
    });

    it("gives no PATH for a shell that fails", async () => {
      const failing = await fakeShell(join(folder, "bin", "zsh"), "exit 1");
      expect(await readLoginShellPath({ SHELL: failing, HOME: folder })).toBeUndefined();
    });

    it("starts nothing for a relative SHELL, or a HOME that is missing or relative", async () => {
      const shell = await fakeShell(join(folder, "bin", "zsh"));
      expect(await readLoginShellPath({ SHELL: "bin/zsh", HOME: folder })).toBeUndefined();
      expect(await readLoginShellPath({ SHELL: shell })).toBeUndefined();
      expect(await readLoginShellPath({ SHELL: shell, HOME: "acme-home" })).toBeUndefined();
      expect(existsSync(join(folder, "ran"))).toBe(false);
    });

    it("never runs a shell under a skill's scripts/ folder", async () => {
      const shell = await fakeShell(join(folder, "skills", "acme", "scripts", "zsh"));
      expect(await readLoginShellPath({ SHELL: shell, HOME: folder })).toBeUndefined();
      expect(existsSync(join(folder, "ran"))).toBe(false);
    });

    it("never runs a shell whose link leads into a skill's scripts/ folder", async () => {
      await fakeShell(join(folder, "skills", "acme", "scripts", "zsh"));
      await symlink(join(folder, "skills", "acme", "scripts"), join(folder, "innocent"));
      const linked = join(folder, "innocent", "zsh");
      expect(await readLoginShellPath({ SHELL: linked, HOME: folder })).toBeUndefined();
      expect(existsSync(join(folder, "ran"))).toBe(false);
    });
  });

  verifies("mcp.runner-lookup", () => {
    it("finds a real runner file, asks the login shell once, and doesn't take a folder for a program", async () => {
      const bin = join(folder, "login-bin");
      await mkdir(join(bin, "node"), { recursive: true });
      await writeFile(join(bin, "npx"), "#!/bin/sh\n");
      await chmod(join(bin, "npx"), 0o755);
      await writeFile(join(bin, "plain.txt"), "not a program");
      const shell = await fakeShell(join(folder, "bin", "zsh"), `PATH=${bin}; eval "$3"`);
      const search = createRunnerSearch({ SHELL: shell, HOME: folder, PATH: "/usr/bin" }, "darwin");
      expect(await search.loginShellPath()).toBe(bin);
      await rm(join(folder, "ran"));
      expect(await search.loginShellPath()).toBe(bin);
      expect(existsSync(join(folder, "ran"))).toBe(false);
      expect(await search.isProgram(join(bin, "npx"))).toBe(true);
      expect(await search.isProgram(join(bin, "plain.txt"))).toBe(false);
      expect(await search.isProgram(join(bin, "node"))).toBe(false);
      expect(await search.isFile(join(bin, "plain.txt"))).toBe(true);
    });
  });
});

verifies("mcp.runner-lookup", () => {
  it("reads Windows variables in any letter case, and the home folder from USERPROFILE", () => {
    // Made-up folders; only their letter case and which variable they come from matter.
    const search = createRunnerSearch(
      {
        Path: "Windows",
        PathExt: ".EXE",
        UserProfile: "acme-profile",
        HOME: "acme-home",
        PROGRAMFILES: "acme-programs",
        AppData: "acme-roaming",
        LocalAppData: "acme-local",
      },
      "win32",
    );
    expect(search).toMatchObject({
      path: "Windows",
      pathExt: ".EXE",
      home: "acme-profile",
      programFiles: "acme-programs",
      appData: "acme-roaming",
      localAppData: "acme-local",
    });
  });
});
