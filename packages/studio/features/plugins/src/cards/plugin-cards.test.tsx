// @vitest-environment jsdom

import { parseFile } from "@halonicjs/format";
import {
  createShell,
  defineFeature,
  type HomeCardProps,
  loadView,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginCommandArgs, PluginToolCaller } from "../commands/plugin-command-dialog.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { PluginCard, type PluginCardStatus, type PluginCardUi } from "./plugin-card.tsx";
import { type PluginCardFeed, type PluginCards, pluginHomeCards } from "./plugin-home-cards.ts";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

/** The Weather plugin's card, parsed by the real `plugin` kind. */
function todaysWeather(): PluginCardUi {
  const parsed = parseFile(
    "plugin",
    `id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.example.com]
  tools:
    - { name: forecast, description: The forecast., risk: read, untrusted: true }
ui:
  cards:
    - { id: today, title: Today's weather, tool: forecast, args: { place: Ghent } }
  panel: { title: Weather }`,
  );
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  const card = parsed.value.value.ui?.cards[0];
  if (card === undefined) throw new Error("No card");
  return card;
}

/** A caller whose answers the test gives, one call at a time. */
function callerWithAnswers() {
  const calls: {
    tool: string;
    args: PluginCommandArgs;
    settle: (answer: string | Error) => void;
  }[] = [];
  const caller: PluginToolCaller = {
    call: (_plugin, tool, args) =>
      new Promise<string>((resolve, reject) => {
        calls.push({
          tool,
          args,
          settle: (answer) => (answer instanceof Error ? reject(answer) : resolve(answer)),
        });
      }),
  };
  /** Settles the latest call and lets React show it. */
  const answer = async (value: string | Error) => {
    await act(async () => calls.at(-1)?.settle(value));
  };
  return { caller, calls, answer };
}

function showCard(caller: PluginToolCaller, status: PluginCardStatus = "on") {
  const review = vi.fn();
  const details = vi.fn();
  const view = render(
    <PluginCard
      plugin={{ id: "weather", name: "Weather" }}
      status={status}
      card={todaysWeather()}
      caller={caller}
      onReview={review}
      onDetails={details}
    />,
  );
  return { view, review, details };
}

function button(view: HTMLElement, name: string): HTMLButtonElement {
  const found = [...view.querySelectorAll("button")].find(
    (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent?.trim()) === name,
  );
  if (found === undefined) throw new Error(`No button ${name}`);
  return found;
}

