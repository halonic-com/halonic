// @vitest-environment jsdom
import type { MergeQueue, PullRequest } from "@halonicjs/ports";
import { FakeAgentMessaging, FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PullRequests } from "../pull-requests.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PullRequestsPage } from "./pull-requests-page.tsx";

afterEach(unmountAll);

const minutesAgo = (minutes: number) =>
  new Date(Date.parse("2026-11-24T13:00:00.000Z") - minutes * 60 * 1000).toISOString();
const agent = (name: string) => ({ kind: "agent" as const, agent: `acme-${name}`, name });

/** A source at 24 Nov 13:00 UTC; `add` returns the PR's id for the queue to name. */
function acme() {
  const team = new FakeTeamStatus({ now: () => new Date("2026-11-24T13:00:00.000Z") });
  const { source } = team.addSource();
  const add = (label: string, pullRequest: Partial<PullRequest> = {}) =>
    team.addPullRequest(source, { label, title: `feat(app): change ${label}`, ...pullRequest }).id;
  const queue = (set: Partial<MergeQueue>) => team.setMergeQueue(source, set);
  return { team, add, queue };
}

/** Renders the screen and lets its first read land; `opened` collects the links opened. */
async function open(
  fake: ReturnType<typeof acme>,
  options: { opened?: string[]; messaging?: FakeAgentMessaging } = {},
) {
  const pullRequests = new PullRequests(fake.team, options.messaging, {
    now: () => new Date("2026-11-24T13:00:00.000Z"),
    timeZone: "UTC",
  });
  const opener = {
    connectionOrigin: "https://paperclip.acme.test",
    open: (link: string) => options.opened?.push(link),
  };
  const page = render(
    <PullRequestsPage pullRequests={pullRequests} opener={opener} onLink={() => {}} />,
  );
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
  return page;
}

const text = (page: HTMLElement) => page.textContent ?? "";
const sectionNames = (page: HTMLElement) =>
  [...page.querySelectorAll("section")].map((each) => each.getAttribute("aria-label"));

/** The first element whose whole text, its children's text included, is exactly `words`. */
function withText(page: HTMLElement, words: string): HTMLElement {
  const found = [...page.querySelectorAll<HTMLElement>("*")].find(
    (each) => each.textContent === words,
  );
  if (found === undefined) throw new Error(`no element says ${words}`);
  return found;
}

/** The queue list's rows, header rows (with a heading) or PR rows. */
function queueListRows(page: HTMLElement, header: boolean): Element[] {
  const queue = page.querySelector('ul[aria-label="Queue"]');
  return [...(queue?.children ?? [])].filter(
    (row) => (row.querySelector("h2") !== null) === header,
  );
}

/** The queue list's header rows: their heading, and their chip's words and tone fill. */
function headerRows(page: HTMLElement) {
  return queueListRows(page, true).map((row) => {
    const chip = row.querySelector("h2 + span");
    return {
      name: row.querySelector("h2")?.textContent,
      chip: chip?.textContent,
      fill: chip?.className.match(/bg-[a-z]+-soft/)?.[0],
    };
  });
}

/** The queue's PR rows as their first cell (the position) and their number. */
function queueRows(page: HTMLElement) {
  return queueListRows(page, false).map((row) => [
    row.firstElementChild?.textContent,
    row.querySelector(".font-mono")?.textContent,
  ]);
}

/** Presses the tab whose spoken words are `label`, such as "Queue, 7". */
function pressTab(page: HTMLElement, label: string): void {
  const tab = [...page.querySelectorAll<HTMLElement>('[role="tab"]')].find((each) => {
    const copy = each.cloneNode(true) as HTMLElement;
    for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
    return copy.textContent === label;
  });
  if (tab === undefined) throw new Error(`no tab ${label}`);
  act(() => tab.click());
}

/** Seven PRs in three groups and two waiting: group 1 merging, groups 2 and 3 building. */
function sevenInTheQueue(fake: ReturnType<typeof acme>) {
  const inQueue = (label: string, position: number, group?: number) =>
    fake.add(label, {
      state: "in-queue",
      queue: group === undefined ? { position } : { position, group },
    });
  fake.queue({
    health: "running",
    runnerWaitMinutes: 0,
    medianMinutesToMerge: 22,
    groups: [
      { position: 1, state: "passed", since: minutesAgo(20), pullRequests: [inQueue("#1", 1, 1)] },
      {
        position: 2,
        state: "building",
        since: minutesAgo(9),
        pullRequests: [inQueue("#2", 2, 2), inQueue("#3", 3, 2), inQueue("#4", 4, 2)],
      },
      { position: 3, state: "building", since: minutesAgo(4), pullRequests: [inQueue("#5", 5, 3)] },
    ],
    waiting: [inQueue("#6", 6), inQueue("#7", 7)],
  });
}

