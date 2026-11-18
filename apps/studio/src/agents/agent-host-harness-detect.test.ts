import type { AgentHostAnswer, AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { agentHostHarnessDetect } from "./agent-host-harness-detect.ts";

verifies("studio.workspace-agents", () => {
  it("asks the agent host to detect the chosen harness and passes its answer on", async () => {
    const asked: unknown[] = [];
    const answer: AgentHostAnswer = { status: 200, body: { status: "ready", version: "2.1.0" } };
    const transport: AgentHostTransport = {
      request: async (route, body) => {
        asked.push([route, body]);
        return answer;
      },
      stream: () => Promise.reject(new Error("This test streams nothing.")),
    };
    const detect = agentHostHarnessDetect(transport);
    expect(await detect("claude-code")).toEqual({ status: "ready", version: "2.1.0" });
    expect(asked).toEqual([["POST /v1/harnesses/detect", { harness: "claude-code" }]]);
  });
});
