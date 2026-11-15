import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { AgentHostChat } from "./chat.ts";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";

const route = "POST /v1/models/chat";
const answer = {
  content: "A summary.",
  toolCalls: [],
  usage: { inputTokens: 5, outputTokens: 3 },
  finishReason: "stop",
};
const request = {
  model: "llama3",
  messages: [{ role: "user" as const, content: "Hi" }],
  params: { maxTokens: 300 },
};

verifies("agent-host-client.chat", () => {
  describe("chat", () => {
    it("sends the folder, the provider's id and the text, and answers the response", async () => {
      const host = new FakeHost().answer(route, ok(answer));

      const response = await new AgentHostChat(host, "/work/acme").chat("ollama", request);

      expect(response).toEqual(answer);
      expect(host.calls).toEqual([
        {
          route,
          body: { workspaceRoot: "/work/acme", provider: "ollama", request },
        },
      ]);
    });

    it("leaves out what the host doesn't take", async () => {
      const host = new FakeHost().answer(route, ok(answer));

      await new AgentHostChat(host, "/work/acme").chat("ollama", {
        ...request,
        tools: [{ name: "t", description: "d", parameters: {} }],
        meta: { agentId: "a" },
      });

      expect(host.calls[0]?.body).toEqual({
        workspaceRoot: "/work/acme",
        provider: "ollama",
        request,
      });
    });

    it("fails with the host's kind when the provider isn't on this computer", async () => {
      const host = new FakeHost().answer(
        route,
        refused(403, "provider_not_on_this_machine", "Not local."),
      );

      await expect(
        new AgentHostChat(host, "/work/acme").chat("cloud", request),
      ).rejects.toMatchObject({ status: 403, kind: "provider_not_on_this_machine" });
    });

    it("fails with answer_invalid for an answer that isn't a chat response", async () => {
      const host = new FakeHost().answer(route, ok({ text: "x" }));

      await expect(
        new AgentHostChat(host, "/work/acme").chat("ollama", request),
      ).rejects.toMatchObject({ kind: "answer_invalid" });
    });
  });
});
