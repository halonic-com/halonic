// @vitest-environment jsdom

import { KindIcon } from "@halonicjs/studio-kit";
import { engineWords } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { InboxNotice, InboxNotices } from "../notices/inbox-notices.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { NoticesSection } from "./notices-section.tsx";

afterEach(unmountAll);

const failed: InboxNotice = {
  kind: "failed-run",
  key: "failed-run:acme/daily:2026-11-16",
  routineId: "acme/daily",
  runId: "r7",
  hubId: "acme",
  at: "2026-11-16T06:00:00.000Z",
  count: 1,
  fixed: false,
  title: "Daily summary failed at 06:00",
};

const month: InboxNotice = {
  kind: "budget-month",
  key: "budget-month:2026-11:50",
  at: "2026-11-16T06:00:00.000Z",
  title: "This month's estimated spend reached its budget of €50.00.",
};

async function noticeRows(notices: readonly InboxNotice[]): Promise<HTMLLIElement[]> {
  const source: InboxNotices = {
    list: async () => notices,
    subscribe: () => () => {},
    dismiss: () => {},
  };
  const root = render(
    <NoticesSection
      source={source}
      openRun={() => {}}
      openBudget={() => {}}
      onEmptied={() => {}}
      words={engineWords["desktop-app"]}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return [...root.querySelectorAll<HTMLLIElement>("section ul > li")];
}

/** The kit's bell, drawn on its own, to compare a row's glyph with. */
function bell(): string {
  return render(<KindIcon kind="notice" />).innerHTML;
}

verifies("inbox.notice-bell", () => {
  describe("a Notices row", () => {
    it("starts with the kit's bell on the 60px tile, with no badge", async () => {
      const [row] = await noticeRows([failed]);
      const tile = row?.firstElementChild;
      expect(tile?.getAttribute("aria-hidden")).toBe("true");
      expect(tile?.className).toContain("size-15");
      expect(tile?.className).toContain("rounded-full");
      expect(tile?.innerHTML).toBe(bell());
      expect(row?.querySelector("[data-avatar-badge]")).toBeNull();
      // The bell comes before the title.
      expect(tile?.nextElementSibling?.querySelector("p")?.textContent).toBe(failed.title);
    });

    it("gives every notice the bell, the month's budget too", async () => {
      const rows = await noticeRows([month, failed]);
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.firstElementChild?.innerHTML).toBe(bell());
    });
  });
});
