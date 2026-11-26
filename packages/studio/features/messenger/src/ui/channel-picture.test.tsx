// @vitest-environment jsdom

import { agentTint } from "@halonicjs/studio-kit";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationRow } from "../messenger.ts";
import { byText, openChat, openMessenger } from "../test-support/page.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChatAvatar } from "./chat-avatar.tsx";

afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A made-up picture's bytes; the stubbed decoder below only checks they came through. */
const pictureBytes = new Uint8Array([137, 80, 78, 71]);

/**
 * Acme's channel Engineering: Chief leads it, Elena and Liam are members, in that order. With
 * `elenaPicture`, Elena has a picture.
 */
function engineering(elenaPicture = false) {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const picture = { name: "elena.png", type: "image/png", bytes: pictureBytes };
  const elena = messaging.addAgent(acme.id, {
    name: "Elena",
    ...(elenaPicture ? { picture } : {}),
  });
  const liam = messaging.addAgent(acme.id, { name: "Liam" });
  messaging.addConversation(chief.id, {
    title: "Engineering",
    members: [chief.id, elena.id, liam.id],
  });
  return { messaging, chief: chief.id, elena: elena.id };
}

/** A channel's picture in the list's row, or in the open chat's header. */
function channelPicture(page: HTMLElement, where: "row" | "header"): Element | null | undefined {
  if (where === "header") return page.querySelector("main header [data-channel-picture]");
  return byText(page, "nav li button", "Engineering")?.querySelector("[data-channel-picture]");
}

/** The initials' tile of the member drawn `at` the front or behind. */
function tile(picture: Element | null | undefined, at: "front" | "behind") {
  return picture?.querySelector(`[data-member="${at}"] > span`);
}

verifies("messenger.channel-picture", () => {
  describe("a channel's picture", () => {
    it("draws its lead Chief in front of Elena in its list row, each on their own tint", async () => {
      const { messaging, chief, elena } = engineering();
      const page = await openMessenger(messaging);
      const picture = channelPicture(page, "row");
      expect(picture?.getAttribute("aria-hidden")).toBe("true");
      const front = tile(picture, "front");
      const behind = tile(picture, "behind");
      expect(front?.textContent).toBe("C");
      expect(front?.className).toContain(agentTint(chief));
      expect(behind?.textContent).toBe("E");
      expect(behind?.className).toContain(agentTint(elena));
      // Chief's tile comes after Elena's, so it is painted over it, at the bottom right.
      const [first, second] = [...(picture?.children ?? [])];
      expect(first?.getAttribute("data-member")).toBe("behind");
      expect(second?.getAttribute("data-member")).toBe("front");
      expect(second?.className).toContain("right-0 bottom-0");
    });

    it("draws the same pair, smaller, in the open channel's header", async () => {
      const { messaging } = engineering();
      const page = await openMessenger(messaging);
      await openChat(page, "Engineering");
      const picture = channelPicture(page, "header");
      expect(tile(picture, "front")?.textContent).toBe("C");
      expect(tile(picture, "behind")?.textContent).toBe("E");
      expect(tile(picture, "front")?.className).toContain("size-7");
    });

    it("shows a member's own picture when it was read", async () => {
      vi.stubGlobal("createImageBitmap", () =>
        Promise.resolve({ width: 2, height: 2, close: () => {} }),
      );
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        drawImage: () => {},
      } as unknown as CanvasRenderingContext2D);
      const { messaging } = engineering(true);
      const reads = vi.spyOn(messaging, "readAttachment");
      const page = await openMessenger(messaging);
      const picture = channelPicture(page, "row");
      expect(picture?.querySelector('[data-member="behind"] canvas')).not.toBeNull();
      expect(tile(picture, "front")?.textContent).toBe("C");
      expect(reads).toHaveBeenCalledTimes(1);
    });

    it("shows a channel's one listed member alone, and its title's letters with none", () => {
      const chief = { id: "a1", source: "acme", name: "Chief", activity: "idle" } as const;
      const channel = (agents: ConversationRow["agents"]): ConversationRow => ({
        conversation: {
          id: "c1",
          source: "acme",
          agent: chief.id,
          members: [chief.id],
          title: "Engineering",
          updatedAt: "2026-11-25T10:00:00.000Z",
          waitingForMe: false,
        },
        agents,
        sourceAgents: agents,
        source: undefined,
      });
      const pictures = new Map<string, ImageBitmap>();
      const alone = render(
        <ChatAvatar row={channel([chief])} pictures={pictures} size="sidebar" />,
      );
      expect(alone.querySelector("[data-channel-picture]")).toBeNull();
      expect(alone.textContent).toBe("C");
      expect(alone.firstElementChild?.className).toContain(agentTint(chief.id));
      const empty = render(<ChatAvatar row={channel([])} pictures={pictures} size="sidebar" />);
      expect(empty.querySelector("[data-channel-picture]")).toBeNull();
      expect(empty.textContent).toBe("E");
      expect(empty.firstElementChild?.className).not.toMatch(/bg-agent-/);
    });
  });
});
