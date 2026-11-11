import type { HarnessBridge, ProgramProbe, SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { codexEnvironment } from "./environment.ts";
import { codexHarness } from "./harness.ts";
import { codexSignIn } from "./sign-in-command.ts";

const bridge: HarnessBridge = { url: "http://127.0.0.1:4100", token: "made-up-token" };

/** A probe the sign-in never asks. */
const unusedProbe: ProgramProbe = { ask: async () => ({ status: "missing" }) };

const folders: Pick<SandboxProfile, "workingFolder" | "tempFolder" | "settingsFolder"> = {
  workingFolder: "/agents/writer/work",
  tempFolder: "/sessions/one/temp",
  settingsFolder: "/agents/writer/settings",
};

verifies("harness-codex.sign-in-command", () => {
  it("is `codex login`, pointed at the agent's folder through CODEX_HOME", () => {
    expect(codexSignIn).toEqual({
      program: "codex",
      args: ["login"],
      folderVariable: "CODEX_HOME",
    });
  });

  it("is the harness's sign-in", () => {
    expect(codexHarness({ probe: unusedProbe }).signIn).toBe(codexSignIn);
  });

  it("points at the folder the agent's runs get", () => {
    const environment = codexEnvironment(bridge, folders);

    expect(environment[codexSignIn.folderVariable]).toBe("/agents/writer/settings");
  });
});
