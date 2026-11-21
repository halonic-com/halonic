// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PhoneTopBarSlot } from "../phone/phone-top-bar-actions.tsx";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { OverviewHub } from "./overview-model.ts";
import { OverviewPage, type OverviewPageProps, type OverviewWords } from "./overview-page.tsx";

let restorePopover: (() => void) | undefined;

afterEach(() => {
  unmountAll();
  restorePopover?.();
  restorePopover = undefined;
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
  nothingYet: { title: "No skills yet" },
};

const hubs: readonly OverviewHub[] = [
  {
    id: "acme",
    name: "acme",
    items: [
      { id: "draft-reply", name: "Draft reply" },
      { id: "summarise", name: "Summarise", pinned: true },
    ],
  },
  { id: "beta", name: "beta", items: [{ id: "billing", name: "Billing" }] },
  { id: "empty", name: "empty", items: [] },
];

function show(props: Partial<OverviewPageProps> = {}): HTMLElement {
  return render(
    <OverviewPage
      hubs={hubs}
      words={words}
      onOpen={() => undefined}
      onOpenInNewTab={() => undefined}
      {...props}
    />,
  );
}

it("shows the search field's name as its placeholder too", () => {
  expect(search(show({ hubs: [] })).placeholder).toBe("Search for skills");
});

function search(page: HTMLElement): HTMLInputElement {
  const field = page.querySelector<HTMLInputElement>('input[aria-label="Search for skills"]');
  if (field === null) {
    throw new Error("no search field");
  }
  return field;
}

function type(field: HTMLInputElement, text: string): void {
  act(() => {
    // React tracks the value itself, so the native setter makes the change event real.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function headings(page: HTMLElement): string[] {
  return Array.from(page.querySelectorAll("h2")).map((heading) => heading.textContent ?? "");
}

verifies("shell.overview.hub-sections-and-pins", () => {
  it("draws a section per hub, an empty one with its words, and pinned rows first", () => {
    const page = show({ shared: { workspaceName: "Acme", items: [{ id: "tone", name: "Tone" }] } });
    expect(headings(page).filter((text) => !text.startsWith("No skills"))).toEqual([
      "acme",
      "beta",
      "empty",
      "Shared in Acme",
    ]);
    expect(page.textContent).toContain("No skills in empty yet");
    const rows = Array.from(page.querySelectorAll("tr")).map((row) => row.textContent);
    expect(rows.findIndex((text) => text?.includes("Summarise"))).toBeLessThan(
      rows.findIndex((text) => text?.includes("Draft reply")),
    );
  });
});

verifies("shell.overview.search", () => {
  it("shows only the matches and hides the sections without one", () => {
    const page = show();
    type(search(page), "DRAFT");
    expect(headings(page)).toEqual(["acme"]);
    expect(page.textContent).toContain("Draft reply");
    expect(page.textContent).not.toContain("Summarise");
  });

  it("clears on Escape, once, without closing what is behind", () => {
    const page = show();
    const field = search(page);
    type(field, "bill");
    const press = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      field.dispatchEvent(press);
    });
    expect(field.value).toBe("");
    expect(press.defaultPrevented).toBe(true);
    expect(headings(page)).toContain("beta");
  });
});

verifies("shell.overview.states", () => {
  it("says the search found nothing, naming the text, and clears it from Clear search", () => {
    const page = show();
    type(search(page), " zzz ");
    expect(page.textContent).toContain('No skills match "zzz".');
    expect(headings(page).filter((text) => text !== 'No skills match "zzz".')).toEqual([]);
    const clear = [...page.querySelectorAll("button")].find(
      (button) => button.textContent === "Clear search",
    );
    act(() => clear?.click());
    expect(search(page).value).toBe("");
    expect(document.activeElement).toBe(search(page));
    expect(headings(page)).toContain("beta");
  });

  it("shows the feature's nothing-yet words without hubs", () => {
    const page = show({ hubs: [] });
    expect(page.textContent).toContain("No skills yet");
    expect(search(page)).toBeTruthy();
  });

  it("shows nothing-yet, not a no-match line, when there is no hub and the shared list is empty", () => {
    const page = show({ hubs: [], shared: { workspaceName: "Acme", items: [] } });
    expect(page.textContent).toContain("No skills yet");
    expect(page.textContent).not.toContain("No skills match");
  });

  it("shows the failure with Try again", () => {
    const onTryAgain = vi.fn();
    const page = show({
      failure: { title: "Couldn't load skills", reason: "Halonic isn't answering.", onTryAgain },
    });
    expect(page.textContent).toContain("Couldn't load skills");
    expect(page.querySelector('input[aria-label="Search for skills"]')).toBeNull();
    const button = Array.from(page.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Try again",
    );
    act(() => button?.click());
    expect(onTryAgain).toHaveBeenCalledOnce();
  });

  it("names the loading rows for screen readers", () => {
    vi.useFakeTimers();
    const page = show({ loading: true });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(page.textContent).toContain("Loading skills");
    vi.useRealTimers();
  });
});

function press(page: HTMLElement, selector: string): void {
  const element = page.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`nothing matches ${selector}`);
  }
  act(() => element.click());
}

