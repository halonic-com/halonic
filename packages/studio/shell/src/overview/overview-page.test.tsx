// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { OverviewHub } from "./overview-model.ts";
import { OverviewPage, type OverviewPageProps, type OverviewWords } from "./overview-page.tsx";

afterEach(unmountAll);

const words: OverviewWords = {
  searchLabel: "Search for skills",
  loadingLabel: "Loading skills",
  emptySection: (name) => `No skills in ${name} yet`,
  noMatch: (query) => `No results for “${query}”`,
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
  it("says the search found nothing, naming the text", () => {
    const page = show();
    type(search(page), " zzz ");
    expect(page.textContent).toContain("No results for “zzz”");
    expect(headings(page).filter((text) => text !== "No results for “zzz”")).toEqual([]);
  });

  it("shows the feature's nothing-yet words without hubs", () => {
    const page = show({ hubs: [] });
    expect(page.textContent).toContain("No skills yet");
    expect(search(page)).toBeTruthy();
  });

  it("shows the failure with Try again", () => {
    const onTryAgain = vi.fn();
    const page = show({
      failure: { title: "Couldn't load skills", reason: "Halonic isn't answering.", onTryAgain },
    });
    expect(page.textContent).toContain("Couldn't load skills");
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
