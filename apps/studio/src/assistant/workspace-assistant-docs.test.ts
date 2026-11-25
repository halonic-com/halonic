import { MemoryChatSessions } from "@halonicjs/adapter-memory";
import type { HttpClient, SavedChatDocs, ToolCall } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answered, device, setup } from "./workspace-assistant.test-helper.ts";

const page = "https://docs.example.com/api";

/** A model turn that calls `read_docs` for `url` as the call `id`. */
const readDocs = (id: string, url = page): ToolCall => ({
  id,
  name: "read_docs",
  arguments: { url },
});

/** A docs client that answers every page with a little HTML, and the addresses it fetched. */
function docsSite() {
  const fetched: string[] = [];
  const http: HttpClient = {
    fetch: async (url) => {
      fetched.push(url);
      return new Response("<p>Sign in with a bearer token.</p>", {
        headers: { "content-type": "text/html" },
      });
    },
  };
  return { http, fetched };
}

/** The tools each model turn was offered, by name. */
const offered = (requests: { tools?: { name: string }[] }[]) =>
  requests.map((request) => (request.tools ?? []).map((tool) => tool.name));

verifies("studio.assistant-read-docs", () => {
  it("offers read_docs only once the workspace is trusted, and only with a docs client", async () => {
    const { http } = docsSite();
    const untrusted = setup({ trusted: false, settings: device, docs: { http } });
    const before = await untrusted.assistant.newChat("build");
    await untrusted.assistant.answer({ chatId: before.id, message: "Read the API docs" });
    const beforeTrust = offered(untrusted.turnRequests);
    expect(beforeTrust.flat()).not.toContain("read_docs");
    expect(beforeTrust[0]).toHaveLength(6);

    const trusted = setup({ docs: { http } });
    const after = await trusted.assistant.newChat("build");
    await trusted.assistant.answer({ chatId: after.id, message: "Read the API docs" });
    expect(offered(trusted.turnRequests)[0]).toContain("read_docs");

    const noShell = setup();
    const none = await noShell.assistant.newChat("build");
    await noShell.assistant.answer({ chatId: none.id, message: "Read the API docs" });
    expect(offered(noShell.turnRequests)[0]).not.toContain("read_docs");
  });

  it("reads a site only after Allow on its card, keeps that with the chat, and asks again in a new chat", async () => {
    const { http, fetched } = docsSite();
    const sessions = new MemoryChatSessions();
    const first = setup({
      sessions,
      docs: { http },
      turns: [
        answered("", [readDocs("d1")]),
        answered("Which page?"),
        answered("", [readDocs("d2")]),
        answered("Read it."),
      ],
    });
    const chat = await first.assistant.newChat("build");
    await first.assistant.answer({ chatId: chat.id, message: "Read the API docs" });
    // The first call asks: nothing is fetched, and the card sits under the call.
    expect(fetched).toEqual([]);
    expect((await first.assistant.chatDocs(chat.id)).sites).toEqual([
      { host: "docs.example.com", answer: "asked", cardId: "d1" },
    ]);
    await first.assistant.answerSite(chat.id, "d1", "allowed");
    await first.assistant.answer({ chatId: chat.id, message: "Allowed, go on" });
    expect(fetched).toEqual([page]);
    const kept = await first.assistant.chatDocs(chat.id);
    expect(kept.log.map(({ callId, outcome }) => [callId, outcome])).toEqual([
      ["d1", "waiting"],
      ["d2", "read"],
    ]);
    await first.assistant.saved();

    // Halonic opens the workspace again: the chat keeps its answers and its log.
    const again = setup({
      sessions,
      docs: { http },
      turns: [answered("", [readDocs("d3")]), answered("Read it again.")],
    });
    expect(await again.assistant.chatDocs(chat.id)).toEqual(kept);
    await again.assistant.answer({ chatId: chat.id, message: "Read it once more" });
    expect(fetched).toEqual([page, page]);

    // A new chat asks again, and Don't allow refuses the site for the rest of that chat.
    const next = setup({
      sessions,
      docs: { http },
      turns: [
        answered("", [readDocs("d4")]),
        answered("Which page?"),
        answered("", [readDocs("d5")]),
        answered("Then I'll work without it."),
      ],
    });
    const other = await next.assistant.newChat("build");
    await next.assistant.answer({ chatId: other.id, message: "Read the API docs" });
    const asked: SavedChatDocs = await next.assistant.chatDocs(other.id);
    expect(asked.sites).toEqual([{ host: "docs.example.com", answer: "asked", cardId: "d4" }]);
    await next.assistant.answerSite(other.id, "d4", "declined");
    await next.assistant.answer({ chatId: other.id, message: "No" });
    expect(fetched).toEqual([page, page]);
    const declined = await next.assistant.chatDocs(other.id);
    expect(declined.log.at(-1)).toMatchObject({ callId: "d5", outcome: "declined" });
    const result = (await next.assistant.chat(other.id)).messages.find(
      (message) => message.role === "tool" && message.toolCallId === "d5",
    );
    expect(result?.content).toContain("didn't allow reading pages from docs.example.com");
    // An answer stays for the rest of the chat, and a card the chat doesn't have isn't one.
    await expect(next.assistant.answerSite(other.id, "d4", "allowed")).rejects.toMatchObject({
      kind: "conflict",
    });
    await expect(next.assistant.answerSite(other.id, "d9", "allowed")).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});
