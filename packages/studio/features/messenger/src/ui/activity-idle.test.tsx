// @vitest-environment jsdom
import type { TeamRun, TeamRuns } from "@halonicjs/ports";
import type { AgentActivity } from "@halonicjs/studio-services";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openChat, openMessenger, press, settle } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  localStorage.clear();
});

/** 14:09 local time. */
const now = () => new Date(2026, 10, 26, 14, 9);
const at = (hour: number, minute: number) => new Date(2026, 10, 26, hour, minute).toISOString();

function run(agent: string, id: string, fields: Partial<TeamRun>): TeamRun {
  return {
    id: `acme:run:${id}`,
    source: "acme",
    agent,
    task: { id: `acme:task:${id}`, identifier: `ACME-${id}`, title: "Ship the site" },
    state: "succeeded",
    canStop: false,
    ...fields,
  };
}

/** Liam's chat: his runs come from `runs`, which a test may change between reads. */
async function liamsChat(runs: { now: (agent: string) => TeamRun[] }) {
  const messaging = new FakeAgentMessaging({ now });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const liam = messaging.addAgent(source.id, { name: "Liam" });
  messaging.addConversation(liam.id, { title: "Reviews" });
  messaging.addWork(source.id, {
    label: "ACME-9",
    title: "Review the pricing page",
    assignee: liam.id,
    state: "todo",
  });
  const activity: AgentActivity = {
    runs: vi.fn(
      async (): Promise<TeamRuns[]> => [
        { source: source.id, asOf: now().toISOString(), runs: runs.now(liam.id), complete: true },
      ],
    ),
    pullRequests: vi.fn(async () => []),
  };
  const page = await openMessenger(messaging, [], false, now, activity);
  const box = await openChat(page, "Liam");
  return { page, box };
}

function panel(page: HTMLElement): HTMLElement | null {
  return page.querySelector('aside[id="messenger-activity"]');
}

/** Closes and opens the panel, which reads again. */
async function readAgain(page: HTMLElement): Promise<void> {
  const button = page.querySelector("header button[aria-controls='messenger-activity']");
  await press(button);
  await press(button);
}

const idle = (agent: string) => [
  run(agent, "8", { startedAt: at(13, 29), finishedAt: at(13, 41) }),
  run(agent, "5", { startedAt: at(11, 2), finishedAt: at(11, 11) }),
  run(agent, "3", { state: "cancelled", startedAt: at(8, 15), finishedAt: at(8, 20) }),
];

verifies("messenger.activity-idle", () => {
  describe("the activity panel of an idle agent", () => {
    it("shows the last run, Next and Earlier today", async () => {
      const { page } = await liamsChat({ now: idle });
      const aside = panel(page);
      expect(aside?.textContent).toContain("Idle · last run ended 13:41");
      expect(aside?.textContent).toContain("Last run");
      expect(aside?.textContent).toContain("13:29–13:41 · 12 min");
      expect(aside?.textContent).toContain("Next");
      expect(aside?.textContent).toContain("Review the pricing page");
      expect(aside?.textContent).toContain("ACME-9 · To do");
      const earlier = [...(aside?.querySelectorAll("section:last-of-type li") ?? [])];
      expect(earlier.map((each) => each.textContent)).toEqual([
        "Done: ACME-5 Ship the site11:02 · 9 min",
        "Stopped: ACME-3 Ship the site08:15 · 5 min",
      ]);
    });

    it("says it finished just now for 10 minutes after the run ended", async () => {
      const { page } = await liamsChat({
        now: (agent) => [run(agent, "8", { startedAt: at(14, 0), finishedAt: at(14, 5) })],
      });
      expect(panel(page)?.textContent).toContain("Idle · finished 14:05");
    });

    it("reads out once when a run starts and when it ends", async () => {
      const runs = { now: idle };
      const { page } = await liamsChat(runs);
      const status = () => panel(page)?.parentElement?.querySelector(":scope > [role='status']");
      expect(status()?.textContent).toBe("");
      runs.now = (agent) => [
        run(agent, "9", { state: "running", startedAt: at(14, 8), lastActivityAt: at(14, 9) }),
      ];
      await readAgain(page);
      expect(status()?.textContent).toBe("Liam started: ACME-9 Ship the site");
      runs.now = (agent) => [run(agent, "9", { startedAt: at(14, 8), finishedAt: at(14, 9) })];
      await readAgain(page);
      expect(status()?.textContent).toBe("Liam finished: ACME-9 Ship the site");
    });

    it("leaves Ctrl+I to the message box while the person types", async () => {
      const { page, box } = await liamsChat({ now: idle });
      await act(async () => {
        box.dispatchEvent(new KeyboardEvent("keydown", { key: "i", ctrlKey: true, bubbles: true }));
      });
      await settle();
      expect(panel(page)).not.toBeNull();
    });
  });
});
