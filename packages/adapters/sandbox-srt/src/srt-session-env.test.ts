import { symlinkSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SrtSandbox } from "./srt-sandbox.ts";
import { command, fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";
import { launcherEnv, programEnv } from "./srt-session-env.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, mkdtemp: vi.fn(actual.mkdtemp) };
});

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "srt-session-test-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(base, { recursive: true, force: true });
});

const profile = (overrides: Partial<SandboxProfile> = {}) => makeProfile(base, overrides);

verifies("sandbox-srt.session", () => {
  describe("the private settings folder", () => {
    it("is never on the PATH of the launcher or the program", () => {
      const folder = join(tmpdir(), "halonic-srt-x");
      const host = { PATH: ["/usr/bin", folder, join(folder, "canary"), "/bin"].join(delimiter) };
      const env = programEnv(
        profile({ env: { PATH: `${folder}${delimiter}/opt/bin` } }),
        host,
        folder,
      );
      expect(env["PATH"]).toBe("/opt/bin");
      expect(launcherEnv(profile(), host, folder)["PATH"]).toBe(`/usr/bin${delimiter}/bin`);
    });

    it("is not on the PATH any request of a session carries", async () => {
      const { runner, runs, probes } = fakeRunner();
      // Make the session's folder known in advance, so it can be put on the PATH.
      const folder = await mkdtemp(join(tmpdir(), "halonic-srt-"));
      vi.mocked(fsPromises.mkdtemp).mockResolvedValueOnce(folder);
      vi.stubEnv("PATH", ["/usr/bin", folder].join(delimiter));
      const session = await new SrtSandbox(linux, runner).open(profile({ env: { PATH: folder } }));
      await session.start(command);
      expect(probes.length).toBeGreaterThan(0);
      for (const request of [...probes, ...runs.map((run) => run.request)]) {
        for (const path of [request.launcherEnv["PATH"], request.programEnv["PATH"]]) {
          expect(path?.split(delimiter) ?? []).not.toContain(folder);
        }
      }
      await session.close();
    });

    it("is not reachable through a relative entry of the profile's PATH", async () => {
      const folder = await mkdtemp(join(tmpdir(), "halonic-srt-"));
      const relativeEntry = join("..", "..", folder);
      const given = [relativeEntry, "bin", "/opt/bin"].join(delimiter);
      const env = programEnv(profile({ env: { PATH: given } }), {}, folder);
      expect(env["PATH"]).toBe(["bin", "/opt/bin"].join(delimiter));
      await rm(folder, { recursive: true, force: true });
    });

    it("is not on the PATH under its resolved name either", async () => {
      const real = await mkdtemp(join(tmpdir(), "halonic-srt-"));
      const link = `${real}-link`;
      symlinkSync(real, link, "junction"); // a junction needs no rights on Windows
      // The folder is known by its link, but the PATH names the real folder.
      const env = programEnv(profile({ env: { PATH: `${real}${delimiter}/opt/bin` } }), {}, link);
      expect(env["PATH"]).toBe("/opt/bin");
      await rm(link, { force: true });
      await rm(real, { recursive: true, force: true });
    });
  });

  describe("the profile's variable names", () => {
    it.each(["--unset=HTTP_PROXY", "-i", "1A", "A=B", "A B", "", "A-B"])(
      "rejects the name %j before anything runs",
      async (name) => {
        const { runner, probes } = fakeRunner();
        const open = new SrtSandbox(linux, runner).open(profile({ env: { [name]: "x" } }));
        await expect(open).rejects.toThrow(/not plain/);
        expect(probes).toEqual([]);
        expect(() => programEnv(profile({ env: { [name]: "x" } }), {})).toThrow(/not plain/);
      },
    );

    it.each(["HOME", "_x", "Foo_9"])("accepts the name %s", (name) => {
      expect(programEnv(profile({ env: { [name]: "x" } }), {})[name]).toBe("x");
    });
  });

  describe("a session that reaches no network", () => {
    const withoutSrtEnv = async (network: SandboxProfile["network"]) => {
      const { runner, runs, probes } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(profile({ network }));
      await session.start(command);
      const seen = [probes[0]?.withoutSrtEnv, runs[0]?.request.withoutSrtEnv];
      await session.close();
      return seen;
    };

    it("starts the probe and the program without srt's variables", async () => {
      expect(await withoutSrtEnv({ bridge: null, allowedSites: [] })).toEqual([true, true]);
    });

    it("keeps srt's proxy variables when there is a bridge or an allowed site", async () => {
      const bridge = { host: "127.0.0.1", port: 4100 };
      expect(await withoutSrtEnv({ bridge, allowedSites: [] })).toEqual([false, false]);
      expect(await withoutSrtEnv({ bridge: null, allowedSites: ["*.npmjs.org"] })).toEqual([
        false,
        false,
      ]);
    });
  });
});
