import type {
  AgentHostAnswer,
  AgentHostRequestRoute,
  AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { HarnessAgent } from "@halonicjs/engine";
import type { BridgeApprovals, BridgeRecorder, SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { openStudioHarnessHost, type StudioHarnessInput } from "./studio-harness-host.ts";

const location = "/acme";

/** The bridge's stream: its lines, then open until `until` settles, as the host keeps it while a call waits. */
function bridgeStream(lines: unknown[], until: Promise<void>): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* lines;
      await until;
    },
  };
}

/** An agent host that offers Claude Code and an srt sandbox, and records the bridge's answers. */
function fakeHost(
  more: Partial<Record<AgentHostRequestRoute, (body: unknown) => AgentHostAnswer>> = {},
) {
  const answers: unknown[] = [];
  const asked: string[] = [];
  const answered = Promise.withResolvers<void>();
  const routes: Partial<Record<AgentHostRequestRoute, (body: unknown) => AgentHostAnswer>> = {
    "GET /v1/harnesses": () => ({
      status: 200,
      body: [{ id: "claude-code", name: "Claude Code" }],
    }),
    "GET /v1/sandbox/capabilities": () => ({
      status: 200,
      body: { files: "shared", strength: "os" },
    }),
    "POST /v1/proposals/start": () => ({ status: 200, body: {} }),
    "POST /v1/bridge/answer": (body) => {
      answers.push(body);
      answered.resolve();
      return { status: 200, body: {} };
    },
    "POST /v1/bridge/close": () => ({ status: 200, body: {} }),
    ...more,
  };
  const transport: AgentHostTransport = {
    request: async (route, body) => {
      asked.push(route);
      const answer = routes[route];
      if (answer === undefined) throw new Error(`This test's host has no ${route}.`);
      return answer(body);
    },
    stream: async () => ({
      ok: true,
      lines: bridgeStream(
        [
          { type: "opened", bridge: "b1", url: "http://127.0.0.1:4100", token: "t1" },
          {
            type: "call",
            call: "c1",
            method: "approvals.request",
            params: { callId: "toolu_1", tool: "Bash", args: { command: "ls" } },
          },
        ],
        answered.promise,
      ),
    }),
  };
  return { transport, answers, asked };
}

function inputOn(
  host: ReturnType<typeof fakeHost>,
  more: Partial<StudioHarnessInput> = {},
): StudioHarnessInput {
  return {
    transport: host.transport,
    location,
    definitions: new MemoryDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      "hubs/support/agents/coder.agent.yaml": "id: coder\nname: Coder\nharness: claude-code\n",
      "library/skills/tone/SKILL.md": "---\nname: Tone\ndescription: Shared.\n---\nShared tone.\n",
      "hubs/support/library/skills/tone/SKILL.md":
        "---\nname: Tone\ndescription: The hub's.\n---\nThe hub's tone.\n",
    }),
    digest: { sha256: async () => new Uint8Array(32) },
    clock: { now: () => new Date("2026-11-18T10:00:00.000Z") },
    instructionTrust: { check: async () => ({ kind: "trusted" }) },
    approvalsOf: () => undefined,
    reportError: () => {},
    ...more,
  };
}

const agent = { runId: "run_1", agentId: "coder" } as HarnessAgent;
const recorder: BridgeRecorder = { record: async () => {} };

/** Opens the agent's bridge, waits for its one approval call to be answered, then closes it. */
async function answerOfApproval(host: ReturnType<typeof fakeHost>, input: StudioHarnessInput) {
  const built = await openStudioHarnessHost(input);
  const bridge = await built.harnesses.bridges.open(agent, recorder);
  await bridge.close();
  return host.answers;
}

verifies("studio.engine-service", () => {
  describe("the Studio's harness host", () => {
    it("runs the agent host's harnesses in its sandbox", async () => {
      const built = await openStudioHarnessHost(inputOn(fakeHost()));
      expect(Object.keys(built.harnesses.harnesses)).toEqual(["claude-code"]);
      expect(built.harnesses.sandboxes.sandbox.capabilities()).toEqual({
        files: "shared",
        strength: "os",
      });
    });

    it("refuses an agent set to run on this computer, before its program starts", async () => {
      const built = await openStudioHarnessHost(inputOn(fakeHost()));
      const unfenced = built.harnesses.sandboxes["this-computer"];
      expect((await unfenced.check()).ok).toBe(false);
      await expect(unfenced.open({} as SandboxProfile)).rejects.toThrow(/only in the sandbox/);
    });

    it("asks the run's own approvals for a bridge's approval", async () => {
      const asked: string[] = [];
      const approvals: BridgeApprovals = {
        request: async (request) => {
          asked.push(request.callId);
          return { approved: false };
        },
      };
      const host = fakeHost();
      const answers = await answerOfApproval(
        host,
        inputOn(host, { approvalsOf: (runId) => (runId === "run_1" ? approvals : undefined) }),
      );
      expect(asked).toEqual(["toolu_1"]);
      expect(answers).toEqual([{ bridge: "b1", call: "c1", result: { approved: false } }]);
    });

    it("refuses a bridge's approval when the run has no approvals, and never allows it", async () => {
      const host = fakeHost();
      const answers = await answerOfApproval(host, inputOn(host));
      expect(answers).toEqual([
        { bridge: "b1", call: "c1", error: expect.stringContaining("needs a person's OK") },
      ]);
    });

    it("writes the agent's instructions in the host, with the hub's own skill", async () => {
      const sent: unknown[] = [];
      const digest = `sha256:${"a".repeat(64)}`;
      const host = fakeHost({
        "POST /v1/harnesses/instructions": (body) => {
          sent.push(body);
          return {
            status: 200,
            body: { folder: "/data/i-1", pin: { digest, files: { "AGENTS.md": digest } } },
          };
        },
      });
      const built = await openStudioHarnessHost(inputOn(host));
      const withSkill = {
        hubId: "support",
        file: { instructions: "Be kind.\n", skills: ["tone"] },
      } as unknown as HarnessAgent;
      const open = await built.harnesses.instructions?.open(withSkill);
      expect(sent).toEqual([
        {
          workspace: location,
          files: [
            { name: "AGENTS.md", text: "Be kind.\n" },
            {
              name: "skills/tone/SKILL.md",
              text: "---\nname: Tone\ndescription: The hub's.\n---\nThe hub's tone.\n",
            },
          ],
        },
      ]);
      expect(open?.folder).toBe("/data/i-1");
    });

    it("checks a run's instructions against the person's trust, for this workspace", async () => {
      const instructionTrust = { check: async () => ({ kind: "trusted" as const }) };
      const built = await openStudioHarnessHost(inputOn(fakeHost(), { instructionTrust }));
      expect(built.harnesses.instructionTrust).toEqual({ service: instructionTrust, location });
    });

    it("reports a clean-up at the start that fails, and doesn't throw", async () => {
      const reported: unknown[] = [];
      const host = fakeHost({
        "POST /v1/proposals/start": () => ({ status: 500, body: { kind: "internal" } }),
      });
      const built = await openStudioHarnessHost(
        inputOn(host, { reportError: (error) => reported.push(error) }),
      );
      await built.start(new Set(["run_1"]));
      expect(reported).toHaveLength(1);
    });
  });
});
