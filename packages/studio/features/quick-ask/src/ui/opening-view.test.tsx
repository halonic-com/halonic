// @vitest-environment jsdom
import type { ConversationRow } from "@halonicjs/studio-feature-messenger/api";
import { SKELETON_AFTER_MS } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openBox, settle } from "../test-support/box-page.tsx";
import { agent, chat, FakeMessenger } from "../test-support/fake-messenger.ts";
import { unmountAll } from "../test-support/render.tsx";

const hints = "Enterask" + "Tabanother agent" + "Escclose";

/** A Messenger whose chats arrive only when the test lets them. */
function slowMessenger() {
  const messenger = new FakeMessenger([chat(agent("Chief"))]);
  let arrive: (rows: readonly ConversationRow[]) => void = () => undefined;
  // Every read waits, as strict mode opens the box's session twice.
  vi.spyOn(messenger, "rows").mockReturnValue(
    new Promise((resolve) => {
      arrive = resolve;
    }),
  );
  return { messenger, arrive: () => arrive(messenger.chats) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

verifies("quick-ask.opening", () => {
  describe("while the box reads the agents", () => {
    it("shows the hint row at once, and nothing else for 300 ms", async () => {
      const { messenger } = slowMessenger();
      const { page } = await openBox(messenger);

      const dialog = page.querySelector('[role="dialog"]');
      expect(dialog?.querySelector("footer")?.textContent).toBe(hints);
      expect(page.querySelector("[data-opening]")?.getAttribute("aria-busy")).toBe("true");
      expect(page.querySelectorAll("[data-opening] span")).toHaveLength(0);
      expect(page.querySelector('[role="status"]')?.textContent).toBe("");
    });

    it("then shows skeleton bars in the question row's shape, read out as Loading your agents", async () => {
      const { messenger } = slowMessenger();
      const { page } = await openBox(messenger);
      await act(async () => vi.advanceTimersByTime(SKELETON_AFTER_MS));

      const bars = page.querySelectorAll('[data-opening] span[aria-hidden="true"]');
      expect(bars).toHaveLength(2);
      expect(bars[0]?.className).toContain("rounded-full");
      expect(page.querySelector('[role="status"]')?.textContent).toBe("Loading your agents");
      expect(page.querySelector("textarea")).toBeNull();
    });

    it("gives way to the text box once the agents arrive", async () => {
      const { messenger, arrive } = slowMessenger();
      const { page } = await openBox(messenger);
      await act(async () => vi.advanceTimersByTime(SKELETON_AFTER_MS));
      arrive();
      await settle();

      expect(page.querySelector("[data-opening]")).toBeNull();
      expect(page.querySelector("textarea")?.placeholder).toBe("Ask Chief anything");
    });
  });
});
