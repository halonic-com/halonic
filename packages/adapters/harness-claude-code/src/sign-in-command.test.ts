import type { HarnessBridge, ProgramProbe, SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { claudeCodeEnvironment } from "./environment.ts";
import { claudeCodeHarness } from "./harness.ts";
import { claudeCodeSignIn } from "./sign-in-command.ts";

const bridge: HarnessBridge = { url: "http://127.0.0.1:4100", token: "made-up-token" };

/** A probe the sign-in never asks. */
const unusedProbe: ProgramProbe = { ask: async () => ({ status: "missing" }) };

const folders: Pick<SandboxProfile, "workingFolder" | "tempFolder" | "settingsFolder"> = {
  workingFolder: "/agents/writer/work",
  tempFolder: "/sessions/one/temp",
  settingsFolder: "/agents/writer/settings",
};

verifies("harness-claude-code.sign-in-command", () => {
  it("is `claude auth login`, pointed at the agent's folder through CLAUDE_CONFIG_DIR", () => {
    expect(claudeCodeSignIn).toEqual({
      program: "claude",
      args: ["auth", "login"],
      folderVariable: "CLAUDE_CONFIG_DIR",
    });
  });

  it("is the harness's sign-in", () => {
    expect(claudeCodeHarness({ probe: unusedProbe }).signIn).toBe(claudeCodeSignIn);
  });

  it("points at the folder the agent's runs get", () => {
    const environment = claudeCodeEnvironment(bridge, folders);

    expect(environment[claudeCodeSignIn.folderVariable]).toBe("/agents/writer/settings");
  });
});
