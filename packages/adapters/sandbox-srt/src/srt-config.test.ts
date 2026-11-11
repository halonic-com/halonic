import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxRuntimeConfigSchema } from "@anthropic-ai/sandbox-runtime";
// Not in srt's public index: imported here only to test the settings against the guard srt runs.
import { createResolvedAddressGuard } from "@anthropic-ai/sandbox-runtime/dist/sandbox/resolved-address-guard.js";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { buildSrtConfig } from "./srt-config.ts";

function profile(overrides: Partial<SandboxProfile> = {}): SandboxProfile {
  return {
    workingFolder: "/work/acme",
    tempFolder: "/scratch/hs-1",
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 60_000,
    ...overrides,
  };
}

verifies("sandbox-srt.profile-to-srt-config", () => {
  it("allows writes in the working and temp folders only", () => {
    const writes = buildSrtConfig(profile()).filesystem?.allowWrite;
    expect(writes).toEqual([
      { path: "/work/acme", literal: true },
      { path: "/scratch/hs-1", literal: true },
    ]);
  });

  it("adds the settings folder to the writable folders", () => {
    const writes = buildSrtConfig(profile({ settingsFolder: "/data/agents/ada" })).filesystem
      ?.allowWrite;
    expect(writes).toContainEqual({ path: "/data/agents/ada", literal: true });
  });

  it("passes a denied path with a star as a literal path", () => {
    const config = buildSrtConfig(profile({ deniedPaths: ["/keys/ada*"] }));
    expect(config.filesystem?.denyRead).toEqual([{ path: "/keys/ada*", literal: true }]);
  });

  it("denies read-only paths for writing but not for reading", () => {
    const config = buildSrtConfig(profile({ readOnlyPaths: ["/work/acme/halonic.yaml"] }));
    expect(config.filesystem?.denyRead).toEqual([]);
    expect(config.filesystem?.denyWrite).toContainEqual({
      path: "/work/acme/halonic.yaml",
      literal: true,
    });
  });

  it("grants reading the read-only paths on Windows only", () => {
    const readOnlyPaths = ["%APPDATA%\\npm"];
    const win = buildSrtConfig(profile({ readOnlyPaths }), [], [], "win32").filesystem;
    expect(win?.allowRead).toContainEqual({ path: readOnlyPaths[0], literal: true });
    expect(win?.denyWrite).toContainEqual({ path: readOnlyPaths[0], literal: true });
    expect(
      buildSrtConfig(profile({ readOnlyPaths }), [], [], "linux").filesystem,
    ).not.toHaveProperty("allowRead");
    expect(buildSrtConfig(profile(), [], [], "win32").filesystem).not.toHaveProperty("allowRead");
  });

  it("denies writing the tool settings and hooks inside the working folder", () => {
    const writes = buildSrtConfig(profile()).filesystem?.denyWrite;
    const inWork = (...parts: string[]) => ({
      path: join("/work/acme", ...parts),
      literal: true,
    });
    expect(writes).toEqual(
      expect.arrayContaining([
        inWork(".claude", "settings.json"),
        inWork(".claude", "settings.local.json"),
        inWork(".codex"),
        inWork(".cursor"),
      ]),
    );
  });

  it("denies writing the git files the session found, in the working folder", () => {
    const writes = buildSrtConfig(profile(), [], [join(".git", "modules", "docs", "config")])
      .filesystem?.denyWrite;
    expect(writes).toContainEqual({
      path: join("/work/acme", ".git", "modules", "docs", "config"),
      literal: true,
    });
  });

  it("also denies writing shell start-up files, git hooks and package manager settings", () => {
    const writes = buildSrtConfig(profile()).filesystem?.denyWrite ?? [];
    const paths = writes.map((entry) => (typeof entry === "string" ? entry : entry.path));
    for (const path of [
      ".bashrc",
      ".zshrc",
      ".npmrc",
      ".envrc",
      ".gitmodules",
      ".husky",
      ".vscode",
      ".idea",
      ".gitconfig",
      ".ripgreprc",
      ".tool-versions",
      "mise.toml",
    ]) {
      expect(paths).toContain(join("/work/acme", path));
    }
    expect(paths).toContain(join("/work/acme", ".git", "hooks"));
    expect(paths).toContain(join("/work/acme", ".git", "config"));
    for (const dir of ["commands", "agents", "skills", "hooks"]) {
      expect(paths).toContain(join("/work/acme", ".claude", dir));
    }
    for (const dir of ["releases", "plugins"]) {
      expect(paths).toContain(join("/work/acme", ".yarn", dir));
    }
  });

  it("hides the paths a session adds from reading and writing", () => {
    const config = buildSrtConfig(profile(), ["/scratch/hs-private"]);
    expect(config.filesystem?.denyRead).toEqual([{ path: "/scratch/hs-private", literal: true }]);
    expect(config.filesystem?.denyWrite).toContainEqual({
      path: "/scratch/hs-private",
      literal: true,
    });
  });

  it("allows exactly the bridge and the allowed sites on the network", () => {
    const config = buildSrtConfig(
      profile({
        network: {
          bridge: { host: "127.0.0.1", port: 4100 },
          allowedSites: ["*.npmjs.org"],
        },
      }),
    );
    expect(config.network?.allowedDomains).toEqual(["127.0.0.1:4100", "*.npmjs.org"]);
  });

  it("writes an IPv6 bridge host in brackets", () => {
    const config = buildSrtConfig(
      profile({
        network: { bridge: { host: "::1", port: 4100 }, allowedSites: [] },
      }),
    );
    expect(config.network?.allowedDomains).toEqual(["[::1]:4100"]);
  });

  it("allows only the sites, and no loopback address, without a bridge", () => {
    const noBridge = (allowedSites: string[]) =>
      buildSrtConfig(profile({ network: { bridge: null, allowedSites } })).network;
    expect(noBridge(["*.npmjs.org"])?.allowedDomains).toEqual(["*.npmjs.org"]);
    // An empty list is srt's "no network at all", not "no restriction".
    expect(noBridge([])?.allowedDomains).toEqual([]);
    expect(noBridge([])?.strictAllowlist).toBe(true);
  });

  it("refuses a site that resolves to loopback, on any port, without a bridge", () => {
    const network = buildSrtConfig(
      profile({ network: { bridge: null, allowedSites: ["*.nip.io"] } }),
    ).network;
    const guard = createResolvedAddressGuard({
      allowedDomains: network?.allowedDomains ?? [],
      deniedDomains: network?.deniedDomains ?? [],
      deniedResolvedAddresses: network?.deniedResolvedAddresses ?? [],
      localAddresses: () => [],
    });
    expect(guard.permits("127.0.0.1.nip.io", "127.0.0.1", 4100)).toBe(false);
    expect(guard.permits("x.nip.io", "::1", 4100)).toBe(false);
  });

  it("refuses an allowed site that resolves to a local or private address, apart from the bridge", () => {
    const config = buildSrtConfig(
      profile({
        network: {
          bridge: { host: "127.0.0.1", port: 4100 },
          allowedSites: ["*.nip.io"],
        },
      }),
    );
    // srt builds its guard from these network settings when a session starts.
    const guard = createResolvedAddressGuard({
      allowedDomains: config.network?.allowedDomains ?? [],
      deniedDomains: config.network?.deniedDomains ?? [],
      deniedResolvedAddresses: config.network?.deniedResolvedAddresses ?? [],
      localAddresses: () => ["203.0.113.7"],
    });
    for (const address of [
      "127.0.0.1",
      "::1",
      "0.0.0.0",
      "169.254.169.254",
      "fe80::1",
      "10.0.0.5",
      "172.16.1.1",
      "192.168.1.1",
      "100.64.0.1",
      "fd00::1",
      "::ffff:192.168.1.1",
      "203.0.113.7",
    ]) {
      expect(guard.permits("x.nip.io", address, 443), address).toBe(false);
    }
    expect(guard.permits("127.0.0.1.nip.io", "127.0.0.1", 4100)).toBe(true);
    expect(guard.permits("127.0.0.1.nip.io", "127.0.0.1", 4101)).toBe(false);
    expect(guard.permits("api.nip.io", "93.184.215.14", 443)).toBe(true);
  });

  it("denies every host that isn't allowed, without asking", () => {
    expect(buildSrtConfig(profile()).network?.strictAllowlist).toBe(true);
  });

  it("produces settings that srt's own schema accepts", () => {
    const profiles = [
      profile(),
      profile({
        settingsFolder: "/data/agents/ada",
        readOnlyPaths: ["/work/acme/halonic.yaml"],
        deniedPaths: ["/keys/ada*"],
        network: {
          bridge: { host: "127.0.0.1", port: 4100 },
          allowedSites: ["*.npmjs.org"],
        },
      }),
      profile({
        network: {
          bridge: { host: "::1", port: 4100 },
          allowedSites: ["*.npmjs.org"],
        },
      }),
    ];
    for (const p of profiles) {
      expect(() => SandboxRuntimeConfigSchema.parse(buildSrtConfig(p))).not.toThrow();
    }
  });

  // srt doesn't run on Windows, so the real path isn't added there.
  it.skipIf(process.platform === "win32")(
    "[platform:win32] also denies the real path of a folder reached through a symlink, for entries that don't exist yet",
    () => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), "srt-config-")));
      mkdirSync(join(base, "real", "work"), { recursive: true });
      symlinkSync(join(base, "real"), join(base, "link"));
      const work = join(base, "link", "work");
      const config = buildSrtConfig(profile({ workingFolder: work }));
      const denied = config.filesystem?.denyWrite?.map((entry) =>
        typeof entry === "string" ? entry : entry.path,
      );
      expect(denied).toContain(join(work, ".npmrc"));
      expect(denied).toContain(join(base, "real", "work", ".npmrc"));
      expect(denied).toContain(join(base, "real", "work", ".codex"));
    },
  );

  it("denies writing a worktree's .git file, which points git at its real folder", () => {
    const work = realpathSync(mkdtempSync(join(tmpdir(), "srt-config-")));
    writeFileSync(join(work, ".git"), "gitdir: /elsewhere\n");
    const config = buildSrtConfig(profile({ workingFolder: work }));
    const denied = config.filesystem?.denyWrite?.map((entry) =>
      typeof entry === "string" ? entry : entry.path,
    );
    expect(denied).toContain(join(work, ".git"));
  });
});