verifies("team.merge-queue", () => {
  describe("PullRequestsPage merge queue (HAL-17515 P1, P6, P18–P22)", () => {
    it("says the running queue's health under the tabs", async () => {
      const fake = acme();
      sevenInTheQueue(fake);
      const page = await open(fake);
      expect(text(page)).toContain(
        "Merge queue: Running · 7 PRs · group 2 of 3 building · no runner wait",
      );
      pressTab(page, "All open, 7");
      expect(text(page)).toContain("Merge queue: Running · 7 PRs");
    });

    it("draws the health line in its own bordered band (P1)", async () => {
      const fake = acme();
      sevenInTheQueue(fake);
      const page = await open(fake);
      const band = withText(page, "Running").closest("div");
      expect(band?.textContent).toBe(
        "Merge queue: Running · 7 PRs · group 2 of 3 building · no runner wait",
      );
      expect(band?.className.split(" ")).toEqual(
        expect.arrayContaining(["rounded-md", "border", "bg-surface-subtle", "px-4", "py-3"]),
      );
    });

    it("says when runners are busy and when the queue has stopped", async () => {
      const fake = acme();
      fake.add("#8", { state: "draft" });
      fake.queue({ health: "runners-busy", runnerWaitMinutes: 12 });
      const busy = await open(fake);
      expect(text(busy)).toContain(
        "Merge queue: ⚠ Runners busy · longest wait 12 min · pushes are on hold",
      );
      fake.queue({ health: "stopped", waiting: [fake.add("#9", { state: "in-queue" })] });
      const stopped = await open(fake);
      expect(text(stopped)).toContain("Merge queue: ⚠ Stopped · 1 PR");
    });

    it("shows the groups in order, then the PRs waiting to enter", async () => {
      const fake = acme();
      sevenInTheQueue(fake);
      const page = await open(fake);
      pressTab(page, "Queue, 7");
      expect(text(page)).toContain(
        "Running · 7 PRs · no runner wait · median 22 min to merge today",
      );
      expect(headerRows(page)).toEqual([
        { name: "Group 1", chip: "ci-ok passed · merging", fill: "bg-success-soft" },
        { name: "Group 2", chip: "Building · 9 min", fill: "bg-running-soft" },
        { name: "Group 3", chip: "Building · 4 min", fill: "bg-running-soft" },
        { name: "Waiting to enter", chip: undefined, fill: undefined },
      ]);
      expect(queueRows(page)).toEqual(
        ["1", "2", "3", "4", "5", "6", "7"].map((position) => [position, `#${position}`]),
      );
      expect(text(page)).not.toContain("In the queue ·");
      expect(text(page)).toContain("queued ");
      expect(text(page)).toContain("Numbers are real positions.");
    });

    it("keeps each queued PR's task, or its GitHub link when it has none", async () => {
      const fake = acme();
      const messaging = new FakeAgentMessaging();
      const tasks = messaging.addSource({ label: "Paperclip · Acme" });
      const task = messaging.addWork(tasks.id, { label: "ACME-7", title: "A change" });
      const link = "https://github.com/acme/app/pull/2";
      const first = fake.add("#1", { state: "in-queue", author: agent("Bo"), work: task.id });
      const second = fake.add("#2", { state: "in-queue", author: agent("Kim"), webLink: link });
      fake.queue({ health: "running", waiting: [first, second] });
      const opened: string[] = [];
      const page = await open(fake, { opened, messaging });
      pressTab(page, "Queue, 2");
      const [withTask, withoutTask] = queueListRows(page, false).map((row) => row.textContent);
      expect(withTask).toContain("Bo · ACME-7");
      expect(withoutTask).toContain(`No task found for this branch Open in GitHub ↗ ${link}`);
      const button = [...page.querySelectorAll<HTMLElement>("li button")].find(
        (each) => each.textContent === "Open in GitHub ↗",
      );
      act(() => button?.click());
      expect(opened).toEqual([link]);
    });

    it("names a failed group's cause and the PRs taken out today", async () => {
      const fake = acme();
      const culprit = fake.add("#5655", {
        state: "dequeued",
        reason: "group failed",
        author: agent("Kim"),
      });
      const behind = ["#5660", "#5661", "#5662"].map((label) =>
        fake.add(label, { state: "in-queue" }),
      );
      fake.queue({
        health: "running",
        groups: [
          { position: 1, state: "failed", since: minutesAgo(25), pullRequests: [culprit] },
          { position: 2, state: "building", since: minutesAgo(5), pullRequests: behind },
        ],
        removedToday: [
          { pullRequest: culprit, at: minutesAgo(20), reason: "Group failed: typecheck" },
        ],
      });
      const page = await open(fake);
      pressTab(page, "Queue, 4");
      expect(headerRows(page)[0]).toEqual({
        name: "Group 1",
        chip: "Group failed: #5655",
        fill: "bg-danger-soft",
      });
      expect(text(page)).toContain("the 3 PRs behind it are being tested again");
      expect(text(page)).toContain(
        "The queue session named #5655 as the cause and took it out at 12:40.",
      );
      expect(sectionNames(page)).toContain("Taken out today (1)");
      const takenOut = page.querySelector('section[aria-label="Taken out today (1)"] li');
      expect(takenOut?.textContent).toBe("#5655 · Group failed: typecheck · 12:40 · Kim");
      expect(withText(page, "Group failed: typecheck").className).toContain("bg-danger-soft");
    });

    it("says the merge queue is empty, and when PRs show up there", async () => {
      const fake = acme();
      fake.add("#9", { state: "draft" });
      fake.queue({ health: "empty" });
      const page = await open(fake);
      expect(text(page)).toContain("The merge queue is empty.");
      expect(text(page)).not.toContain("Merge queue: ");
      pressTab(page, "Queue, 0");
      expect(text(page)).toContain(
        "The merge queue is empty. Approved PRs with a green ci-ok show up here once the queue session adds them.",
      );
    });

    it("lists the PRs merged today newest first, without closed ones", async () => {
      const fake = acme();
      fake.add("#10", { state: "merged", since: minutesAgo(115) });
      fake.add("#11", { state: "merged", since: minutesAgo(20) });
      fake.add("#12", { state: "closed", since: minutesAgo(10) });
      const page = await open(fake);
      pressTab(page, "Merged today, 2");
      expect(sectionNames(page)).toContain("Merged today · newest first");
      const rows = [...page.querySelectorAll("li")].map((li) => li.textContent ?? "");
      expect(rows.map((row) => row.slice(0, 3))).toEqual(["#11", "#10"]);
      expect(rows[0]).toContain("Merged 12:40");
      expect(rows[1]).toContain("Merged 11:05");
    });
  });
});
