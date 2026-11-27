import { type MessagingFailure, PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import type { OpenEvents } from "@halonicjs/host-paperclip-sync";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ConnectionEvents } from "./connection-events.ts";
import type { PaperclipProviderOptions } from "./paperclip-provider.ts";

const open: OpenEvents = () => ({ close: () => undefined });

/** What a key hand-over in Acme's workspace gives `connection`. */
function madeFor(connection: string): PaperclipProviderOptions {
  return {
    binding: { workspace: "acme-workspace", connection },
    keys: new PaperclipKeys(),
    label: connection,
    readNow: async () => undefined,
    reportUserRead: () => undefined,
  };
}

/** Live events whose `add` rejects for `failing`, recording the ids it adds and removes. */
function liveFailingFor(failing: string) {
  const added: string[] = [];
  const removed: string[] = [];
  const live = {
    add: async (id: string) => {
      if (id === failing) throw new Error("timer not set");
      added.push(id);
    },
    remove: async (id: string) => {
      removed.push(id);
    },
    countersFor: () => ({ applied: () => undefined }),
  };
  return { live, added, removed };
}

verifies("agent-host.paperclip-live-events", () => {
  describe("each connection's live events in a workspace", () => {
    it("a socket that fails to open on leaving a server is reported, and the next connection's still opens", async () => {
      const { live, added } = liveFailingFor("acme-cache/halonic");
      const failures: MessagingFailure[] = [];
      const events = new ConnectionEvents(
        {
          cacheFolder: "acme-cache",
          live,
          openEvents: () => open,
          report: (failure) => failures.push(failure),
        },
        true,
      );
      await events.follow("halonic", madeFor("halonic"));
      await events.follow("support", madeFor("support"));

      await events.setClosed(false);

      expect(added).toEqual(["acme-cache/support"]);
      expect(failures.map((failure) => `${failure.provider} ${failure.action}`)).toEqual([
        "paperclip:halonic live events",
      ]);
    });
  });
});

verifies("agent-host.paperclip-event-notice", () => {
  describe("which connections an early notice names", () => {
    const live = {
      add: async () => {},
      remove: async () => {},
      countersFor: () => ({ applied: () => undefined }),
    };
    const options = { cacheFolder: "acme-cache", live, openEvents: () => open, report: () => {} };

    it("names a followed connection whose events are in the batch, and no other", async () => {
      const events = new ConnectionEvents(options, false);
      await events.follow("halonic", madeFor("halonic"));
      await events.follow("support", madeFor("support"));

      expect(events.heard(["acme-cache/halonic"])).toEqual(["halonic"]);
    });

    it("names nothing while the workspace's engine is a server", async () => {
      const events = new ConnectionEvents(options, true);
      await events.follow("halonic", madeFor("halonic"));

      expect(events.heard(["acme-cache/halonic"])).toEqual([]);
    });

    it("names no connection that was disconnected", async () => {
      const events = new ConnectionEvents(options, false);
      await events.follow("halonic", madeFor("halonic"));
      await events.follow("halonic", undefined);

      expect(events.heard(["acme-cache/halonic"])).toEqual([]);
    });

    it("names nothing for the same connection's events in another workspace", async () => {
      const events = new ConnectionEvents(options, false);
      await events.follow("halonic", madeFor("halonic"));

      expect(events.heard(["other-cache/halonic"])).toEqual([]);
    });
  });
});
