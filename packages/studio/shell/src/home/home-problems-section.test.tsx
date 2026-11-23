// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, use } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import type { HomeCardContribution } from "../points/home.ts";
import type { Registered } from "../points/point-store.ts";
import { createShell } from "../shell.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { HomePage } from "./home-page.tsx";

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

function problemsSection(
  load: HomeCardContribution["load"] = async () => ({ Problems: () => <p>Sorter</p> }),
): Registered<HomeCardContribution> {
  return { id: "problems", view: "Problems", load, featureId: "files" };
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

verifies("shell.home-problems-section", () => {
  it("shows Problems first, before Get set up and Needs you, whatever order the features register in", async () => {
    const rows = (id: "setup" | "needs-you") => ({
      id,
      view: "Rows",
      load: async () => ({ Rows: () => <p>Rows</p> }),
    });
    const shell = createShell({
      features: [
        defineFeature({
          id: "inbox",
          title: "Inbox",
          register: (studio) => studio.home.addCard(rows("needs-you")),
        }),
        defineFeature({
          id: "first-run",
          title: "First Run",
          register: (studio) => studio.home.addCard(rows("setup")),
        }),
        defineFeature({
          id: "files",
          title: "Files",
          register: (studio) => studio.home.addCard(problemsSection()),
        }),
      ],
    });
    const container = render(
      <HomePage cards={shell.contributions.home.cards()} contextFor={() => context} />,
    );
    await settle();
    expect(regionNames(container)).toEqual(["Problems", "Get set up", "Needs you"]);
  });

  it("titles the section's error Couldn't load problems", async () => {
    const container = render(
      <HomePage
        cards={[problemsSection(async () => Promise.reject(new Error("chunk failed")))]}
        contextFor={() => context}
      />,
    );
    await settle();
    expect(container.querySelector("section h3")?.textContent).toBe("Couldn't load problems");
    expect(container.querySelector("section button")?.textContent).toBe("Try again");
  });

  it("shows no section, heading and skeleton included, while Problems' data loads", async () => {
    const never = new Promise<never>(() => undefined);
    const container = render(
      <HomePage
        cards={[problemsSection(async () => ({ Problems: () => use(never) }))]}
        contextFor={() => context}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(regionNames(container)).toEqual([]);
    expect(container.querySelector('section [aria-hidden="true"]')).toBeNull();
  });

  it("shows no section while Problems' view is still importing", async () => {
    const container = render(
      <HomePage
        cards={[problemsSection(() => new Promise<never>(() => undefined))]}
        contextFor={() => context}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(regionNames(container)).toEqual([]);
  });

  it("shows the section once its card renders rows", async () => {
    const container = render(<HomePage cards={[problemsSection()]} contextFor={() => context} />);
    await settle();
    expect(regionNames(container)).toEqual(["Problems"]);
    expect(container.querySelector("section p")?.textContent).toBe("Sorter");
  });
});
