import type { AgentMessaging } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { callMessaging } from "./messaging-client.test-helper.ts";
import { polledServer } from "./messaging-poll-loop.test-helper.ts";
import { idlePollMs } from "./messaging-poll-loop.ts";

const minute = 60 * 1000;

/** The provider behind the loop: a fake with one source, whose `refresh` counts the polls. */
function countedProvider() {
  const fake = new FakeAgentMessaging();
  fake.addSource({ label: "Paperclip · Acme" });
  const state = { polls: 0 };
  const refresh = async () => {
    state.polls += 1;
  };
  return { fake, state, refresh };
}

/** A gate a test opens when it chooses; until then, whatever waits on it waits. */
function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/**
 * A Paperclip provider made with one key, as `serve` makes it: it can only ever call Paperclip
 * with that key. `calls` counts what reached it.
 */
function providerWithKey(label: string) {
  const fake = new FakeAgentMessaging();
  fake.addSource({ label });
  return { fake, calls: 0 };
}

type KeyedProvider = ReturnType<typeof providerWithKey>;

/**
 * The server's messaging as `serve` swaps it: every call goes to the provider of the moment,
 * which a sign-in or Disconnect replaces with one made from the keys stored then.
 */
function swappedSource(first: KeyedProvider) {
  const state = { current: first };
  const call = (name: string | symbol, args: unknown[]) => {
    const provider = state.current;
    provider.calls += 1;
    const method: unknown = Reflect.get(provider.fake, name);
    if (typeof method !== "function") throw new Error(`No method ${String(name)}`);
    return method.apply(provider.fake, args);
  };
  const fake = new Proxy({} as AgentMessaging, {
    get:
      (_target, name) =>
      (...args: unknown[]) =>
        call(name, args),
  });
  const refresh = async () => {
    state.current.calls += 1;
  };
  return { state, provider: { fake, refresh } };
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
      const provider = countedProvider();
      const { scheduler, sessions } = await polledServer(provider, 3);
      provider.state.polls = 0;

      for (let passed = 0; passed < 10; passed += 1) {
        await scheduler.pass(minute);
        for (const desktop of sessions) {
          await desktop.messaging.listInboxItems();
          await desktop.messaging.listConversations();
        }
      }

      expect(provider.state.polls).toBe(2);
    });

    it("polls every 30 seconds while a desktop is in focus, and every 5 minutes 2 minutes after its last report", async () => {
      const provider = countedProvider();
      const { server, scheduler, sessions } = await polledServer(provider, 1);
      provider.state.polls = 0;
      const [desktop] = sessions;
      if (desktop === undefined) throw new Error("no desktop");

      await reportFocus(server, desktop.headers);
      await scheduler.pass(minute);
      expect(provider.state.polls).toBe(2);

      await scheduler.pass(minute);
      expect(provider.state.polls).toBe(4);

      await scheduler.pass(5 * minute - 1000);
      expect(provider.state.polls).toBe(4);
      await scheduler.pass(1000);
      expect(provider.state.polls).toBe(5);
    });

    it("doesn't speed up for a desktop that reports it went to the back", async () => {
      const provider = countedProvider();
      const { server, scheduler, sessions } = await polledServer(provider, 1);
      provider.state.polls = 0;
      const [desktop] = sessions;
      if (desktop === undefined) throw new Error("no desktop");

      await reportFocus(server, desktop.headers, false);
      await scheduler.pass(4 * minute);

      expect(provider.state.polls).toBe(0);
    });

    it("answers the lists from the last poll, and polls again on the next read after a write", async () => {
      const provider = countedProvider();
      const { scheduler, sessions } = await polledServer(provider, 2);
      const [writer, reader] = sessions;
      if (writer === undefined || reader === undefined) throw new Error("no desktops");
      const [source] = await reader.messaging.listSources();
      if (source === undefined) throw new Error("no source");
      const chat = provider.fake.addConversation(
        provider.fake.addAgent(source.id, { name: "Chief" }).id,
      );
      provider.state.polls = 0;

      expect(await reader.messaging.listConversations()).toEqual([]);
      await writer.messaging.send(chat.id, "Hello");
      expect(await reader.messaging.listConversations()).toHaveLength(1);
      await reader.messaging.listConversations();

      expect(provider.state.polls).toBe(1);
      await scheduler.pass(minute);
      expect(provider.state.polls).toBe(1);
    });

    it("answers a read made when a poll names a change with the lists that poll reads", async () => {
      const provider = countedProvider();
      const { loop, scheduler, sessions } = await polledServer(provider, 1);
      const [desktop] = sessions;
      if (desktop === undefined) throw new Error("no desktop");
      const [source] = await desktop.messaging.listSources();
      if (source === undefined) throw new Error("no source");
      const chief = provider.fake.addAgent(source.id, { name: "Chief" });
      // The Paperclip provider names a change at the end of its `refresh`; the client reads at once.
      const named = gate();
      const working = provider.refresh;
      provider.refresh = async () => {
        provider.refresh = working;
        provider.fake.addConversation(chief.id);
        named.open();
      };
      // The poll's list reads answer only once the client's read has reached the loop.
      const reached = gate();
      const listConversations = provider.fake.listConversations.bind(provider.fake);
      provider.fake.listConversations = async () => {
        await reached.opened;
        return listConversations();
      };
      const list = loop.list.bind(loop);
      loop.list = (name) => {
        const answer = list(name);
        reached.open();
        return answer;
      };

      const passing = scheduler.pass(idlePollMs);
      await named.opened;
      const conversations = await desktop.messaging.listConversations();
      await passing;

      expect(conversations).toHaveLength(1);
    });

    it("answers a read made when one of two providers names a change while the other still refreshes", async () => {
      const provider = countedProvider();
      const { loop, scheduler, sessions } = await polledServer(provider, 1);
      const [desktop] = sessions;
      if (desktop === undefined) throw new Error("no desktop");
      const [source] = await desktop.messaging.listSources();
      if (source === undefined) throw new Error("no source");
      const chief = provider.fake.addAgent(source.id, { name: "Chief" });
      // The hub's `refresh`: Acme names its change, and Globex's `refresh` is held until the
      // client's read has reached the loop.
      const named = gate();
      const reached = gate();
      const working = provider.refresh;
      provider.refresh = async () => {
        provider.refresh = working;
        provider.fake.addConversation(chief.id);
        named.open();
        await reached.opened;
      };
      const list = loop.list.bind(loop);
      loop.list = (name) => {
        const answer = list(name);
        reached.open();
        return answer;
      };

      const passing = scheduler.pass(idlePollMs);
      await named.opened;
      const conversations = await desktop.messaging.listConversations();
      await passing;

      expect(conversations).toHaveLength(1);
    });

    it("keeps a list's last good value when only its read fails, and fails only that list when it has none", async () => {
      const provider = countedProvider();
      const { loop, scheduler, sessions, errors } = await polledServer(provider, 1);
      const [desktop] = sessions;
      if (desktop === undefined) throw new Error("no desktop");
      const [source] = await desktop.messaging.listSources();
      if (source === undefined) throw new Error("no source");
      const failure = new Error("Paperclip refused the work list");
      provider.fake.listWork = async () => {
        throw failure;
      };
      provider.fake.addConversation(provider.fake.addAgent(source.id, { name: "Chief" }).id);

      await scheduler.pass(idlePollMs);
      expect(await desktop.messaging.listConversations()).toHaveLength(1);
      expect(await desktop.messaging.listWork()).toEqual([]);
      expect(errors).toEqual([failure]);

      loop.invalidate();
      expect(await desktop.messaging.listConversations()).toHaveLength(1);
      await expect(loop.list("work")).rejects.toBe(failure);
    });

    it("never calls the provider Disconnect replaced, nor answers from a poll that started before", async () => {
      const acme = providerWithKey("Paperclip · Acme");
      const source = swappedSource(acme);
      const { loop, scheduler, sessions } = await polledServer(source.provider, 1);
      const [desktop] = sessions;
      if (desktop === undefined) throw new Error("no desktop");
      // The slow poll has read Acme's lists, and is held before it ends.
      const listed = gate();
      const held = gate();
      const listSources = acme.fake.listSources.bind(acme.fake);
      acme.fake.listSources = async () => {
        const sources = await listSources();
        listed.open();
        await held.opened;
        return sources;
      };
      loop.invalidate();
      const slow = loop.list("sources");
      await listed.opened;

      const globex = providerWithKey("Paperclip · Globex");
      source.state.current = globex;
      loop.invalidate();
      const acmeCallsAtDisconnect = acme.calls;
      const after = await desktop.messaging.listSources();
      held.open();
      await slow;
      const later = await desktop.messaging.listSources();
      await scheduler.pass(20 * minute);

      expect(after.map((each) => each.label)).toEqual(["Paperclip · Globex"]);
      expect(later.map((each) => each.label)).toEqual(["Paperclip · Globex"]);
      expect(acme.calls).toBe(acmeCallsAtDisconnect);
      expect(globex.calls).toBeGreaterThan(7);
    });

    it("reports a refresh that failed, still reads the lists, and polls again at the next time", async () => {
      const provider = countedProvider();
      const { scheduler, errors } = await polledServer(provider, 1);
      const failure = new Error("Paperclip is down");
      const working = provider.refresh;
      provider.refresh = async () => {
        provider.refresh = working;
        throw failure;
      };

      await scheduler.pass(10 * minute);

      expect(errors).toEqual([failure]);
      expect(provider.state.polls).toBe(2);
    });

    it("sets no timer once closed, not even for a poll that ends after", async () => {
      const provider = countedProvider();
      const { loop, scheduler, sessions, errors } = await polledServer(provider, 1);
      const [desktop] = sessions;
      if (desktop === undefined) throw new Error("no desktop");
      loop.invalidate();
      const reading = desktop.messaging.listSources();

      await loop.close();
      await reading;
      provider.state.polls = 0;
      await scheduler.pass(20 * minute);

      expect(errors).toEqual([]);
      expect(await scheduler.pending("messaging-poll")).toEqual([]);
      expect(provider.state.polls).toBe(0);
    });

    it("lets close return while a poll the timer started is still waiting on Paperclip", async () => {
      const provider = countedProvider();
      const { loop, scheduler } = await polledServer(provider, 1);
      const stalled = gate();
      const working = provider.refresh;
      provider.refresh = async () => {
        provider.refresh = working;
        await stalled.opened;
      };
      // A real scheduler's delivery ends when the listener's call does, and its close waits for it.
      scheduler.settled = async () => undefined;

      await scheduler.pass(idlePollMs);
      await loop.close();
      stalled.open();

      expect(scheduler.closed).toBe(true);
    });
  });
});
