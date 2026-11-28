// @vitest-environment jsdom
import type { Conversation, PullRequestList, TeamRun, TeamRuns } from "@halonicjs/ports";
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
  localStorage.clear();
});

/** 14:09 local time, 7 minutes after Chief's run started. */
const now = () => new Date(2026, 10, 26, 14, 9);
const at = (hour: number, minute: number) => new Date(2026, 10, 26, hour, minute).toISOString();

/** Chief's chat, and an activity reader that gives Chief's `runs` and pull request #12. */
function acme(runs: (chief: string) => TeamRun[], conversation: Partial<Conversation> = {}) {
  const messaging = new FakeAgentMessaging({ now });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  messaging.addConversation(chief.id, { title: "Where are we on the launch?", ...conversation });
  const pulls: PullRequestList[] = [
    {
      source: source.id,
      repo: "site",
      asOf: now().toISOString(),
      open: [
        {
          id: "acme:pr:12",
          source: source.id,
          repo: "site",
          label: "#12",
          title: "feat: the launch page",
          author: { kind: "agent", agent: chief.id, name: "Chief" },
          work: "acme:task:7",
          state: "approved",
          since: at(14, 5),
          fastTrack: false,
          webLink: "https://github.com/acme/site/pull/12",
        },
      ],
      recent: [],
    },
  ];
  const answer: TeamRuns[] = [
    { source: source.id, asOf: now().toISOString(), runs: runs(chief.id), complete: true },
  ];
  const activity: AgentActivity = {
    runs: vi.fn(async () => answer),
    pullRequests: vi.fn(async () => pulls),
  };
  return { messaging, activity };
}

function working(agent: string): TeamRun[] {
  return [
    {
      id: "acme:run:3f9c2a71",
      source: "acme",
      agent,
      task: { id: "acme:task:7", identifier: "ACME-7", title: "Ship the site" },
      state: "running",
      startedAt: at(14, 2),
      lastActivityAt: at(14, 9),
      canStop: true,
    },
  ];
}

async function chiefsChat(runs: (chief: string) => TeamRun[], conversation = {}) {
  const { messaging, activity } = acme(runs, conversation);
  const page = await openMessenger(messaging, [], false, now, activity);
  await openChat(page, "Chief");
  return { page, activity };
}

function panel(page: HTMLElement): HTMLElement | null {
  return page.querySelector('aside[id="messenger-activity"]');
}

function button(page: HTMLElement): HTMLButtonElement | null {
  return page.querySelector("header button[aria-controls='messenger-activity']");
}

verifies("messenger.activity-panel", () => {
  describe("the activity panel", () => {
    it("shows what Chief works on, for how long, and its pull requests, beside the chat", async () => {
      const { page, activity } = await chiefsChat(working);
      const aside = panel(page);
      expect(aside?.querySelector("h2")?.textContent).toBe("Chief's activity");
      expect(aside?.textContent).toContain("Working · for 7 min");
      expect(aside?.textContent).toContain("Last activity just now");
      expect(aside?.textContent).toContain("ACME-7");
      expect(aside?.textContent).toContain("Ship the site");
      expect(aside?.textContent).toContain("Started 14:02 · run 3f9c2a");
      expect(byText(page, "aside li", "#12 feat: the launch page")?.textContent).toContain(
        "Approved",
      );
      expect(activity.runs).toHaveBeenCalledWith(
        expect.objectContaining({ since: new Date(2026, 10, 26).toISOString() }),
      );
      expect(button(page)?.getAttribute("aria-pressed")).toBe("true");
    });

    it("says This chat · Answering you when the run answers this chat", async () => {
      const { page } = await chiefsChat(working, { agentWorking: true });
      expect(panel(page)?.textContent).toContain("This chat");
      expect(panel(page)?.textContent).toContain("Answering you");
      expect(panel(page)?.textContent).toContain("Where are we on the launch?");
    });

    it("closes, puts focus on its button, and offers Show activity while Chief works", async () => {
      const { page } = await chiefsChat(working, { agentWorking: true });
      await press(page.querySelector('aside button[aria-label="Close activity"]'));
      expect(panel(page)).toBeNull();
      expect(document.activeElement).toBe(button(page));
      expect(button(page)?.getAttribute("aria-pressed")).toBe("false");
      expect(button(page)?.getAttribute("aria-label")).toBe("Chief's activity, working");
      expect(button(page)?.querySelector("[data-activity-dot]")).not.toBeNull();
      expect(localStorage.getItem("halonic.messenger.activity-open")).toBe("closed");
      await press(byText(page, "main [data-typing] button", "Show activity"));
      expect(panel(page)).not.toBeNull();
      // Show activity is gone once the panel opens, so the focus moves into the panel.
      expect(panel(page)?.contains(document.activeElement)).toBe(true);
      expect(document.activeElement?.textContent).toBe("Chief's activity");
    });

    it("tells of its Ctrl+I shortcut on the header button", async () => {
      const { page } = await chiefsChat(working);
      expect(button(page)?.getAttribute("aria-keyshortcuts")).toBe("Control+I");
    });

    it("opens and closes with Ctrl+I, and stays as the person left it", async () => {
      localStorage.setItem("halonic.messenger.activity-open", "closed");
      const { page } = await chiefsChat(working);
      expect(panel(page)).toBeNull();
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", ctrlKey: true }));
      });
      await settle();
      expect(panel(page)).not.toBeNull();
    });

    it("shows the last run with its outcome once it ended", async () => {
      const { page } = await chiefsChat((agent) => [
        {
          ...working(agent)[0],
          state: "failed",
          finishedAt: at(14, 9),
        } as TeamRun,
      ]);
      const aside = panel(page);
      expect(aside?.textContent).toContain("Stopped with an error · 14:09");
      expect(aside?.textContent).toContain("Last run");
      expect(aside?.textContent).toContain("Failed");
      expect(aside?.textContent).toContain("14:02–14:09 · 7 min");
    });

    it("says it couldn't read the activity, with Try again", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { messaging, activity } = acme(working);
      const runs = vi.mocked(activity.runs);
      const answer = await runs({});
      runs.mockRejectedValue(new Error("socket closed"));
      const page = await openMessenger(messaging, [], false, now, activity);
      await openChat(page, "Chief");
      expect(panel(page)?.textContent).toContain("Couldn't read Chief's activity");
      runs.mockResolvedValue(answer);
      await press(byText(page, "aside button", "Try again"));
      expect(panel(page)?.textContent).toContain("Working · for 7 min");
    });

    it("isn't offered without an agent host's activity", async () => {
      const { messaging } = acme(working);
      const page = await openMessenger(messaging, [], false, now);
      await openChat(page, "Chief");
      expect(panel(page)).toBeNull();
      expect(button(page)).toBeNull();
    });
  });
});

verifies("messenger.framed-list", () => {
  it("shows the activity panel beside the chat past a 1px line, on the panel colour", async () => {
    const { page } = await chiefsChat(working);
    const aside = panel(page) as HTMLElement;
    const classes = aside.className.split(" ");

    expect(classes).toEqual(
      expect.arrayContaining(["w-80", "border-s", "border-border", "bg-app-panel"]),
    );
    expect(classes).not.toContain("rounded-lg");
    expect(classes).not.toContain("border");
    expect((aside.parentElement as HTMLElement).className.split(" ")).not.toContain("gap-2");
  });

  it("gives the activity panel's header the chat header's 64px beside the chat", async () => {
    const { page } = await chiefsChat(working);
    const header = (panel(page) as HTMLElement).firstElementChild as HTMLElement;
    expect(header.className.split(" ")).toContain("h-16");
  });
});
