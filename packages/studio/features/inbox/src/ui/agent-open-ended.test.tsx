// @vitest-environment jsdom

import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(() => {
  unmountAll();
});

// Local times, so the test reads the same in every time zone. Tue 24 Nov 2026.
const asked = new Date(2026, 10, 24, 10, 0);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The Inbox with Ada's open card "Ship the release?" open in its pane. */
async function openCard() {
  const messaging = new FakeAgentMessaging({ now: () => asked });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const item = messaging.addInboxItem(source.id, {
    question: "Ship the release?",
    from: { kind: "person", name: "Ada" },
  });
  const root = render(
    <InboxView inbox={new Inbox(fakeRuns([]).runs)} now={() => asked} agentMessaging={messaging} />,
  );
  await settled();
  const cell = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
  await act(async () => cell?.click());
  await settled();
  return { root, messaging, item };
}

const buttons = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll("section button")].filter((each) => each.textContent === name);

const bar = (root: HTMLElement) => root.querySelector("section > div:last-child");

verifies("inbox.final-state-open", () => {
  describe("the open card, once its item ended elsewhere", () => {
    it("stays open, and its bar says it was approved, by whom and when, without the buttons", async () => {
      const { root, messaging, item } = await openCard();

      await act(async () =>
        messaging.answerElsewhere(
          item.id,
          { kind: "person", name: "Liam" },
          { kind: "option", option: "approve" },
        ),
      );
      await settled();

      expect(root.querySelector("section h2")?.textContent).toBe("Ship the release?");
      expect(bar(root)?.textContent).toBe("Approved by Liam · 10:00");
      expect(buttons(root, "Yes")).toEqual([]);
      expect(buttons(root, "No")).toEqual([]);
    });

    it("says Cancelled or Expired for an item that ended without an answer", async () => {
      const cancelled = await openCard();
      await act(async () => cancelled.messaging.closeElsewhere(cancelled.item.id, "cancelled"));
      await settled();
      expect(bar(cancelled.root)?.textContent).toBe("Cancelled · 10:00");
      expect(buttons(cancelled.root, "Yes")).toEqual([]);
      unmountAll();

      const expired = await openCard();
      await act(async () =>
        expired.messaging.closeElsewhere(expired.item.id, "expired", {
          kind: "person",
          name: "Ada",
        }),
      );
      await settled();
      expect(bar(expired.root)?.textContent).toBe("Expired by Ada · 10:00");
    });

    it("says how it was answered when its line says only Answered", async () => {
      const { root, messaging, item } = await openCard();

      await act(async () =>
        messaging.answerElsewhere(
          item.id,
          { kind: "person", name: "Liam" },
          { kind: "option", option: "no" },
        ),
      );
      await settled();

      expect(bar(root)?.textContent).toBe("Answered by Liam · 10:00No");
    });

    it("moves the focus to the line when it was on a button that went", async () => {
      const { root, messaging, item } = await openCard();
      buttons(root, "Yes")[0]?.closest("button")?.focus();

      await act(async () => messaging.closeElsewhere(item.id, "cancelled"));
      await settled();

      expect(document.activeElement?.textContent).toBe("Cancelled · 10:00");
      // As wide as its chip, so the focus ring wraps the line rather than the whole bar.
      expect(document.activeElement?.classList).toContain("w-fit");
    });
  });
});