verifies("shell.overview.filters-new-and-menu", () => {
  it("limits the sections to the chosen hub chip", () => {
    const page = show();
    expect(page.querySelectorAll('input[type="radio"]')).toHaveLength(4);
    press(page, 'input[type="radio"][value="hub:beta"]');
    expect(headings(page)).toEqual(["beta"]);
  });

  it("shows no chips with one section only and a Shared chip when something is shared", () => {
    const oneHub = hubs.slice(0, 1);
    const sharedItems = { workspaceName: "Acme", items: [{ id: "tone", name: "Tone" }] };
    expect(show({ hubs: [] }).querySelector('[role="radiogroup"]')).toBeNull();
    unmountAll();
    expect(show({ hubs: oneHub }).querySelector('[role="radiogroup"]')).toBeNull();
    unmountAll();
    expect(show({ hubs: [], shared: sharedItems }).querySelector('[role="radiogroup"]')).toBeNull();
    unmountAll();
    const page = show({ hubs: oneHub, shared: sharedItems });
    press(page, 'input[type="radio"][value="shared"]');
    expect(headings(page)).toEqual(["Shared in Acme"]);
  });

  it("calls the feature's create handler from the New button, even with nothing yet", () => {
    const onClick = vi.fn();
    const page = show({ hubs: [], newButton: { label: "New skill", onClick } });
    const button = Array.from(page.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "New skill",
    );
    act(() => button?.click());
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("has a ⋮ button only on rows with menu items, and opens the feature's menu", () => {
    restorePopover = installFakePopover();
    const onSelect = vi.fn();
    const page = show({
      itemMenu: (item) =>
        item.id === "summarise" ? [{ id: "rename", label: "Rename…", onSelect }] : [],
    });
    expect(page.querySelectorAll('button[aria-label^="More actions for"]')).toHaveLength(1);
    press(page, 'button[aria-label="More actions for Summarise"]');
    const entry = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent === "Rename…",
    );
    act(() => entry?.click());
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("keeps the chips, search and New button out of the failed state", () => {
    const page = show({
      failure: { title: "Couldn't load skills", onTryAgain: () => undefined },
      newButton: { label: "New skill", onClick: () => undefined },
    });
    expect(page.querySelector('[role="radiogroup"]')).toBeNull();
    expect(page.textContent).not.toContain("New skill");
  });
});

verifies("shell.overview.row-parts-and-quiet-head", () => {
  const withParts: readonly OverviewHub[] = [
    {
      id: "acme",
      name: "acme",
      items: [
        { id: "invoice", name: "Invoice intake", avatar: "I", chips: <span>1 running</span> },
      ],
    },
  ];

  it("draws an item's avatar and chips in its row", () => {
    const page = show({ hubs: withParts });
    expect(page.textContent).toContain("Invoice intake");
    expect(page.textContent).toContain("I");
    expect(page.textContent).toContain("1 running");
  });

  it("hides the head while nothing is listed, when the feature asks for a quiet head", () => {
    const page = show({
      hubs: [{ id: "acme", name: "acme", items: [] }],
      quietWhenEmpty: true,
      newButton: { label: "New skill", onClick: () => undefined },
    });
    expect(page.textContent).toContain("No skills yet");
    expect(page.querySelector('input[type="search"]')).toBeNull();
    expect(page.textContent).not.toContain("New skill");
    const onClick = vi.fn();
    const withButton = show({
      hubs: [{ id: "acme", name: "acme", items: [] }],
      quietWhenEmpty: true,
      words: {
        ...words,
        nothingYet: { title: "No skills yet", action: { label: "New skill", onClick } },
      },
    });
    press(withButton, "button");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows the head once something is listed", () => {
    const page = show({
      hubs: withParts,
      quietWhenEmpty: true,
      newButton: { label: "New skill", onClick: () => undefined },
    });
    expect(search(page)).not.toBeNull();
    expect(page.textContent).toContain("New skill");
  });
});

verifies("shell.overview.used-by", () => {
  const used: readonly OverviewHub[] = [
    {
      id: "acme",
      name: "acme",
      items: [
        { id: "refunds", name: "Acme refunds", usedBy: "Used by 2 agents" },
        { id: "tone", name: "Tone of voice" },
        {
          id: "both",
          name: "Both parts",
          chips: <span>1 running</span>,
          usedBy: "Used by 1 agent",
        },
      ],
    },
  ];

  it("puts the used-by text in the name of the row's main cell", () => {
    const page = show({ hubs: used });
    const cell = [...page.querySelectorAll('td[role="gridcell"]')].find((each) =>
      each.textContent?.includes("Acme refunds"),
    );
    expect(cell?.textContent).toContain("Used by 2 agents");
  });

  it("ends a row with its used-by text and leaves the others bare", () => {
    const page = show({ hubs: used });
    const rows = [...page.querySelectorAll("tr")];
    const refunds = rows.find((row) => row.textContent?.includes("Acme refunds"));
    const tone = rows.find((row) => row.textContent?.includes("Tone of voice"));
    expect(refunds?.textContent).toContain("Used by 2 agents");
    expect(tone?.textContent).not.toContain("Used by");
  });

  it("draws a row's chips first, then its used-by text", () => {
    const page = show({ hubs: used });
    const row = [...page.querySelectorAll("tr")].find((r) => r.textContent?.includes("Both parts"));
    const text = row?.textContent ?? "";
    expect(text).toContain("1 running");
    expect(text.indexOf("1 running")).toBeLessThan(text.indexOf("Used by 1 agent"));
  });

  it("ends the line under the name with the used-by text on a phone, after the detail, and cuts only the detail", () => {
    const page = render(
      <PresentationProvider presentation="phone">
        <OverviewPage
          hubs={[
            {
              id: "acme",
              name: "acme",
              items: [
                {
                  id: "refunds",
                  name: "Refund handling",
                  detail: "When an email asks for a refund",
                  usedBy: "Not used yet",
                },
                { id: "tone", name: "Tone of voice", usedBy: "Not used yet" },
              ],
            },
          ]}
          words={words}
          onOpen={() => undefined}
          onOpenInNewTab={() => undefined}
          itemMenu={() => [{ id: "open", label: "Open", onSelect: () => undefined }]}
        />
      </PresentationProvider>,
    );
    const lineUnder = (name: string) =>
      [...page.querySelectorAll("tr")]
        .find((row) => row.textContent?.includes(name))
        ?.querySelector(".text-small")?.textContent;
    expect(lineUnder("Refund handling")).toBe("When an email asks for a refund · Not used yet");
    expect(lineUnder("Tone of voice")).toBe("Not used yet");
    const row = [...page.querySelectorAll("tr")].find((each) =>
      each.textContent?.includes("Refund handling"),
    );
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
    // classes that make it: the detail and its dot wrap away when they'd have less than 5rem, onto a
    // 0px line that the reversed wrap puts below the used-by text, where the line clips it.
    const page = render(
      <PresentationProvider presentation="phone">
        <OverviewPage
          hubs={[
            {
              id: "acme",
              name: "acme",
              items: [
                {
                  id: "refunds",
                  name: "Refund handling",
                  detail: "When an email asks for a refund",
                  usedBy: "Not used yet",
                },
              ],
            },
          ]}
          words={words}
          onOpen={() => undefined}
          onOpenInNewTab={() => undefined}
        />
      </PresentationProvider>,
    );
    const line = page.querySelector(".text-small > span");
    expect(line?.className).toContain("flex-wrap-reverse");
    expect(line?.className).toContain("overflow-hidden");
    const [detailAndDot, usedBy] = [...(line?.children ?? [])];
    expect(detailAndDot?.textContent).toBe("When an email asks for a refund · ");
    expect(detailAndDot?.className).toContain("min-w-20");
    expect(detailAndDot?.className).toContain("h-0");
    // The detail itself keeps a line's height, or `truncate` would clip it inside the 0px box.
    expect(detailAndDot?.firstElementChild?.className).toContain("h-lh");
    expect(usedBy?.textContent).toBe("Not used yet");
  });

  it("doesn't search the used-by text", () => {
    const page = show({ hubs: used });
    type(search(page), "agents");
    expect(page.textContent).not.toContain("Acme refunds");
  });
});

verifies("shell.overview.phone-head", () => {
  it("gives the search field the whole line and makes the create button 48px on a phone", () => {
    const page = render(
      <PresentationProvider presentation="phone">
        <OverviewPage
          hubs={hubs}
          words={words}
          onOpen={() => undefined}
          onOpenInNewTab={() => undefined}
          newButton={{ label: "New skill", onClick: () => undefined }}
        />
      </PresentationProvider>,
    );
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
