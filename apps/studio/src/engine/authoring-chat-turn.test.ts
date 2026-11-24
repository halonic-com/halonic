import {
  type ChatAgentSettings,
  type ChatTurnRequest,
  type HttpClient,
  noKeyOrigins,
  type ToolDefinition,
} from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { authoringChatExecutor, authoringToolNames } from "./authoring-chat-turn.ts";

/** What the model server was sent: the address, the headers and the body of each call. */
interface Sent {
  readonly url: string;
  readonly init: RequestInit | undefined;
  readonly body: { model: string; tools?: { function: { name: string } }[] };
}

/** An OpenAI-style model server that streams "Done." and keeps what each call sent. */
function modelServer() {
  const sent: Sent[] = [];
  const http: HttpClient = {
    fetch: async (url, init) => {
      sent.push({ url, init, body: JSON.parse(String(init?.body)) });
      const chunk = { choices: [{ delta: { content: "Done." }, finish_reason: "stop" }] };
      const events = `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
      return new Response(events, { headers: { "content-type": "text/event-stream" } });
    },
  };
  return { http, sent };
}

/** The person's own model from Settings › Assistant, at their own address. */
const own: ChatAgentSettings = {
  type: "openai-compatible",
  model: "acme-small",
  local: false,
  baseUrl: "https://llm.acme.test/v1",
  secret: "ACME_KEY",
};

const tool = (name: string): ToolDefinition => ({
  name,
  description: name,
  parameters: { type: "object", properties: {} },
});

/** A Build chat's turn before trust: the Settings model and the six authoring tools. */
const turn: ChatTurnRequest = {
  hubId: "support",
  agent: own,
  messages: [{ role: "user", content: "Add a routine" }],
  tools: authoringToolNames.map(tool),
};

function executor(http: HttpClient) {
  return authoringChatExecutor({
    secrets: { get: async () => "fake-acme-key" },
    keyOrigins: noKeyOrigins,
    http,
    clock: fixedClock(),
    localOnly: false,
  });
}

verifies("studio.assistant-authoring-turn", () => {
  describe("a Build chat's turn before trust", () => {
    it("calls the Settings model at its address, with exactly the six authoring tools", async () => {
      const { http, sent } = modelServer();
      const answer = await executor(http).chatTurn(turn);
      expect(answer.content).toBe("Done.");
      expect(sent).toHaveLength(1);
      expect(sent[0]?.url).toBe("https://llm.acme.test/v1/chat/completions");
      expect(sent[0]?.body.model).toBe("acme-small");
      // Exactly these: no connector, MCP, memory, knowledge or fetch tool (Julian, HAL-17474).
      expect(sent[0]?.body.tools?.map((each) => each.function.name)).toEqual([
        ...authoringToolNames,
      ]);
      expect(new Headers(sent[0]?.init?.headers).get("authorization")).toBe("Bearer fake-acme-key");
      // A redirect would carry the key to another address; the shell also drops it on another origin.
      expect(sent[0]?.init?.redirect).toBe("error");
    });

    it("refuses, before any model call, a turn that names anything of the workspace's", async () => {
      const { http, sent } = modelServer();
      const refused: ChatTurnRequest[] = [
        { ...turn, alias: "smart" },
        { ...turn, agentId: "writer" },
        { ...turn, params: { temperature: 2 } },
        { hubId: "support", messages: turn.messages, tools: turn.tools },
      ];
      for (const request of refused) {
        await expect(executor(http).chatTurn(request)).rejects.toMatchObject({ kind: "denied" });
      }
      expect(sent).toEqual([]);
    });

    it("refuses a turn that offers any other set of tools than the six", async () => {
      const { http, sent } = modelServer();
      const sets = [
        [...turn.tools, tool("run_workflow")],
        turn.tools.slice(1),
        [...turn.tools.slice(1), tool("fetch")],
        [...turn.tools.slice(1), tool("read_file")],
      ];
      for (const tools of sets) {
        await expect(executor(http).chatTurn({ ...turn, tools })).rejects.toMatchObject({
          kind: "denied",
        });
      }
      expect(sent).toEqual([]);
    });

    it("refuses a key name of Halonic's own, before any model call", async () => {
      const { http, sent } = modelServer();
      const agent = { ...own, secret: "serve_password" };
      await expect(executor(http).chatTurn({ ...turn, agent })).rejects.toMatchObject({
        kind: "denied",
      });
      expect(sent).toEqual([]);
    });
  });
});
