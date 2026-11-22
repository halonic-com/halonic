// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import type { ReactNode } from "react";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { OverviewItem } from "./overview-model.ts";
import { OverviewPage, type OverviewWords } from "./overview-page.tsx";

afterEach(() => {
  unmountAll();
});

const words: OverviewWords = {
  searchLabel: "Search for routines",
  loadingLabel: "Loading routines",
  chipsLabel: "Hub",
  allChip: "All",
  sharedChip: (workspace) => `Shared in ${workspace}`,
  moreLabel: (name) => `More actions for ${name}`,
  sharedSection: (workspace) => `Shared in ${workspace}`,
  emptySection: (name) => `No routines in ${name} yet`,
  noMatch: (query) => `No routines match "${query}".`,
  shownCount: (count) => (count === 1 ? "1 routine." : `${count} routines.`),
  nothingYet: { title: "No routines yet" },
};

const sentence = "Weekdays at 07:30 (Europe/Amsterdam) → Support reply";

function routine(chips?: ReactNode): OverviewItem {
  return {
    id: "acme/morning",
    name: "Morning replies",
    detail: sentence,
    usedBy: "next Mon 07:30",
    chipsBeforeUsedBy: true,
    ...(chips === undefined ? {} : { chips }),
  };
}

/** The row of the one item, drawn on a phone or on desktop. */
function rowOf(item: OverviewItem, phone: boolean): HTMLElement {
  const page = (
    <OverviewPage
      hubs={[{ id: "acme", name: "acme", items: [item] }]}
      words={words}
      onOpen={() => undefined}
      onOpenInNewTab={() => undefined}
    />
  );
  const container = render(
    phone ? <PresentationProvider presentation="phone">{page}</PresentationProvider> : page,
  );
  return [...container.querySelectorAll("tr")].find((each) =>
    each.textContent?.includes("Morning replies"),
  ) as HTMLElement;
}

verifies("shell.overview.chips-before-used-by", () => {
  it("gives the detail up to two lines, then starts the last line with the chip on a phone", () => {
    const row = rowOf(routine(<span data-chip="">Needs you</span>), true);
    const detail = [...row.querySelectorAll("span")].find(
      (each) => each.textContent === sentence,
    ) as HTMLElement;
    expect(detail.className).toContain("line-clamp-2");
    expect(detail.className).not.toContain("truncate");
    const last = detail.nextElementSibling as HTMLElement;
    expect(last.firstElementChild?.textContent).toBe("Needs you");
    expect(last.textContent).toBe("Needs younext Mon 07:30");
    expect(last.className).toContain("flex-wrap");
  });

  it("puts the next time alone on the last line when there is no chip", () => {
    const row = rowOf(routine(), true);
    const detail = [...row.querySelectorAll("span")].find(
      (each) => each.textContent === sentence,
    ) as HTMLElement;
    expect(detail.nextElementSibling?.textContent).toBe("next Mon 07:30");
    expect(row.textContent).not.toContain(" · ");
  });

  it("keeps the chip and the next time on the row's right on desktop", () => {
    const row = rowOf(routine(<span data-chip="">Needs you</span>), false);
    const chip = row.querySelector("[data-chip]") as HTMLElement;
    expect(chip.nextElementSibling?.textContent).toBe("next Mon 07:30");
    expect(row.textContent).toContain(sentence);
  });
});
