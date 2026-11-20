import type { AgentHostAnswer, AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agentHostHarnessParts } from "./agent-host-harness-parts.ts";

/** An invented workspace and the folder the host gives for the agent `writer` in it. */
const workspace = "/data/acme";
const settingsFolder = "/data/profile/workspaces/k1/harness-settings/writer/claude-code";
const writer = { hubId: "acme", id: "writer" };

/** A host that answers each route from `answers`, and keeps what it was asked. */
function hostAnswering(answers: Record<string, AgentHostAnswer>) {
  const asked: unknown[] = [];
  const transport: AgentHostTransport = {
    request: async (route, body) => {
      asked.push([route, body]);
      const answer = answers[route];
      if (answer === undefined) throw new Error(`This test has no answer for ${route}.`);
      return answer;
    },
    stream: () => Promise.reject(new Error("This test streams nothing.")),
  };
  return { transport, asked };
}

const folderAnswer: AgentHostAnswer = { status: 200, body: { settingsFolder } };

verifies("studio.workspace-agents", () => {
  it("asks the agent host to detect the chosen harness in the agent's own folder", async () => {
    const { transport, asked } = hostAnswering({
      "POST /v1/harnesses/settings-folder": folderAnswer,
      "POST /v1/harnesses/detect": {
        status: 200,
        body: { status: "signed-out", version: "2.1.0" },
      },
    });
    const parts = agentHostHarnessParts(transport, workspace);
    expect(await parts.detectHarness(writer, "claude-code")).toEqual({
      status: "signed-out",
      version: "2.1.0",
    });
    expect(asked).toEqual([
      [
        "POST /v1/harnesses/settings-folder",
        { workspace, agentId: "writer", harness: "claude-code" },
      ],
      ["POST /v1/harnesses/detect", { harness: "claude-code", settingsFolder }],
    ]);
  });
});

verifies("studio.workspace-agents-sign-in", () => {
  describe("openSignIn", () => {
    it("asks the agent host to open the sign-in in the agent's own folder", async () => {
      const { transport, asked } = hostAnswering({
        "POST /v1/harnesses/settings-folder": folderAnswer,
        "POST /v1/harnesses/sign-in": { status: 200, body: { opened: true } },
      });
      const parts = agentHostHarnessParts(transport, workspace);
      expect(await parts.openSignIn(writer, "claude-code")).toEqual({ opened: true });
      expect(asked).toContainEqual([
        "POST /v1/harnesses/sign-in",
        { harness: "claude-code", settingsFolder },
      ]);
    });

    it("opens nothing when the host can't give the agent's folder", async () => {
      const { transport, asked } = hostAnswering({
        "POST /v1/harnesses/settings-folder": {
          status: 404,
          body: { error: { kind: "unknown_workspace", message: "Not served." } },
        },
      });
      const parts = agentHostHarnessParts(transport, workspace);
      await expect(parts.openSignIn(writer, "claude-code")).rejects.toMatchObject({
        kind: "unknown_workspace",
      });
      expect(asked.map((call) => (call as [string])[0])).not.toContain(
        "POST /v1/harnesses/sign-in",
      );
    });
  });
});
