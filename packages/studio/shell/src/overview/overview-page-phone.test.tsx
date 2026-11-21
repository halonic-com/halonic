// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PhoneTopBarSlot } from "../phone/phone-top-bar-actions.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import type { OverviewHub, OverviewItem } from "./overview-model.ts";
import { OverviewPage, type OverviewPageProps, type OverviewWords } from "./overview-page.tsx";

afterEach(() => {
  unmountAll();
});

const words: OverviewWords = {
  searchLabel: "Search for skills",
  loadingLabel: "Loading skills",
  chipsLabel: "Hub",
  allChip: "All",
  sharedChip: (workspace) => `Shared in ${workspace}`,
  moreLabel: (name) => `More actions for ${name}`,
  sharedSection: (workspace) => `Shared in ${workspace}`,
  emptySection: (name) => `No skills in ${name} yet`,
  noMatch: (query) => `No skills match "${query}".`,
  shownCount: (count) => (count === 1 ? "1 skill." : `${count} skills.`),
  nothingYet: { title: "No skills yet" },
};

const hubs: readonly OverviewHub[] = [
  { id: "acme", name: "acme", items: [{ id: "draft-reply", name: "Draft reply" }] },
  { id: "beta", name: "beta", items: [{ id: "billing", name: "Billing" }] },
];

/** The overview page as a phone draws it. */
function showOnPhone(props: Partial<OverviewPageProps> = {}): HTMLElement {
  return render(
    <PresentationProvider presentation="phone">
      <OverviewPage
        hubs={hubs}
        words={words}
        onOpen={() => undefined}
        onOpenInNewTab={() => undefined}
        {...props}
      />
    </PresentationProvider>,
  );
}

/** One hub, "acme", with these items. */
function acmeWith(...items: OverviewItem[]): readonly OverviewHub[] {
  return [{ id: "acme", name: "acme", items }];
}

function rowOf(page: HTMLElement, name: string): HTMLTableRowElement | undefined {
  return [...page.querySelectorAll("tr")].find((row) => row.textContent?.includes(name));
}

verifies("shell.overview.row-parts-and-quiet-head", () => {
  it("puts the chips on a line of their own under the text on a phone, and nothing on the right", () => {
    const page = showOnPhone({
      hubs: acmeWith({
        id: "reply",
        name: "Support reply",
        detail: "A customer writes in and gets a drafted reply",
        usedBy: "Last run ✓ Yesterday 16:02",
        usedByOwnLine: true,
        chips: <span>2 needs you</span>,
      }),
    });
    const under = rowOf(page, "Support reply")?.querySelector(".text-small");
    expect(under?.textContent).toBe(
      "A customer writes in and gets a drafted reply" +
        "Last run ✓ Yesterday 16:02" +
        "2 needs you",
    );
    const chipLine = under?.lastElementChild;
    expect(chipLine?.textContent).toBe("2 needs you");
    expect(chipLine?.className).toContain("flex-wrap");
    // The text above the chips is cut by its own length, so the chip line takes nothing from it.
    expect(under?.firstElementChild?.className).toContain("truncate");
    // The column of name and text is the last part of the row: nothing sits on its right.
    expect(under?.parentElement?.nextElementSibling).toBeNull();
  });
});

verifies("shell.overview.used-by", () => {
  it("ends the line under the name with the used-by text on a phone, after the detail, and cuts only the detail", () => {
    const page = showOnPhone({
      hubs: acmeWith(
        {
          id: "refunds",
          name: "Refund handling",
          detail: "When an email asks for a refund",
          usedBy: "Not used yet",
        },
        { id: "tone", name: "Tone of voice", usedBy: "Not used yet" },
      ),
      itemMenu: () => [{ id: "open", label: "Open", onSelect: () => undefined }],
    });
    const lineUnder = (name: string) =>
      rowOf(page, name)?.querySelector(".text-small")?.textContent;
    expect(lineUnder("Refund handling")).toBe("When an email asks for a refund · Not used yet");
    expect(lineUnder("Tone of voice")).toBe("Not used yet");
    const row = rowOf(page, "Refund handling");
    const cut = [...(row?.querySelectorAll(".truncate") ?? [])].map((each) => each.textContent);
    expect(cut).toContain("When an email asks for a refund");
    const usedBy = [...(row?.querySelectorAll("span") ?? [])].find(
      (each) => each.textContent === "Not used yet",
    );
    expect(usedBy?.className).not.toContain("truncate");
    expect(usedBy?.className).toContain("whitespace-normal");
  });

  it("gives the used-by text the line alone on a narrow phone row, clipping the detail and its dot", () => {
    // jsdom has no layout: e2e/overview-phone-row.spec.ts checks the boxes at 195px. Here, the
    // classes that make it: the detail and its dot wrap away when they'd have less than 5rem (their
    // starting width), onto a 0px line that the reversed wrap puts below the used-by text, where the
    // line clips it.
    const page = showOnPhone({
      hubs: acmeWith({
        id: "refunds",
        name: "Refund handling",
        detail: "When an email asks for a refund",
        usedBy: "Not used yet",
      }),
    });
    const line = page.querySelector(".text-small > span");
    expect(line?.className).toContain("flex-wrap-reverse");
    expect(line?.className).toContain("overflow-hidden");
    const [detailAndDot, usedBy] = [...(line?.children ?? [])];
    expect(detailAndDot?.textContent).toBe("When an email asks for a refund · ");
    // 5rem is the basis, not the minimum, so `max-w-fit` can shrink a short detail's box to fit it.
    expect(detailAndDot?.className).toContain("flex-[1_1_5rem]");
    expect(detailAndDot?.className).toContain("max-w-fit");
    expect(detailAndDot?.className).toContain("h-0");
    // The detail itself keeps a line's height, or `truncate` would clip it inside the 0px box.
    expect(detailAndDot?.firstElementChild?.className).toContain("h-lh");
    expect(usedBy?.textContent).toBe("Not used yet");
  });
});

verifies("shell.overview.phone-head", () => {
  it("gives the search field the whole line and makes the create button 48px on a phone", () => {
    const page = showOnPhone({ newButton: { label: "New skill", onClick: () => undefined } });
    const button = [...page.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === "New skill",
    );
    expect(button?.className).toContain("min-h-touch");
    expect(button?.parentElement?.className).toContain("flex-col");
  });

  it("puts the create button in the phone top bar as a 48px +, with nothing under the search field", () => {
    const topBar = document.createElement("div");
    document.body.append(topBar);
    const onClick = vi.fn();
    const page = render(
      <PresentationProvider presentation="phone">
        <PhoneTopBarSlot value={topBar}>
          <OverviewPage
            hubs={hubs}
            words={words}
            onOpen={() => undefined}
            onOpenInNewTab={() => undefined}
            newButton={{ label: "New skill", onClick }}
          />
        </PhoneTopBarSlot>
      </PresentationProvider>,
    );
    const plus = topBar.querySelector<HTMLButtonElement>('button[aria-label="New skill"]');
    expect(plus?.className).toContain("phone:size-touch");
    expect(page.textContent).not.toContain("New skill");
    act(() => plus?.click());
    expect(onClick).toHaveBeenCalledOnce();
    topBar.remove();
  });
});
