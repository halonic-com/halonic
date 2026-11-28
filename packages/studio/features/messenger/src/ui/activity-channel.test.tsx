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
  const finished: TeamRun = {
    ...run(noah.id, "ACME-5"),
    id: "acme:run:noah-earlier",
    state: "succeeded",
    startedAt: at(11, 2),
    finishedAt: at(11, 11),
    lastActivityAt: at(11, 11),
  };
  const runs: TeamRuns[] = [
    {
      source: source.id,
      asOf: now().toISOString(),
      runs: [run(liam.id, "ACME-7"), run(chief.id, "ACME-8"), finished],
      complete: true,
    },
  ];
  const activity: AgentActivity = {
    runs: vi.fn(async () => runs),
    pullRequests: vi.fn(async () => []),
  };
  return { messaging, activity, finished };
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
      expect(panel(page)?.querySelector("h2")?.textContent).toBe("Activity in Launch");
      expect(lines(page)).toEqual(["Liam · Working on ACME-7", "Noah · Idle"]);
      await press(panel(page)?.querySelector("[data-agent-line]"));
      expect(panel(page)?.textContent).toContain("Liam's activity");
      expect(panel(page)?.textContent).toContain("Working · for 7 min");
      expect(panel(page)?.textContent).toContain("ACME-7");
      expect(panel(page)?.textContent).not.toContain("Answering you");
      const back = document.activeElement;
      expect(back?.textContent).toBe("‹ Channel");
      expect(back?.getAttribute("aria-label")).toBe("Back to the channel");
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

    it("reads the picked agent's runs on its own when the workspace's newest runs leave some out", async () => {
      const { messaging, activity, finished } = acme();
      const own = await activity.runs({ since: "" });
      // A busy day: the workspace's newest runs leave out Noah's earlier finished run, and say so.
      const isNoahs = (run: TeamRun) => run.id === finished.id;
      vi.mocked(activity.runs).mockImplementation(async ({ agent }) =>
        own.map((each) => {
          if (agent === undefined) {
            return { ...each, runs: each.runs.filter((run) => !isNoahs(run)), complete: false };
          }
          return { ...each, runs: each.runs.filter((run) => run.agent === agent) };
        }),
      );
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Launch");
      expect(lines(page)).toEqual(["Liam · Working on ACME-7", "Noah · Idle"]);
      // Only the workspace is read until an agent is picked: no read per agent.
      expect(
        vi.mocked(activity.runs).mock.calls.every(([query]) => query.agent === undefined),
      ).toBe(true);
      await press(panel(page)?.querySelectorAll("[data-agent-line]")[1]);
      await settle();
      const perAgent = vi.mocked(activity.runs).mock.calls.filter(([query]) => query.agent);
      expect(perAgent.length).toBeGreaterThan(0);
      expect(perAgent.every(([query]) => query.agent === finished.agent)).toBe(true);
      expect(panel(page)?.textContent).toContain("Idle · last run ended 11:11");
    });

    it("names the header button after the channel, with no 's", async () => {
      mediumWindow();
      const { messaging, activity } = acme();
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Launch");
      expect(headerButton(page)?.getAttribute("aria-label")).toBe("Activity in Launch, working");
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

verifies("messenger.activity-channel-states", () => {
  describe("a channel's list while it reads", () => {
    it("shows the agents' names with a bar for their status, and no Idle, until the first read", async () => {
      const { messaging, activity } = acme();
      vi.mocked(activity.runs).mockImplementation(() => new Promise(() => undefined));
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Launch");
      expect(lines(page)).toEqual(["Liam", "Noah"]);
      expect(panel(page)?.querySelector("ul")?.getAttribute("aria-busy")).toBe("true");
      expect(panel(page)?.querySelectorAll("[data-status-loading]")).toHaveLength(2);
      expect(panel(page)?.textContent).not.toContain("Idle");
    });

    it("says it couldn't read the channel's activity, with Try again", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { messaging, activity } = acme();
      const runs = await activity.runs({ since: "" });
      vi.mocked(activity.runs).mockRejectedValue(new Error("The agent host is down."));
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Launch");
      expect(panel(page)?.textContent).toContain("Couldn't read the activity in Launch");
      expect(lines(page)).toEqual([]);
      vi.mocked(activity.runs).mockResolvedValue(runs);
      const again = [...(panel(page)?.querySelectorAll("button") ?? [])].find(
        (button) => button.textContent === "Try again",
      );
      await press(again);
      await settle();
      expect(lines(page)).toEqual(["Liam · Working on ACME-7", "Noah · Idle"]);
    });

    it("keeps the lines under the stale line when a later read fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { messaging, activity } = acme();
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Launch");
      await press(panel(page)?.querySelector("[data-agent-line]"));
      vi.mocked(activity.runs).mockRejectedValue(new Error("The agent host is down."));
      // Going back reads the channel again, and that read fails.
      await press(panel(page)?.querySelector("[data-back-to-channel]"));
      await settle();
      expect(panel(page)?.textContent).toContain(
        "The engine isn't answering. Showing what it said last.",
      );
      expect(lines(page)).toEqual(["Liam · Working on ACME-7", "Noah · Idle"]);
    });

    it("marks each line as one that opens, with a chevron at its end", async () => {
      const { messaging, activity } = acme();
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Launch");
      const found = [...(panel(page)?.querySelectorAll("[data-agent-line]") ?? [])];
      expect(found.every((line) => line.lastElementChild?.querySelector("svg") !== null)).toBe(
        true,
      );
    });
  });

  describe("one back link per level", () => {
    it("puts ‹ Channel in the header, in place of a narrow window's ‹ Launch", async () => {
      const { messaging, activity } = acme();
      const page = await openMessenger(messaging, [], true, now, activity);
      await openChat(page, "Launch");
      await press(headerButton(page));
      const header = () => panel(page)?.firstElementChild;
      expect(header()?.textContent).toContain("‹ Launch");
      await press(panel(page)?.querySelector("[data-agent-line]"));
      expect(header()?.querySelector("[data-back-to-channel]")).not.toBeNull();
      expect(header()?.textContent).not.toContain("‹ Launch");
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Back to the channel");
    });

    it("closes and reopens a narrow window's agent view with Ctrl+I, focusing ‹ Channel", async () => {
      const { messaging, activity } = acme();
      const page = await openMessenger(messaging, [], true, now, activity);
      await openChat(page, "Launch");
      await press(headerButton(page));
      await press(panel(page)?.querySelector("[data-agent-line]"));
      await pressKey("i", { ctrlKey: true });
      expect(panel(page)).toBeNull();
      expect(document.activeElement).toBe(headerButton(page));
      await pressKey("i", { ctrlKey: true });
      expect(panel(page)?.textContent).toContain("Liam's activity");
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Back to the channel");
    });
  });
});
