// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { defineFeature } from "../feature.ts";
import type { PlaceContribution } from "../points/frame.ts";
import type { HomeCardContribution } from "../points/home.ts";
import { createShell } from "../shell.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { loadView } from "../view.ts";
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

  it("shows a card's count after its heading, follows it, and shows none at zero", async () => {
    let waiting = 1;
    const listeners = new Set<() => void>();
    const container = await renderHome([
      {
        ...card("needs-you", "Inbox rows"),
        signal: () => ({ mark: "count", value: waiting, spoken: `${waiting} waiting` }),
        subscribeSignal: (_context, listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    ]);
    const heard = () => {
      const heading = container.querySelector("h2")?.cloneNode(true) as Element;
      for (const hidden of heading.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
      return heading.textContent;
    };
    expect(heard()).toBe("Needs you, 1 waiting");
    expect(listeners.size).toBe(1);

    waiting = 0;
    act(() => {
      for (const listener of listeners) listener();
    });
    expect(heard()).toBe("Needs you");
    expect(listeners.size).toBe(1);
  });

  it("draws each card's view with the context of the feature that added it", async () => {
    const container = await renderHome([card("needs-you", "Inbox rows")]);
    expect(container.querySelector("section p")?.textContent).toBe(
      "Inbox rows for needs-you-feature",
    );
  });
});

// This file imports the page already, so loading Home's view costs nothing
// here; places.test.ts checks the rest of the Home place without it (HAL-5100).
verifies("shell.sidebar-places", () => {
  it("loads Home's page for the Home place the shell adds", async () => {
    const [home] = createShell({ features: [] }).contributions.places.list();
    expect(await loadView(home as PlaceContribution)).toBe(HomePage);
  });
});
