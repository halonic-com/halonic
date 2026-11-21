import { readFileSync } from "node:fs";
import { addHarnessEnvironment, type HarnessBridge, type SandboxProfile } from "@halonicjs/ports";
import { FakeSandboxSession, readText } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { claudeCodeEnvironment, claudeCodeStandInKey } from "./environment.ts";

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
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
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
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
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

const modelVariables = [
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
];

verifies("harness-claude-code.model-variables", () => {
  describe("Claude Code's own model variables", () => {
    it("all name the task's model when it is for every call", () => {
      const added = claudeCodeEnvironment(bridge, engineProfile, {
        model: "glm-5.3",
        modelForEveryCall: true,
      });

      for (const name of modelVariables) expect(added[name]).toBe("glm-5.3");
      expect(() => addHarnessEnvironment(engineProfile.env, added)).not.toThrow();
    });

    it("are left to Claude Code for a model it knows, or none", () => {
      const named = claudeCodeEnvironment(bridge, engineProfile, { model: "sonnet" });
      const none = claudeCodeEnvironment(bridge, engineProfile, {});
      const unasked = claudeCodeEnvironment(bridge, engineProfile);

      for (const added of [named, none, unasked]) {
        for (const name of modelVariables) expect(added).not.toHaveProperty(name);
      }
    });
  });
});

verifies("harness-claude-code.stand-in-key", () => {
  it("gives Claude Code a stand-in key when its bridge serves Anthropic with a key", () => {
    const keyed = { ...bridge, keyProviders: ["anthropic"] as const };

    expect(claudeCodeEnvironment(keyed, engineProfile)["ANTHROPIC_API_KEY"]).toBe(
      claudeCodeStandInKey,
    );
  });

  it("leaves the key unset when its bridge uses the person's own sign-in for Anthropic", () => {
    const openAiOnly = { ...bridge, keyProviders: ["openai"] as const };

    expect(claudeCodeEnvironment(bridge, engineProfile)).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(claudeCodeEnvironment(openAiOnly, engineProfile)).not.toHaveProperty(
      "ANTHROPIC_API_KEY",
    );
  });
});
