import { join } from "node:path";
import type { HarnessBridge } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  disableSwitches,
  opencodeEnvironment,
  opencodeHarnessEnvironment,
  opencodeStandInKey,
} from "./environment.ts";
import { opencodeFiles } from "./files.ts";

const token = "made-up-run-token";
const keyed: HarnessBridge = { url: "http://127.0.0.1:4100", token, keyProviders: ["anthropic"] };
const task = { model: "deepseek/deepseek-v4.1-flash-1017" };
const settings = join("/agents", "writer");
const files = opencodeFiles({ settingsFolder: settings, tempFolder: join("/run", "tmp") });

verifies("harness-opencode.environment", () => {
  describe("opencodeEnvironment", () => {
    const environment = opencodeEnvironment(keyed, task, files);

    it("sets every OPENCODE_DISABLE_* switch 2.3.0 ships", () => {
      expect(disableSwitches).toHaveLength(9);
      for (const name of disableSwitches) expect(environment[name]).toBe("1");
    });

    it("keeps every folder of OpenCode's inside the agent's settings folder", () => {
      for (const name of [
        "OPENCODE_CONFIG_DIR",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "XDG_STATE_HOME",
      ]) {
        expect(environment[name]?.startsWith(settings)).toBe(true);
      }
      expect(environment["XDG_CACHE_HOME"]?.startsWith(settings)).toBe(true);
      expect(environment["OPENCODE_DB"]).toBe(join(settings, "opencode.db"));
      expect(environment["OPENCODE_MODELS_PATH"]).toBe(join(settings, "models.json"));
      expect(files.updatePolicyFile).toBe(join(settings, "config", "opencode.json"));
      expect(files.instructionsFile).toBe(join("/run", "tmp", "halonic-instructions.md"));
    });

    it("has the token only in HALONIC_RUN_TOKEN, and the config names it", () => {
      const holding = Object.keys(environment).filter((name) => environment[name]?.includes(token));
      expect(holding).toEqual(["HALONIC_RUN_TOKEN"]);
      expect(environment["OPENCODE_CONFIG_CONTENT"]).toContain("{env:HALONIC_RUN_TOKEN}");
    });

    it("gives the stand-in key only when the bridge keeps Anthropic's key", () => {
      expect(environment["ANTHROPIC_API_KEY"]).toBe(opencodeStandInKey);
      const ownSignIn = opencodeEnvironment({ url: keyed.url, token }, task, files);
      expect(ownSignIn).not.toHaveProperty("ANTHROPIC_API_KEY");
    });

    it("refuses a profile without a settings folder", () => {
      expect(() => opencodeFiles({ settingsFolder: null, tempFolder: "/run/tmp" })).toThrow(
        "OpenCode needs a settings folder",
      );
    });
  });

  describe("opencodeHarnessEnvironment", () => {
    it("is the environment of the run's files, for the Studio page", () => {
      const folders = {
        workingFolder: "/work",
        tempFolder: join("/run", "tmp"),
        settingsFolder: settings,
      };

      expect(opencodeHarnessEnvironment(keyed, folders, task)).toEqual(
        opencodeEnvironment(keyed, task, files),
      );
    });

    it("writes a Windows settings folder's files with \\", () => {
      const windows = (...names: string[]) => names.join("\\");
      const onWindows = opencodeFiles({
        settingsFolder: windows("D:", "Agents", "writer"),
        tempFolder: windows("D:", "Temp"),
      });

      expect(onWindows.database).toBe(windows("D:", "Agents", "writer", "opencode.db"));
      expect(onWindows.instructionsFile).toBe(windows("D:", "Temp", "halonic-instructions.md"));
    });
  });
});
