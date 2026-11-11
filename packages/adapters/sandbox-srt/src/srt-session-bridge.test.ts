import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SrtSandbox } from "./srt-sandbox.ts";
import { fakeRunner, linux, makeProfile } from "./srt-session.test-helper.ts";

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "srt-session-test-"));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const profile = (overrides: Partial<SandboxProfile> = {}) => makeProfile(base, overrides);

verifies("sandbox-srt.session", () => {
  describe("SrtSandbox.open with a bridge", () => {
    it("rejects a bridge that is not a loopback address", async () => {
      const { runner, probes } = fakeRunner();
      const open = new SrtSandbox(linux, runner).open(
        profile({
          network: { bridge: { kind: "loopback", host: "10.0.0.5", port: 4100 }, allowedSites: [] },
        }),
      );
      await expect(open).rejects.toThrow(/loopback/);
      expect(probes).toEqual([]);
    });

    it("rejects a bridge on a Unix socket until srt's rule for it lands", async () => {
      const { runner, probes } = fakeRunner();
      const bridge = {
        kind: "socket",
        name: "bridge.halonic.invalid",
        socketPath: "/data/r1/bridge.sock",
      } as const;
      const open = new SrtSandbox(linux, runner).open(
        profile({ network: { bridge, allowedSites: [] } }),
      );
      await expect(open).rejects.toThrow(/Unix socket/);
      expect(probes).toEqual([]);
    });

    it("opens a session without a bridge, with no loopback address in its network", async () => {
      const { runner, probes } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(
        profile({ network: { bridge: null, allowedSites: [] } }),
      );
      expect(session.fence).toEqual({ state: "fenced" });
      const config = JSON.parse(readFileSync(probes[0]?.settingsPath ?? "", "utf8"));
      expect(config.network.allowedDomains).toEqual([]);
      await session.close();
    });

    it.each(["127.0.0.1", "127.1.2.3", "::1", "[::1]", "localhost"])(
      "accepts the bridge %s",
      async (host) => {
        const { runner } = fakeRunner();
        const session = await new SrtSandbox(linux, runner).open(
          profile({
            network: { bridge: { kind: "loopback", host, port: 4100 }, allowedSites: [] },
          }),
        );
        expect(session.fence).toEqual({ state: "fenced" });
        await session.close();
      },
    );
  });
});
