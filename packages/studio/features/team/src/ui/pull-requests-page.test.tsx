// @vitest-environment jsdom
import type { PullRequest } from "@halonicjs/ports";
import { FakeAgentMessaging, FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PullRequests } from "../pull-requests.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { WebLinkButton } from "./pull-request-row.tsx";
import { PullRequestsPage } from "./pull-requests-page.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

const origin = "https://paperclip.acme.test";
const minutesAgo = (minutes: number) =>
  new Date(Date.parse("2026-11-24T13:00:00.000Z") - minutes * 60 * 1000).toISOString();
const agent = (name: string) => ({ kind: "agent" as const, agent: `acme-${name}`, name });

/** A fake whose clock a test can move, starting at 24 Nov 13:00 UTC, with one source. */
function acme(parts: { pullRequests?: boolean } = {}) {
  let now = new Date("2026-11-24T13:00:00.000Z");
  const team = new FakeTeamStatus({ now: () => now });
  const { source } = team.addSource(parts);
  const add = (label: string, pullRequest: Partial<PullRequest>) =>
    team.addPullRequest(source, { label, title: `feat(app): change ${label}`, ...pullRequest });
  const setNow = (at: string) => {
    now = new Date(at);
  };
  return { team, source, add, setNow, clock: () => now };
}

