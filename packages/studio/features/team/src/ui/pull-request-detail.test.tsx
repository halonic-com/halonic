// @vitest-environment jsdom
import type { PullRequest, WorkItem } from "@halonicjs/ports";
import { agentTint, FormatLocaleProvider } from "@halonicjs/studio-kit";
import { FakeAgentMessaging, FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PullRequests } from "../pull-requests.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { boxFrame, listBox } from "./pr-list-parts.tsx";
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

/**
 * Renders the screen and lets every read land; `opened` collects the links opened, and `locale` is
 * the window's time format.
 */
async function open(fake: ReturnType<typeof acme>, opened: string[] = [], locale?: string) {
  const pullRequests = new PullRequests(fake.team, fake.messaging, {
    now: () => new Date(now),
    timeZone: "UTC",
  });
  const opener = {
    connectionOrigin: "https://paperclip.acme.test",
    open: (link: string) => opened.push(link),
  };
  const page = render(
    <FormatLocaleProvider locale={locale}>
      <PullRequestsPage pullRequests={pullRequests} opener={opener} />
    </FormatLocaleProvider>,
  );
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
      // An attention StatusChip with the clock, in the state row next to the state's own chip.
      const stuck = [...(shownMain(page)?.querySelectorAll("span.bg-attention-soft") ?? [])].find(
        (chip) => chip.textContent === "Stuck since 11:00",
      );
      expect(stuck?.querySelector("svg")).not.toBeNull();
      expect(stuck?.closest("div")?.textContent).toBe(
        "✕ Failing: typecheck · 2 hStuck since 11:00",
      );
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
      const dots = steps.map((step) => step.querySelector("[aria-hidden] > span")?.className);
      expect(dots.map((dot) => dot?.includes("bg-danger"))).toEqual([false, true]);
      expect(shownMain(page)?.querySelector("a")).toBeNull();
      expect(text(page)).toContain(
        "Read-only: nothing merges, queues, labels, approves, closes or reruns from here.",
      );
    });

    it("shows the timeline before the facts, each in a bordered box, as P12 does", async () => {
      const fake = acme();
      const id = fake.add("#5641", { state: "failing", since: minutesAgo(120) });
      fake.team.addPullRequestEvent(id, { kind: "other", text: "Opened", at: minutesAgo(150) });
      const page = await open(fake);
      await press(page, "#5641");
      // In the page's order: the timeline's list, then the facts.
      const boxes = [...(shownMain(page)?.querySelectorAll("section ol, dl") ?? [])];
      expect(boxes.map((box) => box.tagName)).toEqual(["OL", "DL"]);
      expect(boxes[0]?.className).toContain(boxFrame);
      expect(boxes[1]?.className).toBe(listBox);
    });

    it("draws the h1's number at the title's size and the timeline's times small, as P12 does", async () => {
      const fake = acme();
      const id = fake.add("#5641", { state: "failing", since: minutesAgo(120) });
      fake.team.addPullRequestEvent(id, { kind: "other", text: "Opened", at: minutesAgo(150) });
      const page = await open(fake);
      // On the list the row's number stays small text.
      const rowNumber = [...(shownMain(page)?.querySelectorAll("button span.font-mono") ?? [])];
      expect(rowNumber.map((label) => label.className.split(" "))).toEqual([
        expect.arrayContaining(["text-small", "text-fg-muted"]),
      ]);
      await press(page, "#5641");
      const number = shownMain(page)?.querySelector("h1 span.font-mono");
      expect(number?.textContent).toBe("#5641");
      expect(number?.className.split(" ")).toContain("text-fg-muted");
      // No size of its own, so it takes the h1's.
      expect(number?.className).not.toMatch(/\btext-(small|body|caption|title|display)/);
      const times = [...(shownMain(page)?.querySelectorAll("section li time") ?? [])];
      expect(times.map((time) => time.className.split(" "))).toEqual([
        expect.arrayContaining(["text-small", "text-fg-muted"]),
      ]);
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
      const stuck = [...(shownMain(page)?.querySelectorAll("span.bg-attention-soft") ?? [])].find(
        (chip) =>
          chip.textContent === "Stuck since Sun 13:00 · Fast-track review is due within 30 min",
      );
      // The row lets its chips shrink, so this long one wraps instead of running off a narrow page.
      expect(stuck?.parentElement?.className).toContain("*:min-w-0");
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

verifies("team.pull-request-author-line", () => {
  it("heads a PR with the kit's author line: the agent's own colour on a 40px avatar", async () => {
    const fake = acme();
    const failing = { state: "failing", reason: "typecheck", since: minutesAgo(120) } as const;
    fake.add("#5641", { ...failing, author: agent("Ravi"), changedLines: 312 });
    const page = await open(fake);
    await press(page, "#5641");
    const name = shownMain(page)?.querySelector("[data-author-name]");
    expect(name?.textContent).toBe("Ravi");
    expect(name?.className).toBe("font-semibold text-fg");
    const avatar = name?.closest("p")?.firstElementChild;
    expect(avatar?.className).toContain(agentTint("acme-Ravi"));
    expect(avatar?.className).toContain("size-10");
    expect(name?.closest("p")?.textContent).toBe("RRavi · 312 lines");
  });

  it("keeps a person's avatar neutral, with the name alone when nothing else is known", async () => {
    const fake = acme();
    fake.add("#7", {
      state: "failing",
      since: minutesAgo(120),
      author: { kind: "person", name: "outside contributor" },
    });
    const page = await open(fake);
    await press(page, "#7");
    const line = shownMain(page)?.querySelector("[data-author-name]")?.closest("p");
    expect(line?.firstElementChild?.className).toContain("bg-surface-muted");
    expect(line?.textContent).toBe("OCoutside contributor");
  });
});

verifies("team.short-times", () => {
  it("writes a merge time as the kit's short time, in the window's format", async () => {
    const fake = acme();
    fake.add("#9", { state: "merged", since: "2026-11-24T12:40:00.000Z" });
    fake.add("#10", { state: "merged", since: "2026-11-23T18:05:00.000Z" });
    const page = await open(fake, [], "en-US");
    await press(page, "Merged today");
    expect(text(page)).toContain("Merged 12:40 PM");
    expect(text(page)).toContain("Merged yesterday");
  });
});
