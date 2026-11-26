import type { AgentNotice, Notifier } from "@halonicjs/studio-services";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { followAgentNotices } from "./agent-notices.ts";

/** Keeps every notice with its click, and lets a test wait for the next one. */
class RecordingNotifier implements Notifier {
  readonly shown: { notice: AgentNotice; click: () => void }[] = [];
  #waiting: (() => void) | undefined;

  show(notice: AgentNotice, onClick: () => void): Promise<void> {
    this.shown.push({ notice, click: onClick });
    this.#waiting?.();
    return Promise.resolve();
  }

  async until(count: number): Promise<void> {
    while (this.shown.length < count) {
      await new Promise<void>((resolve) => {
        this.#waiting = resolve;
      });
    }
  }
}

/** A followed fake with one Paperclip source, and what the window was asked to open. */
function followed() {
  const messaging = new FakeAgentMessaging();
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const notifier = new RecordingNotifier();
  const requested: string[] = [];
  const places: string[] = [];
  const errors: unknown[] = [];
  const watch = followAgentNotices(messaging, notifier, {
    window: () => ({
      inbox: { requestOpen: (key) => requested.push(key) },
      openPlace: (place) => places.push(place),
    }),
    onError: (error) => errors.push(error),
  });
  return { messaging, source, notifier, requested, places, errors, watch };
}

verifies("inbox.agent-notifications-start", () => {
  describe("followAgentNotices", () => {
    it("shows a new card, and a click opens the Inbox on it", async () => {
      const { messaging, source, notifier, requested, places, errors, watch } = followed();
      await watch.ready;
      const card = messaging.addInboxItem(source.id, {
        question: "Ship the release?",
        from: { kind: "person", name: "Ops lead" },
      });
      await notifier.until(1);
      notifier.shown[0]?.click();
      await watch.stop();

      expect(notifier.shown.map((each) => each.notice.title)).toEqual(["New card from Ops lead"]);
      expect(requested).toEqual([`agent:${card.id}`]);
      expect(places).toEqual(["inbox"]);
      expect(errors).toEqual([]);
    });

    it("shows nothing once stopped", async () => {
      const { messaging, source, notifier, watch } = followed();
      await watch.ready;
      await watch.stop();
      messaging.addInboxItem(source.id, {
        question: "Ship it?",
        from: { kind: "person", name: "Ops lead" },
      });

      expect(notifier.shown).toEqual([]);
    });
  });
});
