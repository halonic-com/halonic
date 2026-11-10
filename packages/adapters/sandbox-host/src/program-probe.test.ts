import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProgramProbe } from "./program-probe.ts";

const onWindows = process.platform === "win32";
const skipOnWindows = "[platform:win32] needs /bin/sh scripts: ";

let dir = "";

async function script(name: string, body: string): Promise<void> {
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
}

function probe(extra: Record<string, string> = {}, timeoutMs = 5_000) {
  return createProgramProbe({ env: { PATH: `${dir}:/usr/bin:/bin`, ...extra }, timeoutMs });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "hs-probe-"));
  await script("hello", 'echo "hello 1.2.3"; echo oops >&2; exit 3');
  await script("envdump", 'echo "token=[$MY_TOKEN] home=$HOME path=[$PATH]"');
  await script("slow", "sleep 30");
  await script("loud", "head -c 10000 /dev/zero | tr '\\0' x");
  await writeFile(join(dir, "plain"), "not executable");
  await writeFile(join(dir, "broken"), "#!/nonexistent/interpreter\n");
  await chmod(join(dir, "broken"), 0o755);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

verifies("sandbox-host.program-probe-node", () => {
  describe("on a POSIX system", () => {
    it.skipIf(onWindows)(
      `${skipOnWindows}is missing for a name with a path separator`,
      async () => {
        expect(await probe().ask("./hello", [])).toEqual({ status: "missing" });
        expect(await probe().ask(join(dir, "hello"), [])).toEqual({ status: "missing" });
      },
    );

    it.skipIf(onWindows)(
      `${skipOnWindows}is missing when no PATH folder holds it, or the file isn't executable`,
      async () => {
        expect(await probe().ask("nonesuch", [])).toEqual({ status: "missing" });
        expect(await probe().ask("plain", [])).toEqual({ status: "missing" });
      },
    );

    it.skipIf(onWindows)(`${skipOnWindows}ignores relative PATH entries`, async () => {
      const answer = await createProgramProbe({ env: { PATH: ":." } }).ask("hello", []);
      expect(answer).toEqual({ status: "missing" });
    });

    it.skipIf(onWindows)(
      `${skipOnWindows}runs the program by its absolute path and reports code and output`,
      async () => {
        expect(await probe().ask("hello", ["--version"])).toEqual({
          status: "ran",
          path: join(dir, "hello"),
          code: 3,
          stdout: "hello 1.2.3\n",
          stderr: "oops\n",
        });
      },
    );

    it.skipIf(onWindows)(`${skipOnWindows}passes only PATH, HOME and the locale on`, async () => {
      const answer = await probe({ MY_TOKEN: "secret", HOME: "/users/x" }).ask("envdump", []);
      expect(answer).toMatchObject({
        status: "ran",
        stdout: expect.stringMatching(/^token=\[\] home=\/users\/x path=\[\/.*\]\n$/),
      });
    });

    it.skipIf(onWindows)(
      `${skipOnWindows}kills a program that runs too long and says so in one sentence`,
      async () => {
        const answer = await probe({}, 200).ask("slow", []);
        expect(answer).toEqual({
          status: "failed",
          path: join(dir, "slow"),
          error: "slow didn't finish in time and was stopped.",
        });
      },
    );

    it.skipIf(onWindows)(`${skipOnWindows}cuts each output at 4 KB`, async () => {
      const answer = await probe().ask("loud", []);
      expect(answer).toMatchObject({ status: "ran", code: 0 });
      expect(answer.status === "ran" && answer.stdout.length).toBe(4096);
    });

    it.skipIf(onWindows)(
      `${skipOnWindows}fails, without throwing, when the program can't be started`,
      async () => {
        const answer = await probe().ask("broken", []);
        expect(answer).toEqual({
          status: "failed",
          path: join(dir, "broken"),
          error: "broken was found but couldn't be started.",
        });
      },
    );

    it("refuses a path such as skills/x/scripts/run.sh, and never starts a file by its path", async () => {
      const folder = join(dir, "skills", "x", "scripts");
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "run.sh"), "#!/bin/sh\necho ran\n");
      await chmod(join(folder, "run.sh"), 0o755);
      for (const name of [
        "skills/x/scripts/run.sh",
        join(folder, "run.sh"),
        "./hello",
        "..\\hello",
      ]) {
        expect(await probe().ask(name, [])).toEqual({ status: "missing" });
      }
    });

    it("looks only in absolute PATH folders, so a skill's scripts folder on a relative PATH is skipped", async () => {
      const answer = await createProgramProbe({
        env: { PATH: "skills/x/scripts:scripts:" },
      }).ask("run.sh", []);
      expect(answer).toEqual({ status: "missing" });
    });
  });
});
