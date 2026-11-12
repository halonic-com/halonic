import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SrtSandbox } from "./srt-sandbox.ts";
import { command, fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

let base: string;

beforeEach(async () => {
  // The real path: on macOS the temp folder is behind a symbolic link, and the program starts in the real folder.
  base = await realpath(await mkdtemp(join(tmpdir(), "srt-session-start-folder-test-")));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const profile = (overrides: Partial<SandboxProfile> = {}) => makeProfile(base, overrides);

verifies("sandbox-srt.session", () => {
  describe("SrtSession.start outside the working folder (HAL-6884)", () => {
    it("starts in a folder inside a read-only path, such as a connector's workspace (HAL-6884)", async () => {
      const { runner, runs } = fakeRunner();
      const tools = join(base, "workspace", "tools");
      await mkdir(tools, { recursive: true });
      const readOnly = profile({ readOnlyPaths: [join(base, "workspace")] });
      const session = await new SrtSandbox(linux, runner).open(readOnly);
      await session.start({ ...command, cwd: tools });
      expect(runs.at(-1)?.request.cwd).toBe(tools);
      await session.close();
    });

    it("refuses a start folder in a denied path, also through a link in a read-only path", async () => {
      const { runner, runs } = fakeRunner();
      const workspace = join(base, "workspace");
      const agentFolder = join(workspace, "files", "agents", "writer");
      await mkdir(agentFolder, { recursive: true });
      await symlink(agentFolder, join(workspace, "innocent"), "dir");
      const denying = profile({ readOnlyPaths: [workspace], deniedPaths: [agentFolder] });
      const session = await new SrtSandbox(linux, runner).open(denying);
      const before = runs.length;
      for (const cwd of [agentFolder, join(workspace, "innocent")]) {
        await expect(session.start({ ...command, cwd })).rejects.toThrow(/denied to it/);
      }
      expect(runs).toHaveLength(before);
      await session.close();
    });

    it("refuses a start in the session's own private folder", async () => {
      const { runner, runs, probes } = fakeRunner();
      // A read-only path wide enough to hold the private folder, which is made under the temp folder.
      const session = await new SrtSandbox(linux, runner).open(
        profile({ readOnlyPaths: [tmpdir()] }),
      );
      const before = runs.length;
      const privateFolder = dirname(probes[0]?.settingsPath ?? "");
      expect(privateFolder).toContain("halonic-srt-");
      await expect(session.start({ ...command, cwd: privateFolder })).rejects.toThrow(
        /denied to it/,
      );
      expect(runs).toHaveLength(before);
      await session.close();
    });

    it("refuses a start in the folder that holds the sessions' journals", async () => {
      const { runner, runs } = fakeRunner();
      const workspace = join(base, "workspace");
      const journals = join(workspace, "journals");
      await mkdir(journals, { recursive: true });
      const session = await new SrtSandbox(linux, runner, journals).open(
        profile({ readOnlyPaths: [workspace] }),
      );
      const before = runs.length;
      await expect(session.start({ ...command, cwd: journals })).rejects.toThrow(/denied to it/);
      expect(runs).toHaveLength(before);
      await session.close();
    });
  });
});
