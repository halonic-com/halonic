import type { ChatTurnText } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeHost } from "./fake-host.test-helper.ts";
import { createRemoteExecutor } from "./remote-executor.ts";

verifies("executor-remote.chat-text-stays", () => {
  // A listener with `toJSON` would be written into the body if the executor
  // left it to `JSON.stringify` to drop functions, so this one shows the
  // executor picks `onText` off itself.
  function serialisableListener(heard: ChatTurnText[]) {
    return Object.assign((text: ChatTurnText) => heard.push(text), {
      toJSON: () => "the onText listener",
    });
  }

  it("sends the turn without onText, even a listener that serialises", async () => {
    const host = fakeHost(() => Response.json({ content: "hi", model: "m", toolCalls: [] }));
    const executor = createRemoteExecutor({
      baseUrl: "http://127.0.0.1:4173",
      fetch: host.fetch,
      reportError: () => {},
    });
    const heard: ChatTurnText[] = [];

    const answer = await executor.chatTurn({
      hubId: "acme",
      messages: [],
      tools: [],
      onText: serialisableListener(heard),
    });

    expect(answer.content).toBe("hi");
    expect(host.calls[0]?.body).toEqual({ hubId: "acme", messages: [], tools: [] });
    expect(JSON.stringify(host.calls[0]?.body)).not.toContain("onText");
    expect(heard).toEqual([]);
  });
});