/** Renders the screen and lets its first read land; `opened` collects the links opened. */
async function open(
  fake: ReturnType<typeof acme>,
  options: { opened?: string[]; messaging?: FakeAgentMessaging; connectionOrigin?: string } = {},
) {
  const clock = { now: fake.clock, timeZone: "UTC" };
  const pullRequests = new PullRequests(fake.team, options.messaging, clock);
  const opener = {
    connectionOrigin: options.connectionOrigin ?? origin,
    open: (link: string) => options.opened?.push(link),
  };
  const page = render(
    <PullRequestsPage pullRequests={pullRequests} opener={opener} onLink={() => {}} />,
  );
  await settle();
  return page;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

const text = (page: HTMLElement) => page.textContent ?? "";
const sectionNames = (page: HTMLElement) =>
  [...page.querySelectorAll("section")].map((each) => each.getAttribute("aria-label"));
const rows = (page: HTMLElement) => [...page.querySelectorAll("li")].map((li) => li.textContent);

/** A button's words without what's hidden from screen readers, such as a tab's width copy. */
function wordsOf(button: HTMLButtonElement): string {
  const copy = button.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent ?? "";
}

function button(page: HTMLElement, label: string): HTMLButtonElement {
  const found = [...page.querySelectorAll("button")].find((each) => wordsOf(each) === label);
  if (found === undefined) throw new Error(`no button ${label}`);
  return found;
}

function press(page: HTMLElement, label: string): void {
  const found = button(page, label);
  act(() => found.click());
}

verifies("team.pull-requests", () => {
  describe("PullRequestsPage", () => {
    it("says Loading… until the first read lands", async () => {
      const fake = acme();
      const pullRequests = new PullRequests(fake.team, undefined, { now: fake.clock });
      const opener = { connectionOrigin: origin, open: () => {} };
      const page = render(
        <PullRequestsPage pullRequests={pullRequests} opener={opener} onLink={() => {}} />,
      );
      expect(page.querySelector('[aria-label="Loading pull requests"]')?.textContent).toContain(
        "Loading…",
      );
      await settle();
    });

    it("shows each state with its symbol and its word under All open", async () => {
      const fake = acme();
      fake.team.setMergeQueue(fake.source, {
        health: "running",
        groups: [{ position: 1, state: "building", since: minutesAgo(9), pullRequests: [] }],
      });
      fake.add("#1", { state: "draft", since: minutesAgo(2 * 24 * 60) });
      fake.add("#2", {
        state: "waiting-for-review",
        reviewer: agent("Liam"),
        since: minutesAgo(180),
      });
      fake.add("#3", {
        state: "changes-requested",
        reviewer: agent("Julian"),
        since: minutesAgo(60),
      });
      fake.add("#4", { state: "approved" });
      fake.add("#5", { state: "in-queue", queue: { position: 1, group: 1 } });
      fake.add("#6", { state: "failing", reason: "typecheck", since: minutesAgo(120) });
      fake.add("#7", { state: "conflicting", since: minutesAgo(300) });
      fake.add("#8", { state: "dequeued", reason: "group failed", since: minutesAgo(20) });
      fake.add("#9", { state: "approval-outdated", fastTrack: true });
      const page = await open(fake);
      press(page, "All open, 9");
      for (const line of [
        "○ Draft · 2 d",
        "◔ Waiting for review · Liam · 3 h",
        "↩ Changes requested · Julian · 1 h",
        "✓ Approved · waiting for the queue",
        "≡ In the queue · 1 of 1 · group running 9 min",
        "✕ Failing: typecheck · 2 h",
        "✕ Conflicts with main · 5 h",
        "⊘ Taken out: group failed · 20 min",
        "⚠ Approved on an older head · pushed after approval · ⚡ Fast-track",
      ]) {
        expect(text(page)).toContain(line);
      }
      expect(sectionNames(page)).toEqual([
        "Failing · 1",
        "Conflicting · 1",
        "Taken out of the queue · 1",
        "Approval out of date · 1",
        "Changes requested · 1",
        "Waiting for review · 1",
        "Approved · 1",
        "In the queue · 1",
        "Drafts · 1",
      ]);
    });

    it("opens on the stuck PRs worst first, then those coming up", async () => {
      const fake = acme();
      fake.add("#20", { state: "waiting-for-review", since: minutesAgo(6 * 60) });
      fake.add("#21", { state: "failing", reason: "typecheck", since: minutesAgo(61) });
      fake.add("#22", { state: "approved" });
      fake.add("#23", { state: "draft" });
      const page = await open(fake);
      expect(text(page)).toContain("Pull requests · app");
      expect(button(page, "Needs attention, 2").getAttribute("aria-selected")).toBe("true");
      expect(text(page)).toContain("As of 13:00 · 0 min ago");
      expect(sectionNames(page)).toEqual(["Stuck · worst first", "Coming up"]);
      expect(rows(page).map((row) => row?.slice(0, 3))).toEqual(["#21", "#20", "#22"]);
    });

    it("says nothing is stuck, with See all open", async () => {
      const fake = acme();
      fake.add("#30", { state: "draft" });
      const page = await open(fake);
      expect(text(page)).toContain("Nothing is stuck. 1 PR is open.");
      press(page, "See all open");
      expect(sectionNames(page)).toEqual(["Drafts · 1"]);
    });

    it("shows no rows, and says why, when no snapshot has arrived", async () => {
      const page = await open(acme());
      expect(text(page)).toContain("PR states aren't available yet.");
      expect(text(page)).toContain("The PR watcher hasn't sent a snapshot to Paperclip");
      expect(page.querySelectorAll("li")).toHaveLength(0);
    });

    it("asks to connect again when the connection may not read pull requests", async () => {
      const page = await open(acme({ pullRequests: false }));
      expect(text(page)).toContain(
        "This connection can't read pull requests yet. Connect again to allow it.",
      );
      expect(page.querySelectorAll("li")).toHaveLength(0);
    });

    it("warns when the snapshot is old, and keeps the rows when a read fails", async () => {
      const fake = acme();
      fake.add("#40", { state: "draft" });
      fake.setNow("2026-11-24T13:43:00.000Z");
      const page = await open(fake);
      expect(page.querySelector("header")?.textContent).toContain("⚠ As of 13:00 · 43 min ago");
      expect(text(page)).toContain("As of 13:00 · 43 min ago. The PR watcher may have stopped.");
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(fake.team, "pullRequests").mockRejectedValue(new Error("connection reset"));
      fake.add("#41", { state: "draft" });
      await settle();
      expect(text(page)).toContain("Offline, as of 13:00. Rows stay as they were.");
      expect(text(page)).toContain("Nothing is stuck. 1 PR is open.");
    });

    it("names the task a branch points to, from the source's work", async () => {
      const fake = acme();
      const messaging = new FakeAgentMessaging();
      const tasks = messaging.addSource({ label: "Paperclip · Acme" });
      const task = messaging.addWork(tasks.id, { label: "ACME-7", title: "A change" });
      fake.add("#50", {
        state: "failing",
        author: agent("Bo"),
        work: task.id,
        since: minutesAgo(90),
      });
      const page = await open(fake, { messaging });
      expect(rows(page)[0]).toContain("Bo · ACME-7");
    });

    it("shows a hostile title as typed: no link, no extra button", async () => {
      const fake = acme();
      fake.add("#60", { state: "approval-outdated", title: "[x](javascript:alert(1))" });
      fake.add("#61", {
        state: "approval-outdated",
        title: '<button type="button">Approve</button>',
      });
      const page = await open(fake);
      expect(rows(page)[0]).toContain("[x](javascript:alert(1))");
      expect(rows(page)[1]).toContain('<button type="button">Approve</button>');
      expect(page.querySelectorAll("a")).toHaveLength(0);
      expect([...page.querySelectorAll("li button")]).toHaveLength(0);
    });
  });

  describe("WebLinkButton", () => {
    it("shows the full address, and opens a GitHub pull request page", async () => {
      const fake = acme();
      const link = "https://github.com/acme/app/pull/70";
      fake.add("#70", { state: "draft", webLink: link });
      const opened: string[] = [];
      const page = await open(fake, { opened });
      press(page, "See all open");
      expect(rows(page)[0]).toContain(`No task found for this branch Open in GitHub ↗ ${link}`);
      press(page, "Open in GitHub ↗");
      expect(opened).toEqual([link]);
    });

    it("refuses a link off the connection's own Paperclip origin", async () => {
      const fake = acme();
      fake.add("#71", { state: "draft", webLink: `${origin}/ACME/issues/ACME-7` });
      const page = await open(fake, { connectionOrigin: "https://paperclip.other.test" });
      expect(text(page)).toContain("Nothing is stuck.");
      press(page, "See all open");
      expect(text(page)).not.toContain("Open in GitHub ↗");
    });

    it("draws nothing for a script address", () => {
      const open = vi.fn();
      const page = render(
        <WebLinkButton link="javascript:alert(1)" opener={{ connectionOrigin: origin, open }}>
          Open in GitHub ↗
        </WebLinkButton>,
      );
      expect(page.querySelectorAll("button")).toHaveLength(0);
      expect(open).not.toHaveBeenCalled();
    });
  });
});

verifies("team.pull-requests", () => {
  describe("PullRequestsPage look (HAL-17515 P1–P10)", () => {
    it("draws each state as a chip in its tone, with Fast-track as a tag", async () => {
      const fake = acme();
      fake.add("#80", { state: "failing", reason: "typecheck", since: minutesAgo(120) });
      fake.add("#81", { state: "approval-outdated", fastTrack: true });
      const page = await open(fake);
      const chip = (words: string) =>
        [...page.querySelectorAll("li span")].findLast((each) => each.textContent === words);
      expect(chip("✕ Failing: typecheck")?.className).toContain("text-danger");
      expect(chip("⚠ Approved on an older head")?.className).toContain("text-attention");
      expect(chip("⚡ Fast-track")?.className).toContain("border-border-strong");
      expect(page.querySelector("h1")?.className).toContain("text-title");
    });

    it("says a failed first read in an attention Callout, with the kit's Try again", async () => {
      const fake = acme();
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(fake.team, "parts").mockRejectedValue(new Error("no answer"));
      const page = await open(fake);
      const status = page.querySelector('[role="status"]');
      expect(status?.textContent).toContain("Paperclip isn't answering.");
      expect(status?.closest(".bg-attention-soft")).not.toBeNull();
      expect(button(page, "Try again").className).not.toContain("text-accent");
    });

    it("draws no attention box while nothing failed, keeping the live region", async () => {
      const fake = acme();
      fake.add("#82", { state: "draft" });
      const page = await open(fake);
      expect(page.querySelector(".bg-attention-soft")).toBeNull();
      expect(page.querySelector('[role="status"]')?.textContent).toBe("");
    });
  });
});

verifies("team.pull-requests", () => {
  describe("PullRequestsPage keyboard and screen readers (a11y check TM1, TM4–TM6)", () => {
    it("keeps the same h1 across a failed read and Try again, and focuses it", async () => {
      const fake = acme();
      fake.add("#40", { state: "draft" });
      const read = fake.team.pullRequests.bind(fake.team);
      let failing = true;
      fake.team.pullRequests = () => (failing ? Promise.reject(new Error("no answer")) : read());
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const page = await open(fake);
      const heading = page.querySelector("h1");
      button(page, "Try again").focus();
      failing = false;
      press(page, "Try again");
      await settle();
      expect(text(page)).toContain("Pull requests · app");
      expect(page.querySelector("h1")).toBe(heading);
      expect(document.activeElement).toBe(heading);
      errors.mockRestore();
    });

    it("names the lists and shows which one is selected", async () => {
      const fake = acme();
      fake.add("#41", { state: "failing", reason: "typecheck", since: minutesAgo(120) });
      const page = await open(fake);
      const lists = page.querySelector('[role="tablist"]');
      expect(lists?.getAttribute("aria-label")).toBe("Pull request lists");
      expect(button(page, "Needs attention, 1").getAttribute("aria-selected")).toBe("true");
      expect(button(page, "All open, 1").getAttribute("aria-selected")).toBe("false");
      press(page, "All open, 1");
      expect(button(page, "All open, 1").getAttribute("aria-selected")).toBe("true");
    });

    it("moves focus to All open after See all open", async () => {
      const fake = acme();
      fake.add("#42", { state: "draft" });
      const page = await open(fake);
      button(page, "See all open").focus();
      press(page, "See all open");
      expect(document.activeElement).toBe(button(page, "All open, 1"));
    });

    it("wraps a long title instead of cutting it off", async () => {
      const fake = acme();
      const title = `feat(app): ${"a very long change name ".repeat(12)}`;
      fake.add("#43", { state: "draft", title });
      const page = await open(fake);
      press(page, "See all open");
      const line = [...page.querySelectorAll("li p")].find((each) =>
        each.textContent?.includes(title.trim()),
      );
      expect(line?.className).toContain("wrap-anywhere");
      expect(line?.className).not.toContain("truncate");
    });
  });
});
