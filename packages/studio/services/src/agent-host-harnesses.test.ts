import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { claudeCodeEnvironment } from "@halonicjs/adapter-harness-claude-code/environment";
import { codexEnvironment } from "@halonicjs/adapter-harness-codex/environment";
import type { HarnessBridge } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { studioHarnesses } from "./agent-host-harnesses.ts";

/** A host that only lists harnesses; nothing here starts a run. */
function hostListing(harnesses: { id: string; name: string }[]): AgentHostTransport {
  return {
    request: async () => ({ status: 200, body: harnesses }),
    stream: async () => {
      throw new Error("not used here");
    },
  };
}

const bridge: HarnessBridge = {
  url: "http://127.0.0.1:41817",
  token: "example-run-token", // a made-up value
};

const folders = {
  workingFolder: "/work",
  tempFolder: "/work/.tmp",
  settingsFolder: "/work/.settings",
};

verifies("services.agent-host-harnesses", () => {
  describe("studioHarnesses", () => {
    it("gives Claude Code and Codex their own environment functions", async () => {
      const transport = hostListing([
        { id: "claude-code", name: "Claude Code" },
        { id: "codex", name: "Codex" },
      ]);

      const [claudeCode, codex] = await studioHarnesses(transport, () => "b1");

      expect(claudeCode?.environment?.(bridge, folders)).toEqual(
        claudeCodeEnvironment(bridge, folders),
      );
      expect(codex?.environment?.(bridge, folders)).toEqual(codexEnvironment(bridge, folders));
    });

    it("leaves a harness it has no function for without an environment", async () => {
      const transport = hostListing([{ id: "other", name: "Other" }]);

      const [other] = await studioHarnesses(transport, () => "b1");

      expect(other?.id).toBe("other");
      expect(other?.environment).toBeUndefined();
    });
  });
});
