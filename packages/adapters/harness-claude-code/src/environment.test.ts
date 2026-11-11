import { readFileSync } from "node:fs";
import { addHarnessEnvironment, type HarnessBridge, type SandboxProfile } from "@halonicjs/ports";
import { FakeSandboxSession, readText } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { claudeCodeEnvironment } from "./environment.ts";

const bridge: HarnessBridge = {
  url: "http://127.0.0.1:4100",
  token: `made-up-token-${crypto.randomUUID()}`,
};

/** The profile the engine opens, before the harness adds its variables. */
const engineProfile: SandboxProfile = {
  workingFolder: "/agents/writer/work",
  tempFolder: "/sessions/one/temp",
  settingsFolder: "/agents/writer/settings",
  readOnlyPaths: [],
  deniedPaths: [],
  env: { PATH: "/usr/bin", HOME: "/agents/writer/home" },
  network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 60_000,
};

/** Opens a fake session the way the engine does, runs one program and returns the environment it saw. */
async function environmentInSession(): Promise<Readonly<Record<string, string>>> {
  const added = claudeCodeEnvironment(bridge, engineProfile);
  const profile = { ...engineProfile, env: addHarnessEnvironment(engineProfile.env, added) };
  const session = new FakeSandboxSession({
    profile,
    program: async (io) => {
      io.write(JSON.stringify(io.profile.env));
      return 0;
    },
  });
  const process = await session.start({ program: "claude", args: [] });
  const seen = JSON.parse(await readText(process.stdout)) as Record<string, string>;
  await session.close();
  return seen;
}

verifies("harness-claude-code.environment", () => {
  describe("claudeCodeEnvironment", () => {
    it("imports only the ports, so Studio's page can load @halonicjs/adapter-harness-claude-code/environment", () => {
      const code = readFileSync(new URL("./environment.ts", import.meta.url), "utf8");
      const imported = [...code.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
      expect(imported).toEqual(["@halonicjs/ports"]);
    });

    it("points the program at the bridge, its settings folder and the session's temp folder", async () => {
      expect(await environmentInSession()).toEqual({
        PATH: "/usr/bin",
        HOME: "/agents/writer/home",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:4100",
        ANTHROPIC_CUSTOM_HEADERS: `x-halonic-run-token: ${bridge.token}`,
        CLAUDE_CONFIG_DIR: "/agents/writer/settings",
        CLAUDE_CODE_TMPDIR: "/sessions/one/temp",
        HALONIC_RUN_TOKEN: bridge.token,
      });
    });

    it("puts the token only in the header and the MCP token variable, never in the address", () => {
      const environment = claudeCodeEnvironment(bridge, engineProfile);
      const withToken = Object.entries(environment)
        .filter(([, value]) => value.includes(bridge.token))
        .map(([name]) => name);
      expect(withToken).toEqual(["ANTHROPIC_CUSTOM_HEADERS", "HALONIC_RUN_TOKEN"]);
    });

    it("gives each session its own temp folder", () => {
      const other = { ...engineProfile, tempFolder: "/sessions/two/temp" };
      expect(claudeCodeEnvironment(bridge, engineProfile)["CLAUDE_CODE_TMPDIR"]).not.toBe(
        claudeCodeEnvironment(bridge, other)["CLAUDE_CODE_TMPDIR"],
      );
    });

    it("fails without a settings folder, and keeps the token out of the error", () => {
      const noSettings = { ...engineProfile, settingsFolder: null };
      expect(() => claudeCodeEnvironment(bridge, noSettings)).toThrow(
        "Claude Code needs a settings folder",
      );
      try {
        claudeCodeEnvironment(bridge, noSettings);
      } catch (error) {
        expect(String(error)).not.toContain(bridge.token);
      }
    });
  });
});
