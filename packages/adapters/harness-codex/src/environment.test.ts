import { readFileSync } from "node:fs";
import { addHarnessEnvironment, type HarnessBridge, type SandboxProfile } from "@halonicjs/ports";
import { FakeSandboxSession, readText } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { codexEnvironment, codexRunTokenVariable } from "./environment.ts";

const bridge: HarnessBridge = {
  url: "http://127.0.0.1:4100",
  token: `made-up-token-${crypto.randomUUID()}`,
};

/** The profile the engine opens, before the harness adds its variables. */
const engineProfile: SandboxProfile = {
  workingFolder: "/agents/coder/work",
  tempFolder: "/sessions/one/temp",
  settingsFolder: "/agents/coder/settings",
  readOnlyPaths: [],
  deniedPaths: [],
  env: { PATH: "/usr/bin", HOME: "/agents/coder/home" },
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 60_000,
};

/** Opens a fake session the way the engine does, runs one program and returns the environment it saw. */
async function environmentInSession(): Promise<Readonly<Record<string, string>>> {
  const added = codexEnvironment(bridge, engineProfile);
  const profile = { ...engineProfile, env: addHarnessEnvironment(engineProfile.env, added) };
  const session = new FakeSandboxSession({
    profile,
    program: async (io) => {
      io.write(JSON.stringify(io.profile.env));
      return 0;
    },
  });
  const process = await session.start({ program: "codex", args: [] });
  const seen = JSON.parse(await readText(process.stdout)) as Record<string, string>;
  await session.close();
  return seen;
}

verifies("harness-codex.environment", () => {
  describe("codexEnvironment", () => {
    it("imports only the ports, so Studio's page can load @halonicjs/adapter-harness-codex/environment", () => {
      const code = readFileSync(new URL("./environment.ts", import.meta.url), "utf8");
      const imported = [...code.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
      expect(imported).toEqual(["@halonicjs/ports"]);
    });

    it("points the program at its settings folder and gives it the run token", async () => {
      expect(await environmentInSession()).toEqual({
        PATH: "/usr/bin",
        HOME: "/agents/coder/home",
        CODEX_HOME: "/agents/coder/settings",
        HALONIC_RUN_TOKEN: bridge.token,
      });
    });

    it("puts the token only in its own variable", () => {
      const environment = codexEnvironment(bridge, engineProfile);
      const withToken = Object.entries(environment)
        .filter(([, value]) => value.includes(bridge.token))
        .map(([name]) => name);
      expect(withToken).toEqual([codexRunTokenVariable]);
    });

    it("fails without a settings folder, and keeps the token out of the error", () => {
      const noSettings = { ...engineProfile, settingsFolder: null };
      expect(() => codexEnvironment(bridge, noSettings)).toThrow("Codex needs a settings folder");
      try {
        codexEnvironment(bridge, noSettings);
      } catch (error) {
        expect(String(error)).not.toContain(bridge.token);
      }
    });
  });
});
