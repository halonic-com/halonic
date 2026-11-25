import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { searchForPalette } from "./palette-provider.ts";

verifies("search.palette", () => {
  it("finds a task as work that opens the Overview, with its source in the detail", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const task = messaging.addWork(acme.id, { label: "ACME-7", title: "Answer the click test" });

    const results = await searchForPalette(messaging, "click test");

    expect(results).toEqual([
      {
        item: { kind: "messaging-work", hub: acme.id, id: task.id },
        label: "ACME-7",
        detail: "Work · Paperclip · Acme",
        hubName: "Paperclip · Acme",
        description: "Answer the click test",
        place: "overview",
      },
    ]);
  });

  it("opens an agent on the Overview and an inbox item in the Inbox", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    messaging.addAgent(acme.id, { name: "Chief" });
    messaging.addInboxItem(acme.id, { question: "Can Chief ship on Friday?" });

    const results = await searchForPalette(messaging, "chief");

    expect(results.map((result) => [result.detail, result.place])).toEqual([
      ["Agent · Paperclip · Acme", "overview"],
      ["Inbox · Paperclip · Acme", "inbox"],
    ]);
  });

  it("leaves out chats and messages, which live in Messenger's own window", async () => {
    const messaging = new FakeAgentMessaging();
    const acme = messaging.addSource({ label: "Paperclip · Acme" });
    const chief = messaging.addAgent(acme.id, { name: "Chief" });
    messaging.addConversation(chief.id, { title: "Launch chat" });

    expect(await searchForPalette(messaging, "launch")).toEqual([]);
  });

  it("asks nothing for a blank query", async () => {
    const messaging = new FakeAgentMessaging();
    messaging.addSource({ label: "Paperclip · Acme" });

    expect(await searchForPalette(messaging, "   ")).toEqual([]);
  });
});
