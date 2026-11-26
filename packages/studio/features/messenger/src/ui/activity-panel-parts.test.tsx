// @vitest-environment jsdom
import type { TeamRun } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, openChat, openMessenger, press } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  localStorage.clear();
});

const now = () => new Date(2026, 10, 26, 14, 9);
const at = (hour: number, minute: number) => new Date(2026, 10, 26, hour, minute).toISOString();

function run(agent: string, ended: Partial<TeamRun> = {}): TeamRun {
  // A queued run hasn't started.
  const started = ended.state === "queued" ? {} : { startedAt: at(14, 2) };
  return {
    id: "acme:run:3f9c2a71",
    source: "acme",
    agent,
    task: { id: "acme:task:7", identifier: "ACME-7", title: "Ship the site" },
    state: "running",
    ...started,
    lastActivityAt: at(14, 9),
    canStop: true,
    ...ended,
  } as TeamRun;
}

async function chiefsPanel(ended: Partial<TeamRun> = {}, agentWorking = false, narrow = false) {
  const messaging = new FakeAgentMessaging({ now });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  messaging.addConversation(chief.id, { title: "Where are we on the launch?", agentWorking });
  const activity = {
    runs: vi.fn(async () => [
      {
        source: source.id,
        asOf: now().toISOString(),
        runs: [run(chief.id, ended)],
        complete: true,
      },
    ]),
    pullRequests: vi.fn(async () => []),
  };
  const page = await openMessenger(messaging, [], narrow, now, activity);
  await openChat(page, "Chief");
  return page;
}

/** The task card, and its chip with `word`. */
function chip(page: HTMLElement, word: string) {
  const taskCard = page.querySelector<HTMLElement>("aside div.rounded-md");
  return { taskCard, chip: taskCard === null ? undefined : byText(taskCard, "span", word) };
}

verifies("messenger.activity-panel-parts", () => {
  describe("the activity panel's parts", () => {
    it("shows a running task's state as an In progress chip on the subtle fill", async () => {
      const { taskCard, chip: inProgress } = chip(await chiefsPanel(), "In progress");
      expect(taskCard?.textContent).toContain("ACME-7");
      expect(taskCard?.className).toContain("bg-surface-subtle");
      expect(inProgress?.className).toContain("bg-running-soft");
    });

    it("shows no chip while the run waits to start, under Starting", async () => {
      const page = await chiefsPanel({ state: "queued" });
      const { taskCard } = chip(page, "In progress");
      expect(page.querySelector("aside")?.textContent).toContain("Starting");
      expect(taskCard?.textContent).toContain("ACME-7");
      expect(taskCard?.textContent).not.toContain("In progress");
      expect(taskCard?.querySelector("[class*='-soft']")).toBeNull();
    });

    it("shows a failed run's state as a Failed chip in the danger tone", async () => {
      const page = await chiefsPanel({ state: "failed", finishedAt: at(14, 9) });
      expect(chip(page, "Failed").chip?.className).toContain("bg-danger-soft");
    });

    it("draws the header and close buttons as the kit's buttons, with a focus ring", async () => {
      const page = await chiefsPanel();
      const toggle = page.querySelector("header button[aria-controls='messenger-activity']");
      expect(toggle?.getAttribute("aria-pressed")).toBe("true");
      expect(toggle?.className).toContain("focus-ring");
      expect(toggle?.className).toContain("aria-pressed:bg-surface-muted");
      const close = page.querySelector('aside button[aria-label="Close activity"]');
      expect(close?.className).toContain("focus-ring");
      expect(close?.className).toContain("size-control-sm");
    });

    it("gives Show activity the kit's focus ring once the panel is closed", async () => {
      const page = await chiefsPanel({}, true);
      await press(page.querySelector('aside button[aria-label="Close activity"]'));
      const show = byText(page, "main [data-typing] button", "Show activity");
      expect(show?.className).toContain("focus-ring");
    });

    it("gives a narrow window's ‹ Chief the kit's focus ring and a 24px target", async () => {
      const page = await chiefsPanel({}, false, true);
      await press(page.querySelector("header button[aria-controls='messenger-activity']"));
      const back = page.querySelector('aside button[aria-label="Back to Chief"]');
      expect(back?.className).toContain("focus-ring");
      expect(back?.className).toContain("min-h-6");
    });

    it("keeps the header button's 8px working dot and its kit tooltip once the panel is closed", async () => {
      const page = await chiefsPanel({}, true);
      await press(page.querySelector('aside button[aria-label="Close activity"]'));
      const toggle = page.querySelector("header button[aria-controls='messenger-activity']");
      expect(toggle?.querySelector("[data-activity-dot]")?.className).toContain("size-2");
      expect(toggle?.closest("[title]")).toBeNull();
      expect(toggle?.getAttribute("aria-describedby")).not.toBeNull();
    });
  });
});
