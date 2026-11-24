import { readdirSync, readFileSync } from "node:fs";
import type { HarnessBridge, HarnessTask, SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { claudeCodeEnvironment } from "./environment.ts";
import {
  estimatedStartingTokens,
  type StartingContextRecording,
  startingContextTargetTokens,
} from "./starting-context.ts";

const recordingsFolder = new URL("./fixtures/starting-context/", import.meta.url);
const probeWorkflow = new URL(
  "../../../../.github/workflows/cli-platform-probe.yml",
  import.meta.url,
);

/** Every recording of a pinned harness version's first calls. */
function recordings(): StartingContextRecording[] {
  return readdirSync(recordingsFolder)
    .filter((name) => name.endsWith(".json"))
    .map(
      (name) =>
        JSON.parse(
          readFileSync(new URL(name, recordingsFolder), "utf8"),
        ) as StartingContextRecording,
    );
}

const bridge: HarnessBridge = { url: "http://127.0.0.1:4100", token: "made-up-token" };
const folders: Pick<SandboxProfile, "tempFolder" | "settingsFolder"> = {
  tempFolder: "/sessions/one/temp",
  settingsFolder: "/agents/writer/settings",
};

verifies("harness-claude-code.starting-context", () => {
  describe("the starting context of each recorded Claude Code version", () => {
    it("has at least one recording", () => {
      expect(recordings().length).toBeGreaterThan(0);
    });

    // The repo pins only a minimum Claude Code version; the CLI platform probe
    // installs the one that runs, so a newer one there needs its own recording.
    it("has a recording of the version the CLI platform probe installs", () => {
      const workflow = readFileSync(probeWorkflow, "utf8");
      const probeVersion = /claude_code_version:[\s\S]*?default: "([^"]+)"/.exec(workflow)?.[1];
      expect(probeVersion, "the probe's claude_code_version default").toBeDefined();
      expect(recordings().map((recording) => recording.version)).toContain(probeVersion);
    });

    it.each<[string, Pick<HarnessTask, "model" | "modelForEveryCall">]>([
      ["Claude's own model", { model: "claude-sonnet-5-5" }],
      ["a model for every call", { model: "glm-5.3", modelForEveryCall: true }],
    ])("has a recording of the tool search setting the harness picks for %s", (_name, model) => {
      const setting = claudeCodeEnvironment(bridge, folders, model)["ENABLE_TOOL_SEARCH"] ?? "";
      for (const recording of recordings()) {
        expect(Object.keys(recording.firstCalls)).toContain(setting);
      }
    });

    it("stays under the target with the setting the harness picks for Claude's own models", () => {
      const setting =
        claudeCodeEnvironment(bridge, folders, { model: "claude-sonnet-5-5" })[
          "ENABLE_TOOL_SEARCH"
        ] ?? "";
      for (const recording of recordings()) {
        const firstCall = recording.firstCalls[setting];
        expect(firstCall, `${recording.version} has no first call for ${setting}`).toBeDefined();
        if (firstCall === undefined) continue;
        expect(estimatedStartingTokens(firstCall), recording.version).toBeLessThanOrEqual(
          startingContextTargetTokens,
        );
      }
    });

    it("counts the system, the messages and every tool definition", () => {
      const call = {
        systemCharacters: 35,
        messagesCharacters: 35,
        tools: [{ name: "Read", characters: 70 }],
      };
      expect(estimatedStartingTokens(call)).toBe(40);
    });
  });
});
