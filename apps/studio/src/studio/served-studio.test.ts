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

/** The Inbox row of the Places list, once the window has drawn it. */
function inboxLink(): Promise<HTMLElement> {
  return vi.waitFor(
    () => {
      const link = [...element.querySelectorAll('nav[aria-label="Places"] a')].find(
        (a) => a.textContent === "Inbox",
      );
      expect(link).toBeDefined();
      return link as HTMLElement;
    },
    { timeout: 4_000 },
  );
}

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

  it("shows nothing waiting when the computer lists no waiting run", async () => {
    started = startStudio({
      element,
      window,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      fetch: async (path) =>
        path === "/api/workspace"
          ? Response.json({ name: "Acme", sample: false, folder: "~/Projects/acme" })
          : Response.json({ runs: [] }),
    });

    const inbox = await inboxLink();
    inbox.click();
    await vi.waitFor(() => expect(element.textContent).toContain("Nothing is waiting for you"), {
      timeout: 4_000,
    });
  });

  it("reads again when the page's window comes to the front, and lets go when it stops", async () => {
    const page = new EventTarget();
    let asks = 0;
    started = startStudio({
      element,
      window: page,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      fetch: async (path) => {
        if (path === "/api/waiting-runs") asks += 1;
        return path === "/api/workspace"
          ? Response.json({ name: "Acme", sample: false, folder: "~/Projects/acme" })
          : Response.json({ runs: [] });
      },
    });
    (await inboxLink()).click();
    await vi.waitFor(() => expect(asks).toBeGreaterThan(0), { timeout: 4_000 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const before = asks;

    page.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(asks).toBeGreaterThan(before), { timeout: 4_000 });

    await started.stop();
    started = undefined;
    const stopped = asks;
    page.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asks).toBe(stopped);
  });
});
