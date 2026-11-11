// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, use, useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import type { HomeCardContribution } from "../points/home.ts";
import type { Registered } from "../points/point-store.ts";
import { createShell } from "../shell.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { HomePage } from "./home-page.tsx";
import { HomeSectionEmpty } from "./home-section.tsx";

beforeEach(() => {
  vi.useFakeTimers();
  // React logs every error a boundary catches; here the failure is the point.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const context = {} as WorkspaceContext;

/** The cards a plugin feature would show, which change while Home shows. */
class PluginCards {
  #titles: readonly string[] = [];
  readonly #listeners = new Set<() => void>();

  set(titles: readonly string[]): void {
    this.#titles = titles;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly current = (): readonly string[] => this.#titles;
}

function cardsSection(view: () => unknown): Registered<HomeCardContribution> {
  return { id: "cards", view: "Cards", load: async () => ({ Cards: view }), featureId: "plugins" };
}

function rowsSection(): Registered<HomeCardContribution> {
  return {
    id: "recent-runs",
    view: "Runs",
    load: async () => ({ Runs: () => <p>Runs rows</p> }),
    featureId: "runs",
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function regionNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("section"))
    .filter((section) => !section.hidden)
    .map((section) => section.querySelector("h2")?.textContent ?? "");
}

verifies("shell.home-cards-section", () => {
  it("shows Cards after Recent runs, whatever order the features register in", async () => {
    const shell = createShell({
      features: [
        defineFeature({
          id: "plugins",
          title: "Plugins",
          register: (studio) => studio.home.addCard(cardsSection(() => <p>A card</p>)),
        }),
        defineFeature({
          id: "runs",
          title: "Runs",
          register: (studio) => studio.home.addCard(rowsSection()),
        }),
      ],
    });
    const container = render(
      <HomePage cards={shell.contributions.home.cards()} contextFor={() => context} />,
    );
    await settle();
    expect(regionNames(container)).toEqual(["Recent runs", "Cards"]);
  });

  it("titles the section's error Couldn't load cards", async () => {
    const container = render(
      <HomePage
        cards={[
          {
            id: "cards",
            view: "Cards",
            load: async () => Promise.reject(new Error("chunk failed")),
            featureId: "plugins",
          },
        ]}
        contextFor={() => context}
      />,
    );
    await settle();
    expect(container.querySelector("section h3")?.textContent).toBe("Couldn't load cards");
    expect(container.querySelector("section button")?.textContent).toBe("Try again");
  });

  it("shows two skeleton cards, not rows, while Cards loads", async () => {
    const never = new Promise<never>(() => undefined);
    const container = render(
      <HomePage cards={[cardsSection(() => use(never))]} contextFor={() => context} />,
    );
    await settle();
    const section = container.querySelector("section");
    expect(section?.querySelector('[aria-hidden="true"]')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const skeleton = section?.querySelector('[aria-hidden="true"]');
    expect(skeleton?.children).toHaveLength(2);
    expect(skeleton?.querySelectorAll(".rounded-md.border")).toHaveLength(2);
    expect(skeleton?.querySelectorAll(".border-t")).toHaveLength(2);
  });

  it("hides the whole section while its card has nothing, and shows it again when it has", async () => {
    const plugins = new PluginCards();
    const Cards = () => {
      const titles = useSyncExternalStore(plugins.subscribe, plugins.current);
      return titles.length === 0 ? <HomeSectionEmpty /> : <p>{titles.join(", ")}</p>;
    };
    const container = render(
      <HomePage cards={[rowsSection(), cardsSection(Cards)]} contextFor={() => context} />,
    );
    await settle();
    expect(regionNames(container)).toEqual(["Recent runs"]);

    act(() => plugins.set(["Today's weather"]));
    expect(regionNames(container)).toEqual(["Recent runs", "Cards"]);
    expect(container.querySelectorAll("section")[1]?.querySelector("p")?.textContent).toBe(
      "Today's weather",
    );

    act(() => plugins.set([]));
    expect(regionNames(container)).toEqual(["Recent runs"]);
  });
});