verifies("plugins.plugin-cards", () => {
  it("shows the card's title, its tool's answer and where it comes from", async () => {
    const { caller, calls, answer } = callerWithAnswers();
    const { view } = showCard(caller);
    expect(calls.map(({ tool, args }) => ({ tool, args }))).toEqual([
      { tool: "forecast", args: { place: "Ghent" } },
    ]);
    await answer("Sunny");
    expect(view.querySelector("h3")?.textContent).toBe("Today's weather");
    expect(view.textContent).toContain("Sunny");
    expect(view.textContent).toContain("From the Weather plugin");
  });

  it("shows the title and the footer while the answer loads, and only the answer's skeleton", async () => {
    const { caller } = callerWithAnswers();
    const { view } = showCard(caller);
    expect(view.querySelector("h3")?.textContent).toBe("Today's weather");
    expect(view.textContent).toContain("From the Weather plugin");
    expect(view.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(view.querySelector('[aria-hidden="true"].flex-col')).toBeNull();
    await act(async () => vi.advanceTimersByTime(300));
    expect(view.querySelectorAll('[aria-hidden="true"].flex-col > span')).toHaveLength(2);
    expect(button(view, "Refresh Today's weather").getAttribute("aria-busy")).not.toBe("true");
  });

  it("restarts the first call on Refresh, and keeps the latest answer", async () => {
    const { caller, calls } = callerWithAnswers();
    const { view } = showCard(caller);
    act(() => button(view, "Refresh Today's weather").click());
    expect(calls).toHaveLength(2);
    await act(async () => calls[0]?.settle("Old"));
    expect(view.textContent).not.toContain("Old");
    await act(async () => calls[1]?.settle("Sunny"));
    expect(view.textContent).toContain("Sunny");
  });

  it("calls the tool again on Refresh, keeping the answer until the new one comes", async () => {
    const { caller, calls, answer } = callerWithAnswers();
    const { view } = showCard(caller);
    await answer("Sunny");
    act(() => button(view, "Refresh Today's weather").click());
    expect(calls).toHaveLength(2);
    expect(view.textContent).toContain("Sunny");
    expect(button(view, "Refresh Today's weather").getAttribute("aria-busy")).toBe("true");
    await answer("Rain");
    expect(view.textContent).toContain("Rain");
    expect(view.textContent).not.toContain("Sunny");
  });

  it("says why the call failed with Try again, in a live region, and calls again on Try again", async () => {
    const { caller, calls, answer } = callerWithAnswers();
    const { view } = showCard(caller);
    await answer(new Error("the service is busy."));
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("Couldn't get Today's weather: the service is busy.");
    act(() => button(view, "Try again").click());
    expect(calls).toHaveLength(2);
    await answer("Sunny");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe("");
    expect(view.textContent).toContain("Sunny");
  });

  it("keeps a card whose plugin isn't trusted empty, with Review, and calls nothing", () => {
    const { caller, calls } = callerWithAnswers();
    const { view, review } = showCard(caller, "not-trusted");
    expect(view.textContent).toContain("Weather isn't trusted yet, so this card is empty.");
    expect(view.textContent).toContain("From the Weather plugin");
    expect(() => button(view, "Refresh Today's weather")).toThrow();
    expect(view.querySelector("h3")?.parentElement?.className).toContain("min-h-control-sm");
    act(() => button(view, "Review").click());
    expect(review).toHaveBeenCalledOnce();
    expect(calls).toEqual([]);
  });

  it("keeps a card whose plugin can't load empty, with Details", () => {
    const { caller, calls } = callerWithAnswers();
    const { view, details } = showCard(caller, "cant-load");
    expect(view.textContent).toContain("Weather couldn't load, so this card is empty.");
    act(() => button(view, "Details").click());
    expect(details).toHaveBeenCalledOnce();
    expect(calls).toEqual([]);
  });

  describe("Home's Cards section", () => {
    /** A feed the test changes while Home shows. */
    function feedOf(initial: readonly PluginCards[]) {
      let plugins = initial;
      const listeners = new Set<() => void>();
      const feed: PluginCardFeed = {
        current: () => plugins,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
      const set = (next: readonly PluginCards[]) => {
        plugins = next;
        act(() => {
          for (const listener of listeners) listener();
        });
      };
      return { feed, set };
    }

    async function homeCards(feed: PluginCardFeed, caller: PluginToolCaller) {
      const shell = createShell({
        features: [
          defineFeature({
            id: "plugins",
            title: "Plugins",
            register: (studio) =>
              studio.home.addCard(
                pluginHomeCards({ feed, caller, review: vi.fn(), details: vi.fn() }),
              ),
          }),
        ],
      });
      const [card] = shell.contributions.home.cards();
      if (card === undefined) throw new Error("No Home card");
      expect(card.id).toBe("cards");
      return await loadView<ComponentType<HomeCardProps>>(card);
    }

    const context = {} as WorkspaceContext;
    const weather = (status: PluginCardStatus): PluginCards => ({
      plugin: "weather",
      name: "Weather",
      status,
      cards: [todaysWeather()],
    });

    it("shows every plugin's cards, and nothing once no plugin has one", async () => {
      const { caller, answer } = callerWithAnswers();
      const { feed, set } = feedOf([weather("on")]);
      const View = await homeCards(feed, caller);
      const view = render(<View context={context} />);
      await answer("Sunny");
      expect(view.querySelectorAll("h3")).toHaveLength(1);
      expect(view.textContent).toContain("Sunny");

      set([]);
      expect(view.textContent).toBe("");
    });

    it("keeps the card in its place when its plugin turns off, and calls again when it's on", async () => {
      const { caller, calls, answer } = callerWithAnswers();
      const { feed, set } = feedOf([weather("on")]);
      const View = await homeCards(feed, caller);
      const view = render(<View context={context} />);
      await answer("Sunny");

      set([weather("not-trusted")]);
      expect(view.textContent).toContain("Weather isn't trusted yet, so this card is empty.");

      set([weather("on")]);
      expect(calls).toHaveLength(2);
      await answer("Rain");
      expect(view.textContent).toContain("Rain");
    });
  });
});
