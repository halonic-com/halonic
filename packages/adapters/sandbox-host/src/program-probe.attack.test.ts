import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProgramProbeResult } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createProgramProbe } from "./program-probe.ts";

const onWindows = process.platform === "win32";
const skipOnWindows = "[platform:win32] needs /bin/sh scripts: ";

// Hostile inputs for the Node ProgramProbe (HAL-2650): odd names and PATH
// lists, secrets in the launcher's environment, and programs that misbehave.
// Every answer must be `missing`, `failed` or `ran`; `ask` never throws.

let dir = "";
let bin = "";

async function script(name: string, body: string): Promise<void> {
  const path = join(bin, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
}

function probe(path: string, extra: Record<string, string> = {}, timeoutMs = 2_000) {
  return createProgramProbe({ env: { PATH: path, ...extra }, timeoutMs });
}

/** A PATH with the test folder first and the system folders after it. */
function withBin(): string {
  return `${bin}:/usr/bin:/bin`;
}

/**
 * SIGKILLs the processes a script listed in `file`, one PID per line. The
 * probe kills only the program, not its children (HAL-2662), so tests that
 * fork clean up after themselves. A missing file or a gone process is fine.
 */
async function killListed(file: string): Promise<void> {
  const text = await readFile(file, "utf8").catch(() => "");
  for (const pid of text.split("\n").map(Number)) {
    if (!Number.isInteger(pid) || pid <= 0) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}

function stdoutOf(answer: ProgramProbeResult): string {
  if (answer.status !== "ran") throw new Error(`expected "ran", got ${JSON.stringify(answer)}`);
  return answer.stdout;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "hs-attack-"));
  bin = join(dir, "bin");
  await mkdir(bin);
  await script("hello", 'echo "hello 1.2.3"');
  await script("args", 'printf "%s\\n" "$@"');
  await script("envdump", "env");
  await script("forever", "while :; do :; done");
  await script(
    "flood",
    "head -c 200000 /dev/zero | tr '\\0' o; head -c 200000 /dev/zero | tr '\\0' e >&2",
  );
  await script(
    "floodforever",
    `yes out & echo $! > ${join(dir, "flood.pids")}; yes err >&2 & echo $! >> ${join(dir, "flood.pids")}; wait`,
  );
  await script("selfkill", "kill -9 $$");
  await mkdir(join(bin, "adir"));
  await symlink(join(bin, "hello"), join(bin, "linked"));
  await symlink(join(bin, "nowhere"), join(bin, "dangling"));
  await symlink(join(bin, "loop"), join(bin, "loop"));
  await symlink(join(dir, "looping"), join(dir, "looping"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

verifies("sandbox-host.program-probe-node", () => {
  describe("attacks on a POSIX system", () => {
    describe("lookup", () => {
      it.skipIf(onWindows).each([
        ["a relative path", "./hello"],
        ["a parent path", "../bin/hello"],
        ["an absolute path", "/bin/sh"],
        ["a backslash", "bin\\hello"],
        ["a UNC path", "\\\\server\\share\\hello"],
        ["a drive path with a backslash", "C:\\hello"], // leak-guard: allow absolute-path a hostile program name, not a real path
        ["a drive path with a slash", "C:/hello"],
      ])(`${skipOnWindows}is missing for a name with %s`, async (_, name) => {
        expect(await probe(withBin()).ask(name, [])).toEqual({ status: "missing" });
      });

      it.skipIf(onWindows).each([
        ["a dot", "."],
        ["two dots", ".."],
        ["a NUL byte", "hello\0"],
        ["a NUL byte first", "\0hello"],
        ["a drive letter", "C:hello"],
        ["a very long name", "h".repeat(10_000)],
        ["a trailing space", "hello "],
        ["a newline", "hello\nid"],
        ["shell syntax", "hello;id"],
        ["command substitution", "$(hello)"],
        ["a tilde", "~"],
        ["a folder on PATH", "adir"],
        ["a dangling symlink", "dangling"],
        ["a symlink loop", "loop"],
      ])(`${skipOnWindows}is missing for a name with %s`, async (_, name) => {
        expect(await probe(withBin()).ask(name, [])).toEqual({ status: "missing" });
      });

      it.skipIf(onWindows).each(["cd", "exit", "echo", "exec", "eval"])(
        `${skipOnWindows}is missing for the shell builtin %s when no PATH folder holds it`,
        async (name) => {
          expect(await probe(bin).ask(name, ["/tmp"])).toEqual({ status: "missing" });
        },
      );

      it.skipIf(onWindows).each([
        ["no PATH", undefined],
        ["an empty PATH", ""],
        ["only empty entries", ":::"],
        ["only relative entries", ".:bin:./bin:../bin"],
        ["a file as the entry", join(bin, "hello")],
        ["a symlink loop as the entry", join(dir, "looping")],
        ["a NUL byte in the entry", `${bin}\0`],
        ["a very long entry", `/${"d".repeat(10_000)}`],
      ])(`${skipOnWindows}is missing with %s`, async (_, path) => {
        const env = path === undefined ? {} : { PATH: path };
        expect(await createProgramProbe({ env }).ask("hello", [])).toEqual({ status: "missing" });
      });

      it.skipIf(onWindows)(
        `${skipOnWindows}skips empty, relative and broken entries and finds the program after them`,
        async () => {
          const path = ["", ".", "bin", join(bin, "hello"), join(dir, "looping"), bin].join(":");
          expect(await probe(path).ask("hello", [])).toMatchObject({
            status: "ran",
            path: join(bin, "hello"),
          });
        },
      );

      const driveEntries = ["C:/bin", "C:\\bin"]; // leak-guard: allow absolute-path a hostile PATH entry, not a real path
      it.skipIf(onWindows).each(driveEntries)(
        `${skipOnWindows}finds nothing through the drive-style entry %s, which POSIX splits at the colon`,
        async (entry) => {
          const planted = join(dir, entry);
          await mkdir(planted, { recursive: true });
          await writeFile(join(planted, "planted"), "#!/bin/sh\necho planted\n", { mode: 0o755 });
          const before = process.cwd();
          process.chdir(dir);
          try {
            expect(await probe(entry).ask("planted", [])).toEqual({ status: "missing" });
          } finally {
            process.chdir(before);
          }
        },
      );

      it.skipIf(onWindows)(
        `${skipOnWindows}runs a duplicated entry once, from its first place`,
        async () => {
          const answer = await probe(`${bin}:${bin}:${bin}`).ask("hello", []);
          expect(answer).toEqual({
            status: "ran",
            path: join(bin, "hello"),
            code: 0,
            stdout: "hello 1.2.3\n",
            stderr: "",
          });
        },
      );

      it.skipIf(onWindows)(
        `${skipOnWindows}follows a symlink on PATH but reports the path it found`,
        async () => {
          expect(await probe(bin).ask("linked", [])).toMatchObject({
            status: "ran",
            path: join(bin, "linked"),
            stdout: "hello 1.2.3\n",
          });
        },
      );

      it.skipIf(onWindows)(
        `${skipOnWindows}refuses a file under a skill's scripts/ folder and starts nothing (HAL-188)`,
        async () => {
          const scripts = join(dir, "library", "skills", "mail", "scripts");
          const marker = join(dir, "skill-script-ran");
          await mkdir(scripts, { recursive: true });
          await writeFile(join(scripts, "send"), `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });
          const names = [
            join(scripts, "send"),
            "library/skills/mail/scripts/send",
            "./scripts/send",
          ];
          const before = process.cwd();
          process.chdir(join(dir, "library", "skills", "mail"));
          try {
            for (const name of names) {
              expect(await probe(withBin()).ask(name, [])).toEqual({
                status: "missing",
              });
            }
          } finally {
            process.chdir(before);
          }
          expect(await readdir(dir)).not.toContain("skill-script-ran");
        },
      );
    });

    describe("no shell", () => {
      it.skipIf(onWindows)(
        `${skipOnWindows}passes shell syntax in the arguments on as plain text`,
        async () => {
          const marker = join(dir, "pwned");
          const args = [
            `$(touch ${marker}1)`,
            `\`touch ${marker}2\``,
            `; touch ${marker}3`,
            `| touch ${marker}4`,
            `&& touch ${marker}5`,
            `> ${marker}6`,
            "*",
            "$HOME",
          ];
          expect(stdoutOf(await probe(withBin()).ask("args", args))).toBe(`${args.join("\n")}\n`);
          expect((await readdir(dir)).filter((name) => name.startsWith("pwned"))).toEqual([]);
        },
      );

      it.skipIf(onWindows)(
        `${skipOnWindows}fails, without throwing, on a NUL byte in an argument`,
        async () => {
          expect(await probe(withBin()).ask("hello", ["a\0b"])).toMatchObject({ status: "failed" });
        },
      );

      it.skipIf(onWindows)(
        `${skipOnWindows}fails, without throwing, on a NUL byte in a passed-on variable`,
        async () => {
          const answer = await probe(withBin(), { HOME: "/users/x\0y" }).ask("hello", []);
          expect(answer).toMatchObject({ status: "failed" });
        },
      );
    });

    describe("environment", () => {
      const secrets: Record<string, string> = {
        GITHUB_TOKEN: "leak-canary-token",
        NPM_TOKEN: "leak-canary-npm",
        OPENAI_API_KEY: "leak-canary-key",
        AWS_SECRET_ACCESS_KEY: "leak-canary-aws",
        SSH_AUTH_SOCK: "/opt/leak-canary-agent",
        NODE_OPTIONS: "--require /opt/leak-canary.js",
        LD_PRELOAD: "/opt/leak-canary.so",
        LD_LIBRARY_PATH: "/opt/leak-canary-lib",
        DYLD_INSERT_LIBRARIES: "/opt/leak-canary.dylib",
        DYLD_LIBRARY_PATH: "/opt/leak-canary-dylib",
        BASH_ENV: "/opt/leak-canary-bashenv",
        ENV: "/opt/leak-canary-env",
        path: "/opt/leak-canary-lowercase",
      };
      // dash and bash on Linux add only PWD, OLDPWD, SHLVL and _. On macOS `env`
      // may also print __CF_USER_TEXT_ENCODING, which would fail these tests.
      const allowed = /^(PATH|HOME|LANG|LC_ALL|LC_CTYPE|LC_MESSAGES|PWD|OLDPWD|SHLVL|_)$/;

      function names(dump: string): string[] {
        return dump
          .split("\n")
          .filter((line) => line.includes("="))
          .map((line) => line.slice(0, line.indexOf("=")));
      }

      it.skipIf(onWindows)(
        `${skipOnWindows}passes none of the launcher's secrets or loader variables on`,
        async () => {
          const dump = stdoutOf(await probe(withBin(), secrets).ask("envdump", []));
          expect(dump).not.toContain("leak-canary");
          expect(names(dump).filter((name) => !allowed.test(name))).toEqual([]);
        },
      );

      it.skipIf(onWindows)(
        `${skipOnWindows}passes none of them on from process.env when no env is given`,
        async () => {
          for (const [name, value] of Object.entries(secrets)) vi.stubEnv(name, value);
          vi.stubEnv("PATH", withBin());
          const dump = stdoutOf(await createProgramProbe().ask("envdump", []));
          expect(dump).not.toContain("leak-canary");
          expect(names(dump).filter((name) => !allowed.test(name))).toEqual([]);
        },
      );

      it.skipIf(onWindows)(
        `${skipOnWindows}passes PATH, HOME and the locale on unchanged`,
        async () => {
          const env = {
            HOME: "/users/x",
            LANG: "C.UTF-8",
            LC_ALL: "C",
            LC_CTYPE: "C",
            LC_MESSAGES: "C",
          };
          const dump = stdoutOf(await probe(withBin(), env).ask("envdump", []));
          for (const [name, value] of Object.entries({ ...env, PATH: withBin() })) {
            expect(dump.split("\n")).toContain(`${name}=${value}`);
          }
        },
      );
    });

    describe("limits", () => {
      it.skipIf(onWindows)(
        `${skipOnWindows}stops a program that never ends after 5 seconds by default`,
        async () => {
          const started = Date.now();
          const answer = await createProgramProbe({ env: { PATH: withBin() } }).ask("forever", []);
          const took = Date.now() - started;
          expect(answer).toEqual({
            status: "failed",
            path: join(bin, "forever"),
            error: "forever didn't finish in time and was stopped.",
          });
          expect(took).toBeGreaterThanOrEqual(4_900);
          expect(took).toBeLessThan(8_000);
        },
        15_000,
      );

      it.skipIf(onWindows)(
        `${skipOnWindows}cuts flooded stdout and stderr at 4 KB each`,
        async () => {
          const answer = await probe(withBin()).ask("flood", []);
          expect(answer).toEqual({
            status: "ran",
            path: join(bin, "flood"),
            code: 0,
            stdout: "o".repeat(4_096),
            stderr: "e".repeat(4_096),
          });
        },
      );

      it.skipIf(onWindows)(
        `${skipOnWindows}stops a program that floods both streams without end`,
        async () => {
          try {
            const answer = await probe(withBin(), {}, 300).ask("floodforever", []);
            expect(answer).toEqual({
              status: "failed",
              path: join(bin, "floodforever"),
              error: "floodforever didn't finish in time and was stopped.",
            });
          } finally {
            // Both `yes` outlive the stopped script until HAL-2662 kills the group.
            await killListed(join(dir, "flood.pids"));
          }
        },
      );

      it.skipIf(onWindows)(
        `${skipOnWindows}keeps a cut multi-byte character to one replacement character`,
        async () => {
          // 4,096 bytes of three-byte characters ends one byte into a character.
          await script(
            "euro",
            "i=0; while [ $i -lt 2000 ]; do printf '\\342\\202\\254'; i=$((i+1)); done",
          );
          const out = stdoutOf(await probe(withBin()).ask("euro", []));
          expect(out).toBe(`${"€".repeat(1_365)}\uFFFD`);
        },
      );

      it.skipIf(onWindows)(
        `${skipOnWindows}reports a program that killed itself as ran, with no exit code`,
        async () => {
          expect(await probe(withBin()).ask("selfkill", [])).toMatchObject({
            status: "ran",
            code: null,
          });
        },
      );

      it.skipIf(onWindows)(
        `${skipOnWindows}answers in time when the program leaves a child holding its output open`,
        async () => {
          const pidFile = join(dir, "holder.pid");
          await script("holder", `sleep 30 & echo $! > ${pidFile}; exit 0`);
          try {
            const started = Date.now();
            const answer = await probe(withBin(), {}, 300).ask("holder", []);
            expect(Date.now() - started).toBeLessThan(3_000);
            expect(answer.status === "failed" || answer.status === "ran").toBe(true);
          } finally {
            await killListed(pidFile);
          }
        },
      );
    });
  });
});
