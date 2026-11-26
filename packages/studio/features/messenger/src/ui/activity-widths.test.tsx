// @vitest-environment jsdom
import type { Conversation, TeamRun, TeamRuns } from "@halonicjs/ports";
import type { AgentActivity } from "@halonicjs/studio-services";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, openChat, openMessenger, press, settle } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** 14:09 local time, 7 minutes after Chief's run started. */
const now = () => new Date(2026, 10, 26, 14, 9);
const at = (hour: number, minute: number) => new Date(2026, 10, 26, hour, minute).toISOString();

/** Chief working on ACME-7, and holding ACME-9 for **Next**. */
function acme(conversation: Partial<Conversation> = {}) {
  const messaging = new FakeAgentMessaging({ now });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  messaging.addConversation(chief.id, { title: "Where are we on the launch?", ...conversation });
  messaging.addWork(source.id, {
    label: "ACME-9",
    title: "Review the pricing page",
    assignee: chief.id,
    state: "todo",
  });
  const run: TeamRun = {
    id: "acme:run:3f9c2a71",
    source: source.id,
    agent: chief.id,
    task: { id: "acme:task:7", identifier: "ACME-7", title: "Ship the site" },
    state: "running",
    startedAt: at(14, 2),
    lastActivityAt: at(14, 9),
    canStop: false,
  };
  const runs: TeamRuns[] = [
    { source: source.id, asOf: now().toISOString(), runs: [run], complete: true },
  ];
  const activity: AgentActivity = {
    runs: vi.fn(async () => runs),
    pullRequests: vi.fn(async () => []),
  };
  return { messaging, activity };
}

/** A window from 900 to 1199 px wide: the wide query doesn't match. */
function mediumWindow(): void {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function panel(page: HTMLElement): HTMLElement | null {
  return page.querySelector('aside[id="messenger-activity"]');
}

function button(page: HTMLElement): HTMLButtonElement | null {
  return page.querySelector("header button[aria-controls='messenger-activity']");
}

verifies("messenger.activity-widths", () => {
  describe("the activity panel in a medium window", () => {
    it("starts closed, opens as a sheet over the chat, and closes with Esc", async () => {
      mediumWindow();
      const { messaging, activity } = acme();
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Chief");
      expect(panel(page)).toBeNull();
      expect(button(page)?.querySelector("[data-activity-dot]")).not.toBeNull();
      await press(button(page));
      const sheet = panel(page);
      expect(sheet?.className).toContain("absolute");
      expect(sheet?.textContent).toContain("Working · for 7 min");
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Close activity");
      await act(async () => {
        sheet?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      await settle();
      expect(panel(page)).toBeNull();
      expect(document.activeElement).toBe(button(page));
      expect(localStorage.getItem("halonic.messenger.activity-open")).toBeNull();
    });
  });

  describe("the activity panel in a narrow window", () => {
    it("shows instead of the chat, and ‹ Chief brings the chat back as it was", async () => {
      const { messaging, activity } = acme();
      const page = await openMessenger(messaging, [], true, now, activity);
      const box = await openChat(page, "Chief");
      box.value = "Half a thought";
      expect(panel(page)).toBeNull();
      await press(button(page));
      expect(panel(page)?.textContent).toContain("Working · for 7 min");
      expect(box.closest(".hidden")).not.toBeNull();
      const back = document.activeElement;
      expect(back?.getAttribute("aria-label")).toBe("Back to Chief");
      expect(back?.textContent).toBe("‹ Chief");
      await press(back);
      expect(panel(page)).toBeNull();
      expect(box.isConnected).toBe(true);
      expect(box.closest(".hidden")).toBeNull();
      expect(box.value).toBe("Half a thought");
      expect(document.activeElement).toBe(button(page));
    });

    it("opens from Show activity on the working line", async () => {
      const { messaging, activity } = acme({ agentWorking: true });
      const page = await openMessenger(messaging, [], true, now, activity);
      await openChat(page, "Chief");
      await press(byText(page, "main [data-typing] button", "Show activity"));
      expect(panel(page)).not.toBeNull();
    });
  });

  describe("a failed read of the agent's tasks", () => {
    it("leaves Next empty and shows the rest", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { messaging, activity } = acme();
      vi.spyOn(messaging, "listWork").mockRejectedValue(new Error("socket closed"));
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Chief");
      expect(panel(page)?.textContent).toContain("Working · for 7 min");
      expect(panel(page)?.textContent).not.toContain("Next");
      expect(console.error).toHaveBeenCalledWith(
        "The Messenger couldn't read the agent's tasks:",
        expect.any(Error),
      );
    });
  });
});
