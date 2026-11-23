import { lstat, mkdir, mkdtemp, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeRunner, makeProfile } from "./srt-session.test-helper.ts";
import { SrtSession } from "./srt-session.ts";
import { DenyPlaceholders } from "./windows-deny-placeholders.ts";

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

verifies("sandbox-srt.windows-tool-folders", () => {
  describe("SrtSession and the empty files and folders srt makes for the denies on Windows", () => {
    let base: string;
    let work: string;
    let placeholders: DenyPlaceholders;

    beforeEach(async () => {
      base = await mkdtemp(join(tmpdir(), "srt-deny-placeholders-"));
      work = join(base, "work");
      await mkdir(work, { recursive: true });
      placeholders = new DenyPlaceholders();
    });

    afterEach(async () => {
      await rm(base, { recursive: true, force: true });
    });

    /** What `srt-win acl stamp` does at open for a deny on a missing file. */
    async function stampPlaceholder(): Promise<void> {
      await writeFile(join(work, ".npmrc"), "");
    }

    /** Opens a session that removes the placeholders as on Windows, through this test's own instance or `given`. */
    const open = (
      profile: SandboxProfile,
      warn?: (message: string) => void,
      given: DenyPlaceholders = placeholders,
    ) =>
      SrtSession.open(profile, fakeRunner().runner, {
        placeholders: given,
        ...(warn === undefined ? {} : { warn }),
      });

    it("removes them when the session closes", async () => {
      const session = await open(makeProfile(base));
      await stampPlaceholder();
      await session.close();
      expect(await exists(join(work, ".npmrc"))).toBe(false);
    });

    it("removes the folder made on the way to a two-name entry, such as .yarn (HAL-16291)", async () => {
      const session = await open(makeProfile(base));
      await mkdir(join(work, ".yarn"));
      await writeFile(join(work, ".yarn", "releases"), "");
      await session.close();
      expect(await exists(join(work, ".yarn"))).toBe(false);
    });

    it("removes them by default only on Windows, and leaves them to srt elsewhere", async () => {
      const session = await SrtSession.open(makeProfile(base), fakeRunner().runner);
      await stampPlaceholder();
      await session.close();
      expect(await exists(join(work, ".npmrc"))).toBe(process.platform !== "win32");
    });

    it("gives the hold back when the open fails, so a later close still removes them", async () => {
      const failing = makeProfile(base, {
        deniedPaths: [join(base, "denied")],
        reopenedPaths: [join(base, "denied", "missing")],
      });
      await expect(open(failing)).rejects.toThrow(/isn't there/);
      const session = await open(makeProfile(base));
      await stampPlaceholder();
      await session.close();
      expect(await exists(join(work, ".npmrc"))).toBe(false);
    });

    it("keeps a folder put at the path", async () => {
      const session = await open(makeProfile(base));
      await mkdir(join(work, ".npmrc"));
      await session.close();
      expect((await lstat(join(work, ".npmrc"))).isDirectory()).toBe(true);
    });

    it("logs a file it can't remove, and the close still succeeds", async () => {
      const warnings: string[] = [];
      const locked = new DenyPlaceholders({
        file: () => Promise.reject(new Error("the file is in use")),
        folder: rmdir,
      });
      const session = await open(makeProfile(base), (message) => warnings.push(message), locked);
      await stampPlaceholder();
      await expect(session.close()).resolves.toBeUndefined();
      expect(warnings).toEqual([
        expect.stringMatching(
          /^could not remove an empty file or folder the sandbox made: .*\.npmrc: the file is in use$/,
        ),
      ]);
    });
  });
});
