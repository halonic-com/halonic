import { join } from "node:path";
import type { HarnessBridge, ProgramProbe } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { opencodeStandInKey } from "./environment.ts";
import { opencodeHarness } from "./harness.ts";

const probe: ProgramProbe = {
  ask: async () => ({
    status: "ran",
    path: "/usr/local/bin/opencode",
    code: 0,
    stdout: "opencode v2.3.0\n",
    stderr: "",
  }),
};
const bridge: HarnessBridge = {
  url: "http://127.0.0.1:4100",
  token: "made-up-run-token",
  keyProviders: ["anthropic"],
};
const settingsFolder = join("/agents", "writer");
const folders = { workingFolder: "/work", tempFolder: join("/run", "tmp"), settingsFolder };

verifies("harness-opencode.harness", () => {
  describe("opencodeHarness", () => {
    const harness = opencodeHarness({ probe, platform: "linux" });

    it("is OpenCode, found with the probe, with no sign-in of its own", async () => {
      expect(harness.id).toBe("opencode");
      expect(harness.name).toBe("OpenCode");
      expect(await harness.detect()).toEqual({ status: "ready", version: "2.3.0" });
      expect(harness.signIn).toBeUndefined();
    });

    it("gives OpenCode the bridge's stand-in key and folders inside the agent's", () => {
      const environment =
        harness.environment?.(bridge, folders, { model: "deepseek/deepseek-v4.1-flash-1017" }) ??
        {};
      expect(environment["ANTHROPIC_API_KEY"]).toBe(opencodeStandInKey);
      expect(environment["OPENCODE_DB"]).toBe(join(settingsFolder, "opencode.db"));
    });
  });
});
