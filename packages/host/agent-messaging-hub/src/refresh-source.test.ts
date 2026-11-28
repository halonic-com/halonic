import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type MessagingFailure, MessagingHub, type MessagingProvider } from "./messaging-hub.ts";

/** A fake whose `refreshNow` counts each call, and fails while `failing` is set. */
function refreshing(idPrefix: string) {
  const fake = new FakeAgentMessaging({ idPrefix });
  const state = { refreshed: 0, failing: false };
  const messaging: MessagingProvider = Object.assign(fake, {
    refreshNow: async () => {
      state.refreshed += 1;
      if (state.failing) throw new Error("Paperclip answered 503");
    },
  });
  return { fake, messaging, state };
}

/** Acme and Globex, each with one item, joined by a hub that records what it reports. */
function twoSources() {
  const acme = refreshing("a");
  const globex = refreshing("b");
  const acmeItem = acme.fake.addInboxItem(acme.fake.addSource({ label: "Acme" }).id, {
    question: "Hire Iris?",
  });
  globex.fake.addInboxItem(globex.fake.addSource({ label: "Globex" }).id, { question: "Ship?" });
  const failures: MessagingFailure[] = [];
  const hub = new MessagingHub({
    providers: [
      { name: "acme", messaging: acme.messaging },
      { name: "globex", messaging: globex.messaging },
    ],
    report: (failure) => failures.push(failure),
  });
  return { acme, globex, acmeItem, hub, failures };
}

verifies("agent-host.risky-answer-confirm", () => {
  describe("reading an item's source again, now", () => {
    it("reads only the provider that listed the item", async () => {
      const { acme, globex, acmeItem, hub } = twoSources();

      await hub.refreshSourceOf(acmeItem.id);

      expect(acme.state.refreshed).toBe(1);
      expect(globex.state.refreshed).toBe(0);
    });

    it("throws that provider's failure rather than only reporting it", async () => {
      const { acme, acmeItem, hub, failures } = twoSources();
      acme.state.failing = true;

      await expect(hub.refreshSourceOf(acmeItem.id)).rejects.toThrow("503");
      expect(failures).toEqual([]);
    });

    it("reads nothing for an item no provider listed", async () => {
      const { acme, globex, hub } = twoSources();

      await hub.refreshSourceOf("nobody:item:1");

      expect(acme.state.refreshed + globex.state.refreshed).toBe(0);
    });
  });
});
