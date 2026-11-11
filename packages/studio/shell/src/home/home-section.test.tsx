// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act, use, useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HomeCardContribution, HomeSection } from "../points/home.ts";
import type { Registered } from "../points/point-store.ts";
import { reportedShellError } from "../test-support/console-errors.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { HomePage } from "./home-page.tsx";

beforeEach(() => {
  vi.useFakeTimers();
  // React logs every error a boundary catches; here the failures are the point.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Rows that arrive when the test says so, or fail. */
class PendingRows {
  promise!: Promise<string>;
  resolve!: (rows: string) => void;
  reject!: (error: unknown) => void;
  readonly #listeners = new Set<() => void>();

  constructor() {
    this.reset();
  }

  /** A new request, as the card's feature makes when its view mounts again for Try again. */
  reset(): void {
    this.promise = new Promise<string>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    // The view reads the failure; this only keeps Node from reporting it as unhandled.
    this.promise.catch(() => undefined);
  }

  /** A new request while the view shows, as a feature makes when its data changes. */
  refresh(): void {
    this.reset();
    for (const listener of this.#listeners) {
      listener();
    }
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly current = (): Promise<string> => this.promise;
}

/** A card whose view suspends until its rows arrive, as a feature's card does with `use`. */
function card(id: HomeSection, rows: PendingRows): Registered<HomeCardContribution> {
  const Card = () => <p>{use(useSyncExternalStore(rows.subscribe, rows.current))}</p>;
  return { id, view: "Card", load: async () => ({ Card }), featureId: `${id}-feature` };
}

const context = {} as WorkspaceContext;

async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function arrive(rows: PendingRows, text: string): Promise<void> {
  await act(async () => {
    rows.resolve(text);
    await rows.promise;
  });
}

async function fail(rows: PendingRows, error: unknown): Promise<void> {
  await act(async () => {
    rows.reject(error);
    await rows.promise.catch(() => undefined);
  });
  await settle();
}

function sectionNamed(container: HTMLElement, name: string): HTMLElement {
  const section = Array.from(container.querySelectorAll("section")).find(
    (candidate) => candidate.querySelector("h2")?.textContent === name,
  );
  if (section === undefined) {
    throw new Error(`No section named ${name}`);
  }
  return section;
}

function status(container: HTMLElement): string {
  return container.querySelector('[role="status"]')?.textContent ?? "";
}

function renderHome(cards: readonly Registered<HomeCardContribution>[]): HTMLElement {
  return render(<HomePage cards={cards} contextFor={() => context} />);
}

verifies("shell.home-states", () => {
  it("shows nothing for 300ms, then skeleton rows, with one Loading Home for every section", async () => {
    const inbox = new PendingRows();
    const runs = new PendingRows();
    const container = renderHome([card("needs-you", inbox), card("recent-runs", runs)]);
    await settle();
    expect(container.querySelector('[aria-hidden="true"].border')).toBeNull();
    expect(status(container)).toBe("");

    await wait(300);
    for (const name of ["Needs you", "Recent runs"]) {
      const skeleton = sectionNamed(container, name).querySelector('div[aria-hidden="true"]');
      expect(skeleton?.children).toHaveLength(3);
    }
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(status(container)).toBe("Loading Home");

    await arrive(inbox, "2 waiting rows");
    expect(sectionNamed(container, "Needs you").querySelector("p")?.textContent).toBe(
      "2 waiting rows",
    );
    expect(status(container)).toBe("Loading Home");
    await arrive(runs, "5 runs");
    expect(status(container)).toBe("");
  });

  it("shows no skeleton for Get set up while it loads", async () => {
    const setup = new PendingRows();
    const container = renderHome([card("setup", setup)]);
    await wait(300);
    const section = sectionNamed(container, "Get set up");
    expect(section.children).toHaveLength(1);
    expect(status(container)).toBe("");
  });

  it("shows a failing section's error in place of its rows, and keeps the others", async () => {
    const inbox = new PendingRows();
    const runs = new PendingRows();
    const container = renderHome([card("needs-you", inbox), card("recent-runs", runs)]);
    await settle();
    await arrive(inbox, "2 waiting rows");
    await fail(runs, new KindedError("internal", "socket closed"));

    const section = sectionNamed(container, "Recent runs");
    expect(section.querySelector("h3")?.textContent).toBe("Couldn't load recent runs");
    expect(section.querySelector("p")?.textContent).not.toContain("socket closed");
    expect(section.querySelector("button")?.textContent).toBe("Try again");
    expect(sectionNamed(container, "Needs you").querySelector("p")?.textContent).toBe(
      "2 waiting rows",
    );
  });

  it("says why sections failed once, not once per section", async () => {
    const inbox = new PendingRows();
    const runs = new PendingRows();
    const container = renderHome([card("needs-you", inbox), card("recent-runs", runs)]);
    await settle();
    const notAnswering = "Halonic on your computer isn't answering.";
    await fail(inbox, new KindedError("unavailable", notAnswering));
    expect(status(container)).toBe(notAnswering);

    await fail(runs, new KindedError("unavailable", notAnswering));
    expect(sectionNamed(container, "Needs you").querySelector("h3")?.textContent).toBe(
      "Couldn't load what needs you",
    );
    expect(sectionNamed(container, "Recent runs").querySelector("h3")?.textContent).toBe(
      "Couldn't load recent runs",
    );
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(status(container)).toBe(notAnswering);
  });

  it("says why a section failed instead of Loading Home while another still loads", async () => {
    const inbox = new PendingRows();
    const runs = new PendingRows();
    const container = renderHome([card("needs-you", inbox), card("recent-runs", runs)]);
    await settle();
    const notAnswering = "Halonic on your computer isn't answering.";
    await fail(inbox, new KindedError("unavailable", notAnswering));

    await wait(300);
    expect(
      sectionNamed(container, "Recent runs").querySelector('div[aria-hidden="true"]'),
    ).not.toBe(null);
    expect(status(container)).toBe(notAnswering);
  });

  it("keeps saying Loading Home when a section fails without a reason", async () => {
    const inbox = new PendingRows();
    const runs = new PendingRows();
    const container = renderHome([card("needs-you", inbox), card("recent-runs", runs)]);
    await wait(300);
    expect(status(container)).toBe("Loading Home");

    await fail(inbox, new KindedError("unavailable", ""));
    expect(sectionNamed(container, "Needs you").querySelector("h3")?.textContent).toBe(
      "Couldn't load what needs you",
    );
    expect(status(container)).toBe("Loading Home");

    const notAnswering = "Halonic on your computer isn't answering.";
    await fail(runs, new KindedError("unavailable", notAnswering));
    expect(status(container)).toBe(notAnswering);
  });

  it("stops saying a reason once no section fails for it", async () => {
    const runs = new PendingRows();
    const container = renderHome([card("recent-runs", runs)]);
    await settle();
    await fail(runs, new KindedError("unavailable", "Halonic on your computer isn't answering."));

    runs.reset();
    act(() => sectionNamed(container, "Recent runs").querySelector("button")?.click());
    await settle();
    await arrive(runs, "5 runs");
    expect(status(container)).toBe("");
  });

  it("focuses the heading when Try again works, and the error's title when it fails again", async () => {
    const runs = new PendingRows();
    const container = renderHome([card("recent-runs", runs)]);
    await settle();
    await fail(runs, new Error("boom"));
    const section = sectionNamed(container, "Recent runs");

    runs.reset();
    act(() => section.querySelector("button")?.click());
    await settle();
    await fail(runs, new Error("boom"));
    expect(document.activeElement).toBe(section.querySelector("h3"));

    runs.reset();
    act(() => section.querySelector("button")?.click());
    await settle();
    await arrive(runs, "5 runs");
    expect(section.querySelector("p")?.textContent).toBe("5 runs");
    expect(document.activeElement).toBe(section.querySelector("h2"));
  });

  it("leaves focus where it is when a section loads again after Try again worked", async () => {
    const inbox = new PendingRows();
    const runs = new PendingRows();
    const container = renderHome([card("needs-you", inbox), card("recent-runs", runs)]);
    await settle();
    await arrive(inbox, "2 waiting rows");
    await fail(runs, new Error("boom"));
    const section = sectionNamed(container, "Recent runs");

    runs.reset();
    act(() => section.querySelector("button")?.click());
    await settle();
    await arrive(runs, "5 runs");
    expect(document.activeElement).toBe(section.querySelector("h2"));

    const elsewhere = sectionNamed(container, "Needs you").querySelector("h2");
    act(() => elsewhere?.focus());
    act(() => runs.refresh());
    await wait(300);
    expect(section.querySelector('div[aria-hidden="true"]')?.children).toHaveLength(3);
    await arrive(runs, "6 runs");
    expect(section.querySelector("p")?.textContent).toBe("6 runs");
    expect(document.activeElement).toBe(elsewhere);
  });

  it("imports a card's view again on Try again after the import failed", async () => {
    let imports = 0;
    const Card = () => <p>Recent runs rows</p>;
    const flaky: Registered<HomeCardContribution> = {
      id: "recent-runs",
      view: "Card",
      featureId: "runs",
      load: async () => {
        imports += 1;
        if (imports === 1) {
          throw new Error("chunk missing");
        }
        return { Card };
      },
    };
    const container = renderHome([flaky]);
    await settle();
    const section = sectionNamed(container, "Recent runs");
    expect(section.querySelector("h3")?.textContent).toBe("Couldn't load recent runs");

    act(() => section.querySelector("button")?.click());
    await settle();
    expect(imports).toBe(2);
    expect(section.querySelector("p")?.textContent).toBe("Recent runs rows");
  });

  it("shows the error for a card whose view isn't exported, reports it, and keeps the others", async () => {
    const inbox = new PendingRows();
    const misnamed: Registered<HomeCardContribution> = {
      id: "recent-runs",
      view: "RecentRunsCard",
      featureId: "runs",
      load: async () => ({ RunsCard: () => <p>Recent runs rows</p> }),
    };
    const container = renderHome([card("needs-you", inbox), misnamed]);
    await settle();
    await arrive(inbox, "2 waiting rows");

    const section = sectionNamed(container, "Recent runs");
    expect(section.querySelector("h3")?.textContent).toBe("Couldn't load recent runs");
    expect(section.querySelector("button")?.textContent).toBe("Try again");
    expect(sectionNamed(container, "Needs you").querySelector("p")?.textContent).toBe(
      "2 waiting rows",
    );
    expect(reportedShellError(vi.mocked(console.error).mock.calls)?.message).toContain(
      '"RecentRunsCard"',
    );
  });
});
