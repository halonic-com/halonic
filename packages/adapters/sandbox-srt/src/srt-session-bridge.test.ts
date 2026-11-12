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
  describe("SrtSandbox.open with a bridge on a Unix socket", () => {
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
  });
});
