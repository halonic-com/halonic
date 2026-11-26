// @vitest-environment jsdom
import type { PullRequest, WorkItem } from "@halonicjs/ports";
import { FakeAgentMessaging, FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PullRequests } from "../pull-requests.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PullRequestsPage } from "./pull-requests-page.tsx";

afterEach(unmountAll);

const now = "2026-11-24T13:00:00.000Z";
const minutesAgo = (minutes: number) =>
  new Date(Date.parse(now) - minutes * 60 * 1000).toISOString();
const agent = (name: string) => ({ kind: "agent" as const, agent: `acme-${name}`, name });

/** A source at 24 Nov 13:00 UTC, with tasks in `messaging`. */
function acme() {
  const team = new FakeTeamStatus({ now: () => new Date(now) });
  const { source } = team.addSource();
  const messaging = new FakeAgentMessaging();
  const tasks = messaging.addSource({ label: "Paperclip · Acme" });
  const add = (label: string, pullRequest: Partial<PullRequest> = {}) =>
    team.addPullRequest(source, { label, title: `feat(app): change ${label}`, ...pullRequest }).id;
  const task = (label: string, work: Partial<WorkItem> = {}) =>
    messaging.addWork(tasks.id, { label, title: "A change", ...work }).id;
  const holder = (name: string) => messaging.addAgent(tasks.id, { name }).id;
  return { team, messaging, source, add, task, holder };
}

/** Renders the screen and lets every read land; `opened` collects the links opened. */
async function open(fake: ReturnType<typeof acme>, opened: string[] = []) {
  const pullRequests = new PullRequests(fake.team, fake.messaging, {
    now: () => new Date(now),
    timeZone: "UTC",
  });
  const opener = {
    connectionOrigin: "https://paperclip.acme.test",
    open: (link: string) => opened.push(link),
  };
  const page = render(<PullRequestsPage pullRequests={pullRequests} opener={opener} />);
  await settle();
  return page;
}

async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

/** The page that shows now: the PR's page once one is open, the lists otherwise. */
const shownMain = (page: HTMLElement) =>
  [...page.querySelectorAll("main")].find((main) => main.closest("[hidden]") === null);
const text = (page: HTMLElement) => shownMain(page)?.textContent ?? "";

/** Presses the button whose name (its label, or else its words) starts with `words`, on the page that shows now. */
async function press(page: HTMLElement, words: string) {
  const buttons = [...(shownMain(page)?.querySelectorAll<HTMLElement>("button") ?? [])];
  const button = buttons.find((each) =>
    (each.getAttribute("aria-label") ?? each.textContent)?.startsWith(words),
  );
  if (button === undefined) throw new Error(`no button says ${words}`);
  act(() => button.click());
  await settle();
}

/** The Review, Queue and Task facts as term and words. */
const facts = (page: HTMLElement) =>
  [...(shownMain(page)?.querySelectorAll("dt") ?? [])].map((term) => [
    term.textContent,
    term.nextElementSibling?.textContent,
  ]);

