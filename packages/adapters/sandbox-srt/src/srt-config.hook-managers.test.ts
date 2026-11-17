import { join } from "node:path";
import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { buildSrtConfig } from "./srt-config.ts";

const profile: SandboxProfile = {
  workingFolder: "/work/acme",
  tempFolder: "/scratch/hs-1",
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 60_000,
};

verifies("sandbox-srt.profile-to-srt-config", () => {
  describe("the files that git hooks and editors run commands from", () => {
    it("denies writing the hook managers' and the other editors' settings", () => {
      const writes = buildSrtConfig(profile).filesystem?.denyWrite ?? [];
      const paths = writes.map((entry) => (typeof entry === "string" ? entry : entry.path));
      for (const name of [
        ".pre-commit-config.yaml",
        "lefthook.yaml",
        ".lefthook.yaml",
        ".lefthook-local.yml",
        "lefthook-local.yaml",
        "lefthook.toml",
        ".lintstagedrc.ts",
        ".lintstagedrc.mts",
        join(".config", "lefthook.yml"),
        join(".config", "lefthook.json"),
        "lefthook.yml",
        ".lefthook.yml",
        "lefthook-local.yml",
        ".lintstagedrc",
        ".lintstagedrc.json",
        "lint-staged.config.mjs",
        ".simple-git-hooks.json",
        ".zed",
        ".devcontainer",
      ]) {
        expect(paths, name).toContain(join("/work/acme", name));
      }
    });
  });
});
