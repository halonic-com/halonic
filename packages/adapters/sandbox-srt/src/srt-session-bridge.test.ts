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
  describe("SrtSandbox.open with a bridge on a Unix socket", () => {
    it("opens a session with a socket bridge, its name routed to the socket", async () => {
      const { runner, probes } = fakeRunner();
      const session = await new SrtSandbox(linux, runner).open(
        profile({
          network: {
            bridge: {
              kind: "socket",
              name: "bridge.halonic.invalid",
              socketPath: "/run/acme/bridge.sock",
            },
            allowedSites: [],
          },
        }),
      );
      expect(session.fence).toEqual({ state: "fenced" });
      const config = JSON.parse(readFileSync(probes[0]?.settingsPath ?? "", "utf8"));
      expect(config.network.allowedDomains).toEqual(["bridge.halonic.invalid:80"]);
      expect(config.network.mitmProxy).toEqual({
        socketPath: "/run/acme/bridge.sock",
        domains: ["bridge.halonic.invalid"],
      });
      await session.close();
    });

    it.each([
      ["a relative socket path", "bridge.halonic.invalid", "run/bridge.sock", /absolute/],
      [
        "a socket path over 107 bytes",
        "bridge.halonic.invalid",
        `/${"a".repeat(100)}/b.sock`,
        /108 bytes, more than the 107 a Unix socket allows on linux/,
      ],
      ["a pattern as the name", "*.halonic.invalid", "/run/bridge.sock", /plain host name/],
      ["localhost as the name", "localhost", "/run/bridge.sock", /plain host name/],
      ["an address as the name", "127.0.0.1", "/run/bridge.sock", /plain host name/],
      ["a name srt refuses", "bridge halonic", "/run/bridge.sock", /plain host name/],
      ["a name with a port", "bridge.halonic.invalid:80", "/run/bridge.sock", /plain host name/],
    ])(
      "rejects a socket bridge with %s, and nothing runs",
      async (_case, name, socketPath, reason) => {
        const { runner, probes } = fakeRunner();
        const open = new SrtSandbox(linux, runner).open(
          profile({ network: { bridge: { kind: "socket", name, socketPath }, allowedSites: [] } }),
        );
        await expect(open).rejects.toThrow(reason);
        expect(probes).toEqual([]);
      },
    );

    it("rejects a socket path over 103 bytes on macOS, and nothing runs", async () => {
      const { runner, probes } = fakeRunner();
      const socketPath = `/${"a".repeat(96)}/b.sock`;
      const open = new SrtSandbox({ ...linux, platform: "darwin" }, runner).open(
        profile({
          network: {
            bridge: { kind: "socket", name: "bridge.halonic.invalid", socketPath },
            allowedSites: [],
          },
        }),
      );
      await expect(open).rejects.toThrow(
        /104 bytes, more than the 103 a Unix socket allows on darwin/,
      );
      expect(probes).toEqual([]);
    });

    it("accepts a socket path of exactly 107 bytes", async () => {
      const { runner } = fakeRunner();
      const socketPath = `/${"a".repeat(99)}/b.sock`;
      expect(Buffer.byteLength(socketPath)).toBe(107);
      const session = await new SrtSandbox(linux, runner).open(
        profile({
          network: {
            bridge: { kind: "socket", name: "bridge.halonic.invalid", socketPath },
            allowedSites: [],
          },
        }),
      );
      expect(session.fence).toEqual({ state: "fenced" });
      await session.close();
    });
  });
});
