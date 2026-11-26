// @vitest-environment jsdom
import type { TeamRun, TeamRuns } from "@halonicjs/ports";
import type { AgentActivity } from "@halonicjs/studio-services";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openChat, openMessenger, press, pressKey, settle } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** 14:09 local time, 7 minutes after Liam's run started. */
const now = () => new Date(2026, 10, 26, 14, 9);
const at = (hour: number, minute: number) => new Date(2026, 10, 26, hour, minute).toISOString();

/** Acme's "Launch" channel: Liam leads and works on ACME-7, Noah is idle; Chief has a direct chat. */
function acme() {
  const messaging = new FakeAgentMessaging({ now });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const liam = messaging.addAgent(source.id, { name: "Liam" });
  const noah = messaging.addAgent(source.id, { name: "Noah" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  messaging.addConversation(liam.id, { title: "Launch", members: [liam.id, noah.id] });
  messaging.addConversation(chief.id, { title: "Where are we?" });
  const run = (agent: string, task: string): TeamRun => ({
    id: `acme:run:${agent}`,
    source: source.id,
    agent,
    task: { id: `acme:task:${task}`, identifier: task, title: "Ship the site" },
    state: "running",
    startedAt: at(14, 2),
    lastActivityAt: at(14, 9),
    canStop: false,
  });
  const runs: TeamRuns[] = [
    {
      source: source.id,
      asOf: now().toISOString(),
      runs: [run(liam.id, "ACME-7"), run(chief.id, "ACME-8")],
      complete: true,
    },
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

function headerButton(page: HTMLElement): HTMLButtonElement | null {
  return page.querySelector("header button[aria-controls='messenger-activity']");
}

function lines(page: HTMLElement): string[] {
  const found = panel(page)?.querySelectorAll("[data-agent-line]") ?? [];
  return [...found].map((line) => line.textContent ?? "");
}

verifies("messenger.activity-channel", () => {
  describe("a channel's activity panel", () => {
    it("lists the channel's agents, and picking one shows its view with ‹ Channel", async () => {
      const { messaging, activity } = acme();
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Launch");
      expect(activity.runs).toHaveBeenCalledWith({ since: expect.any(String) });
      expect(lines(page)).toEqual(["Liam · Working on ACME-7", "Noah · Idle"]);
      await press(panel(page)?.querySelector("[data-agent-line]"));
      expect(panel(page)?.textContent).toContain("Liam's activity");
      expect(panel(page)?.textContent).toContain("Working · for 7 min");
      expect(panel(page)?.textContent).toContain("ACME-7");
      expect(panel(page)?.textContent).not.toContain("Answering you");
      const back = document.activeElement;
      expect(back?.textContent).toBe("‹ Channel");
      await press(back);
      expect(lines(page)).toHaveLength(2);
      expect(document.activeElement?.textContent).toBe("Liam · Working on ACME-7");
    });

    it("rings the agent lines inside the list, which an outer ring would clip", async () => {
      const { messaging, activity } = acme();
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Launch");
      const found = [...(panel(page)?.querySelectorAll("button[data-agent-line]") ?? [])];
      expect(found).toHaveLength(2);
      expect(found.every((line) => line.classList.contains("focus-ring-inset"))).toBe(true);
    });

    it("shows the header button's dot while one of its agents works", async () => {
      mediumWindow();
      const { messaging, activity } = acme();
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Launch");
      expect(panel(page)).toBeNull();
      expect(headerButton(page)?.querySelector("[data-activity-dot]")).not.toBeNull();
    });
  });

  describe("Ctrl+I", () => {
    it("closes a sheet as × does, and puts focus back on the header button", async () => {
      mediumWindow();
      const { messaging, activity } = acme();
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Chief");
      await pressKey("i", { ctrlKey: true });
      expect(panel(page)?.className).toContain("absolute");
      await pressKey("i", { ctrlKey: true });
      await settle();
      expect(panel(page)).toBeNull();
      expect(document.activeElement).toBe(headerButton(page));
    });

    it("goes back from a narrow window's panel to the chat, with focus on the button", async () => {
      const { messaging, activity } = acme();
      const page = await openMessenger(messaging, [], true, now, activity);
      await openChat(page, "Chief");
      await press(headerButton(page));
      expect(panel(page)).not.toBeNull();
      await pressKey("i", { ctrlKey: true });
      expect(panel(page)).toBeNull();
      expect(document.activeElement).toBe(headerButton(page));
    });
  });
});
