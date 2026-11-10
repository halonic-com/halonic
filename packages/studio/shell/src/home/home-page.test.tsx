// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { defineFeature } from "../feature.ts";
import type { HomeCardContribution } from "../points/home.ts";
import { createShell } from "../shell.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { type HomeCardProps, HomePage } from "./home-page.tsx";

afterEach(() => {
  unmountAll();
});

/** A card whose view says which feature's context it got. */
function card(id: HomeCardContribution["id"], text: string): HomeCardContribution {
  const Card = ({ context }: HomeCardProps) => (
    <p>{`${text} for ${context.services.toString()}`}</p>
  );
  return { id, view: "Card", load: async () => ({ Card }) };
}

function contextOf(featureId: string): WorkspaceContext {
  return {
    services: { toString: () => featureId } as unknown as WorkspaceContext["services"],
    announcer: createAnnouncer({ timers: new FakeTimers() }),
  };
}

/** Renders Home and lets the cards' views import. */
async function renderHome(cards: readonly HomeCardContribution[]): Promise<HTMLElement> {
  const shell = createShell({
    features: cards.map((entry) =>
      defineFeature({
        id: `${entry.id}-feature`,
        title: entry.id,
        register: (studio) => studio.home.addCard(entry),
      }),
    ),
  });
  const container = render(
    <HomePage cards={shell.contributions.home.cards()} contextFor={contextOf} />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

verifies("shell.home-sections", () => {
  it("shows the h1 Home, focusable for a pick in the sidebar", async () => {
    const container = await renderHome([]);
    const heading = container.querySelector("h1") as HTMLElement;
    expect(heading.textContent).toBe("Home");
    expect(heading.tabIndex).toBe(-1);
    expect(container.querySelectorAll("section")).toHaveLength(0);
  });

  it("shows each card as a region named by its heading, in Home's order", async () => {
    const container = await renderHome([
      card("recent-runs", "Runs rows"),
      card("needs-you", "Inbox rows"),
    ]);
    const sections = Array.from(container.querySelectorAll("section"));
    const names = sections.map(
      (section) =>
        document.getElementById(section.getAttribute("aria-labelledby") ?? "")?.textContent,
    );
    expect(names).toEqual(["Needs you", "Recent runs"]);
    expect(sections.map((section) => section.querySelector("h2")?.textContent)).toEqual(names);
  });

  it("draws each card's view with the context of the feature that added it", async () => {
    const container = await renderHome([card("needs-you", "Inbox rows")]);
    expect(container.querySelector("section p")?.textContent).toBe(
      "Inbox rows for needs-you-feature",
    );
  });
});