verifies("team.pull-request-detail", () => {
  describe("PullRequestsPage, one PR (HAL-17515 P12–P17)", () => {
    it("opens a failing PR's page with its header, stuck time, facts and timeline as plain text", async () => {
      const fake = acme();
      const id = fake.add("#5641", {
        title: "feat(inbox): bundle cards",
        author: agent("Ravi"),
        work: fake.task("ACME-17", { state: "in-progress", assignee: fake.holder("Ravi") }),
        state: "failing",
        reason: "typecheck",
        since: minutesAgo(120),
        changedLines: 312,
      });
      fake.team.addPullRequestEvent(id, {
        kind: "out-of-draft",
        text: "Out of draft",
        at: minutesAgo(150),
      });
      fake.team.addPullRequestEvent(id, {
        kind: "check-failed",
        text: "[x](javascript:alert(1))",
        at: minutesAgo(120),
      });
      const page = await open(fake);
      await press(page, "#5641");
      expect(shownMain(page)?.querySelector("h1")?.textContent).toBe(
        "#5641 feat(inbox): bundle cards",
      );
      expect(text(page)).toContain("Ravi · task ACME-17 · 312 lines");
      expect(text(page)).toContain("✕ Failing: typecheck · 2 h");
      expect(text(page)).toContain("Stuck since 11:00");
      expect(facts(page)).toEqual([
        ["Review", "Not asked yet (needs a green ci-ok first)"],
        ["Queue", "Not in the queue"],
        ["Task", "ACME-17 · in progress · Ravi"],
      ]);
      const timeline = shownMain(page)?.querySelector("section");
      expect(timeline?.getAttribute("aria-labelledby")).toBe(timeline?.querySelector("h2")?.id);
      const steps = [...(timeline?.querySelectorAll("li") ?? [])];
      expect(steps.map((step) => step.textContent)).toEqual([
        "10:30Out of draft",
        "11:00[x](javascript:alert(1))",
      ]);
      expect(shownMain(page)?.querySelector("a")).toBeNull();
      expect(text(page)).toContain(
        "Read-only: nothing merges, queues, labels, approves, closes or reruns from here.",
      );
    });

    it("says a queued PR's place, its group's run and who approved it", async () => {
      const fake = acme();
      const first = fake.add("#1", {
        state: "in-queue",
        queue: { position: 1, group: 1 },
        reviewer: agent("Julian"),
      });
      const second = fake.add("#2", { state: "in-queue", queue: { position: 2, group: 1 } });
      fake.team.setMergeQueue(fake.source, {
        health: "running",
        groups: [
          { position: 1, state: "building", since: minutesAgo(9), pullRequests: [first, second] },
        ],
      });
      const page = await open(fake);
      await press(page, "#1");
      expect(facts(page)).toEqual([
        ["Review", "Approved by Julian on the current head"],
        ["Queue", "1 of 2 · group 1 · ci-ok running 9 min"],
        ["Task", "No task found for this branch"],
      ]);
    });

    it("names the day of a time before today, and when a fast-track review is due", async () => {
      const fake = acme();
      const id = fake.add("#7", {
        state: "waiting-for-review",
        fastTrack: true,
        since: "2026-11-22T13:00:00.000Z",
      });
      fake.team.addPullRequestEvent(id, {
        kind: "other",
        text: "Fast-track label added",
        at: minutesAgo(5),
      });
      fake.team.addPullRequestEvent(id, {
        kind: "out-of-draft",
        text: "Out of draft",
        at: "2026-11-22T13:00:00.000Z",
      });
      const page = await open(fake);
      await press(page, "#7");
      expect(text(page)).toContain(
        "Stuck since Sun 13:00 · Fast-track review is due within 30 min",
      );
      const steps = [...(shownMain(page)?.querySelectorAll("section li") ?? [])];
      expect(steps.map((step) => step.textContent)).toEqual([
        "12:55Fast-track label added",
        "Sun 13:00Out of draft",
      ]);
    });

    it("says who approved a PR taken out of the queue, and when", async () => {
      const fake = acme();
      fake.add("#8", { state: "dequeued", reviewer: agent("Liam"), since: minutesAgo(140) });
      const page = await open(fake);
      await press(page, "#8");
      expect(facts(page).slice(0, 2)).toEqual([
        ["Review", "Approved by Liam"],
        ["Queue", "Taken out at 10:40"],
      ]);
    });

    it("shows a merged PR's merge time", async () => {
      const fake = acme();
      fake.add("#9", { state: "merged", since: "2026-11-24T12:40:00.000Z" });
      const page = await open(fake);
      await press(page, "Merged today");
      await press(page, "#9");
      expect(text(page)).toContain("Merged 12:40");
    });

    it("opens GitHub for a PR with a task, with the full link shown, and nothing else", async () => {
      const fake = acme();
      const link = "https://github.com/acme/app/pull/5641";
      fake.add("#5641", {
        state: "failing",
        since: minutesAgo(120),
        work: fake.task("ACME-17"),
        webLink: link,
      });
      const opened: string[] = [];
      const page = await open(fake, opened);
      await press(page, "#5641");
      expect(text(page)).toContain(`Open in GitHub ↗ ${link}`);
      await press(page, "Open in GitHub ↗");
      expect(opened).toEqual([link]);
    });

    it("goes back to the list and focuses the title that opened the page", async () => {
      const fake = acme();
      fake.add("#5641", { state: "failing", since: minutesAgo(120) });
      const page = await open(fake);
      await press(page, "#5641");
      await press(page, "Back to Pull requests");
      expect(shownMain(page)?.querySelector("h1")?.textContent).toContain("Pull requests");
      expect(document.activeElement?.textContent).toContain("#5641");
    });

    it("focuses the title again when coming back to the same PR a second time", async () => {
      const fake = acme();
      fake.add("#5641", { state: "failing", since: minutesAgo(120) });
      const page = await open(fake);
      await press(page, "#5641");
      await press(page, "Back to Pull requests");
      await press(page, "#5641");
      expect(document.activeElement?.tagName).toBe("H1");
      await press(page, "Back to Pull requests");
      expect(document.activeElement?.textContent).toContain("#5641");
    });
  });
});

verifies("team.merge-queue", () => {
  it("shows each queued PR's time in the queue, never a time to merge", async () => {
    const fake = acme();
    const id = fake.add("#3", { state: "in-queue", queue: { position: 1 }, since: minutesAgo(31) });
    fake.team.setMergeQueue(fake.source, { health: "running", waiting: [id] });
    const page = await open(fake);
    await press(page, "Queue");
    expect(text(page)).toContain("queued 31 min");
    expect(text(page)).toContain(
      "Numbers are real positions. A time to merge shows only when GitHub gives one; it is never guessed.",
    );
    expect(text(page)).not.toMatch(/ETA|merges (in|at|around)/);
  });
});
