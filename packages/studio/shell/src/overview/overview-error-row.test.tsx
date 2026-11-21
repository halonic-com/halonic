// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { OverviewHub } from "./overview-model.ts";
import { OverviewPage, type OverviewWords } from "./overview-page.tsx";

afterEach(() => {
  unmountAll();
});

const words: OverviewWords = {
  searchLabel: "Search for agents",
  loadingLabel: "Loading agents",
  chipsLabel: "Hub",
  allChip: "All",
  sharedChip: (workspace) => `Shared in ${workspace}`,
  moreLabel: (name) => `More actions for ${name}`,
  sharedSection: (workspace) => `Shared in ${workspace}`,
  emptySection: (name) => `No agents in ${name} yet`,
  noMatch: (query) => `No agents match "${query}".`,
  nothingYet: { title: "No agents yet" },
};

const reason = 'Line 2: A value has ": " in it. Put the value in quotes.';

/** Support with Reporter, and writer.agent.yaml, which can't be read. */
const hubs: readonly OverviewHub[] = [
  {
    id: "support",
    name: "Support",
    items: [
      { id: "support/reporter", name: "Reporter", detail: "Writes the weekly report" },
      {
        id: "support/writer",
        name: "Writer",
        description: "writer.agent.yaml",
        error: { chip: "1 problem", reason },
      },
    ],
  },
];

function rowOf(page: HTMLElement, name: string): HTMLElement | undefined {
  return [...page.querySelectorAll("tr")].find((row) => row.textContent?.includes(name));
}

function show(): HTMLElement {
  return render(
    <OverviewPage
      hubs={hubs}
      words={words}
      onOpen={() => undefined}
      onOpenInNewTab={() => undefined}
    />,
  );
}

verifies("shell.overview.error-row", () => {
  it("draws an item marked as an error with its chip and its reason in danger text", () => {
    const page = show();

    const writer = rowOf(page, "Writer");
    const danger = [...(writer?.querySelectorAll(".text-danger") ?? [])].map(
      (each) => each.textContent,
    );

    expect(writer?.textContent).toContain("1 problem");
    expect(danger).toContain(reason);
    expect(rowOf(page, "Reporter")?.querySelector(".text-danger")).toBeNull();
  });

  it("finds an item marked as an error by its description", () => {
    const page = show();
    const field = page.querySelector<HTMLInputElement>('input[type="search"]');

    act(() => {
      if (field === null) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        field,
        "writer.agent",
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(rowOf(page, "Writer")).toBeDefined();
    expect(rowOf(page, "Reporter")).toBeUndefined();
  });
});
