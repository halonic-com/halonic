// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type StartedStudio, startStudio } from "./start-studio.ts";

/** A desktop window: jsdom has no `matchMedia`, and the shell follows the phone width with it. */
function desktopMediaQueries(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
}

let element: HTMLElement;
let started: StartedStudio | undefined;

beforeEach(() => {
  window.matchMedia = desktopMediaQueries;
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  element.remove();
});

verifies("studio.served-inbox", () => {
  it("has an Inbox that lists what waits on the computer it is served from", async () => {
    const asked: string[] = [];
    started = startStudio({
      element,
      window,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      fetch: async (path) => {
        asked.push(path);
        return path === "/api/workspace"
          ? Response.json({ name: "Acme", sample: false, folder: "~/Projects/acme" })
          : Response.json({ runs: [] });
      },
    });

    await vi.waitFor(() => expect(asked).toContain("/api/waiting-runs"), { timeout: 4_000 });
    await vi.waitFor(
      () => {
        const places = [...element.querySelectorAll('nav[aria-label="Places"] a')];
        expect(places.map((link) => link.textContent)).toContain("Inbox");
      },
      { timeout: 4_000 },
    );
  });
});
