// @vitest-environment jsdom
import type { PullRequest } from "@halonicjs/ports";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PullRequests } from "../pull-requests.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PullRequestsPage } from "./pull-requests-page.tsx";

afterEach(unmountAll);

const now = new Date("2026-11-24T13:00:00.000Z");
const origin = "https://paperclip.acme.test";
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000).toISOString();

/** A source at 24 Nov 13:00 UTC that `add` puts pull requests on. */
function acme() {
  const team = new FakeTeamStatus({ now: () => now });
  const { source } = team.addSource();
  const add = (label: string, pullRequest: Partial<PullRequest>) =>
    team.addPullRequest(source, { label, title: `feat(app): change ${label}`, ...pullRequest });
  return { team, add };
}

/** Renders the screen as a phone draws it and lets its first read land. */
async function openOnPhone(
  fake: ReturnType<typeof acme>,
  options: { opened?: string[]; connectionOrigin?: string } = {},
): Promise<HTMLElement> {
  const pullRequests = new PullRequests(fake.team, undefined, { now: () => now, timeZone: "UTC" });
  const opener = {
    connectionOrigin: options.connectionOrigin ?? origin,
    open: (link: string) => options.opened?.push(link),
  };
  const page = render(
    <PresentationProvider presentation="phone">
      <PullRequestsPage pullRequests={pullRequests} opener={opener} onLink={() => {}} />
    </PresentationProvider>,
  );
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
  return page;
}

/** A button's words without what's hidden from screen readers, such as a tab's width copy. */
function wordsOf(button: HTMLElement): string {
  const copy = button.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent ?? "";
}

/** Each chip's words as a screen reader hears them, its name and count. */
const chips = (page: HTMLElement) =>
  [...page.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) =>
    wordsOf(tab).replace(/\s+,/, ","),
  );
const rows = (page: HTMLElement) => [...page.querySelectorAll("li")].map((li) => li.textContent);

function press(page: HTMLElement, label: string): void {
  const found = [...page.querySelectorAll("button")].find((each) => wordsOf(each) === label);
  if (found === undefined) throw new Error(`no button ${label}`);
  act(() => found.click());
}

verifies("team.phone-screens", () => {
  describe("PullRequestsPage on a phone (HAL-17515 P24)", () => {
    it("offers the chips Stuck, All open and Queue with their counts, and no Merged today", async () => {
      const fake = acme();
      fake.add("#1", { state: "failing", reason: "typecheck", since: minutesAgo(120) });
      fake.add("#2", { state: "draft" });
      const page = await openOnPhone(fake);
      expect(chips(page)).toEqual(["Stuck, 1", "All open, 2", "Queue, 0"]);
    });

    it("lists the stuck pull requests worst first, each with its state chip", async () => {
      const fake = acme();
      fake.add("#3", { state: "approval-outdated", since: minutesAgo(600) });
      fake.add("#4", { state: "failing", reason: "typecheck", since: minutesAgo(120) });
      const page = await openOnPhone(fake);
      const stuck = rows(page);
      expect(stuck[0]).toContain("✕ Failing: typecheck · 2 h");
      expect(stuck[1]).toContain("#3");
    });

    it("shows a hostile title as typed: no link, no extra button", async () => {
      const fake = acme();
      fake.add("#60", { state: "approval-outdated", title: "[x](javascript:alert(1))" });
      fake.add("#61", {
        state: "approval-outdated",
        title: '<button type="button">Approve</button>',
      });
      const page = await openOnPhone(fake);
      expect(rows(page)[0]).toContain("[x](javascript:alert(1))");
      expect(rows(page)[1]).toContain('<button type="button">Approve</button>');
      expect(page.querySelectorAll("a")).toHaveLength(0);
      // The only button in each row is the one that opens the PR's page, named by the title as typed.
      expect([...page.querySelectorAll("li button")].map((each) => each.textContent)).toEqual([
        "#60 [x](javascript:alert(1))",
        '#61 <button type="button">Approve</button>',
      ]);
    });

    it("shows a GitHub page's full address before it opens", async () => {
      const fake = acme();
      const link = "https://github.com/acme/app/pull/70";
      fake.add("#70", { state: "draft", webLink: link });
      const opened: string[] = [];
      const page = await openOnPhone(fake, { opened });
      press(page, "See all open");
      expect(rows(page)[0]).toContain(`Open in GitHub ↗ ${link}`);
      press(page, "Open in GitHub ↗");
      expect(opened).toEqual([link]);
    });

    it("refuses a link off the connection's own Paperclip origin", async () => {
      const fake = acme();
      fake.add("#71", { state: "draft", webLink: `${origin}/ACME/issues/ACME-7` });
      const opened: string[] = [];
      const page = await openOnPhone(fake, {
        opened,
        connectionOrigin: "https://paperclip.other.test",
      });
      press(page, "See all open");
      expect(page.textContent).not.toContain("Open in GitHub ↗");
      expect(opened).toEqual([]);
    });
  });
});
