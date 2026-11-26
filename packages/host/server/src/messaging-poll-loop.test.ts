import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { callMessaging } from "./messaging-client.test-helper.ts";
import { polledServer } from "./messaging-poll-loop.test-helper.ts";

const minute = 60 * 1000;

/**
 * The provider behind the loop: a fake with one source, whose `refresh` records the key it
 * would send with, as it is at that moment. Disconnect removes the key.
 */
function keyedProvider(key: string) {
  const fake = new FakeAgentMessaging();
  fake.addSource({ label: "Paperclip · Acme" });
  const state = { key: key as string | undefined, polls: [] as (string | undefined)[] };
  const refresh = async () => {
    state.polls.push(state.key);
  };
  return { fake, state, refresh };
}

/** One desktop's focus report through `POST /api/messaging/focus`. */
async function reportFocus(
  server: Server,
  headers: Record<string, string>,
  inFront = true,
): Promise<void> {
  const response = await callMessaging(server, "POST", "focus", { headers, body: { inFront } });
  expect(response.status).toBe(204);
}

verifies("server.messaging-rate", () => {
  describe("the server's one messaging poll loop", () => {
    it("polls twice in 10 minutes for three desktops that read every minute, none in focus", async () => {
      const provider = keyedProvider("key-acme");
      const { scheduler, sessions } = await polledServer(provider, 3);
      provider.state.polls.length = 0;

      for (let passed = 0; passed < 10; passed += 1) {
        await scheduler.pass(minute);
        for (const desktop of sessions) {
          await desktop.messaging.listInboxItems();
          await desktop.messaging.listConversations();
        }
      }

      expect(provider.state.polls).toHaveLength(2);
    });

    it("polls every 30 seconds while a desktop is in focus, and every 5 minutes 2 minutes after its last report", async () => {
      const provider = keyedProvider("key-acme");
      const { server, scheduler, sessions } = await polledServer(provider, 1);
      provider.state.polls.length = 0;
      const [desktop] = sessions;
      if (desktop === undefined) throw new Error("no desktop");

      await reportFocus(server, desktop.headers);
      await scheduler.pass(minute);
      expect(provider.state.polls).toHaveLength(2);

      await scheduler.pass(minute);
      expect(provider.state.polls).toHaveLength(4);

      await scheduler.pass(5 * minute - 1000);
      expect(provider.state.polls).toHaveLength(4);
      await scheduler.pass(1000);
      expect(provider.state.polls).toHaveLength(5);
    });

    it("doesn't speed up for a desktop that reports it went to the back", async () => {
      const provider = keyedProvider("key-acme");
      const { server, scheduler, sessions } = await polledServer(provider, 1);
      provider.state.polls.length = 0;
      const [desktop] = sessions;
      if (desktop === undefined) throw new Error("no desktop");

      await reportFocus(server, desktop.headers, false);
      await scheduler.pass(4 * minute);

      expect(provider.state.polls).toHaveLength(0);
    });

    it("answers the lists from the last poll, and polls again on the next read after a write", async () => {
      const provider = keyedProvider("key-acme");
      const { scheduler, sessions } = await polledServer(provider, 2);
      const [writer, reader] = sessions;
      if (writer === undefined || reader === undefined) throw new Error("no desktops");
      const [source] = await reader.messaging.listSources();
      if (source === undefined) throw new Error("no source");
      const chat = provider.fake.addConversation(
        provider.fake.addAgent(source.id, { name: "Chief" }).id,
      );
      provider.state.polls.length = 0;

      expect(await reader.messaging.listConversations()).toEqual([]);
      await writer.messaging.send(chat.id, "Hello");
      expect(await reader.messaging.listConversations()).toHaveLength(1);
      await reader.messaging.listConversations();

      expect(provider.state.polls).toHaveLength(1);
      await scheduler.pass(minute);
      expect(provider.state.polls).toHaveLength(1);
    });

    it("never polls with a key Disconnect removed, nor answers from a poll that started before", async () => {
      const provider = keyedProvider("key-acme");
      const { loop, scheduler, sessions } = await polledServer(provider, 1);
      const [desktop] = sessions;
      if (desktop === undefined) throw new Error("no desktop");
      let finishSlowPoll = () => {};
      const working = provider.refresh;
      provider.refresh = async () => {
        provider.refresh = working;
        await working();
        await new Promise<void>((resolve) => {
          finishSlowPoll = resolve;
        });
      };
      loop.invalidate();
      const slow = loop.snapshot();
      provider.state.polls.length = 0;

      provider.state.key = undefined;
      loop.invalidate();
      provider.fake.addSource({ label: "Paperclip · Globex" });
      const after = await desktop.messaging.listSources();
      finishSlowPoll();
      await slow;
      await scheduler.pass(20 * minute);

      expect(after).toHaveLength(2);
      expect(await desktop.messaging.listSources()).toHaveLength(2);
      expect(provider.state.polls.length).toBeGreaterThan(1);
      expect(provider.state.polls).not.toContain("key-acme");
    });

    it("reports a poll that failed and polls again at the next time", async () => {
      const provider = keyedProvider("key-acme");
      const { scheduler, errors } = await polledServer(provider, 1);
      const failure = new Error("Paperclip is down");
      const working = provider.refresh;
      provider.refresh = async () => {
        provider.refresh = working;
        throw failure;
      };

      await scheduler.pass(10 * minute);

      expect(errors).toEqual([failure]);
      expect(provider.state.polls).toHaveLength(2);
    });

    it("sets no timer once closed, not even for a poll that ends after", async () => {
      const provider = keyedProvider("key-acme");
      const { loop, scheduler, sessions, errors } = await polledServer(provider, 1);
      const [desktop] = sessions;
      if (desktop === undefined) throw new Error("no desktop");
      loop.invalidate();
      const reading = desktop.messaging.listSources();

      await loop.close();
      await reading;
      provider.state.polls.length = 0;
      await scheduler.pass(20 * minute);

      expect(errors).toEqual([]);
      expect(await scheduler.pending("messaging-poll")).toEqual([]);
      expect(provider.state.polls).toEqual([]);
    });
  });
});
