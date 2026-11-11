// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { type StartedStudio, startStudio } from "./start-studio.ts";

// Under jsdom `import.meta.url` isn't a file URL, so the page is found from the package
// folder, where Vitest runs each package's tests.
const studioPage = join(process.cwd(), "studio.html");

const startingText = "Starting Halonic…";

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

/**
 * Waits until React has drawn the window's heading. React draws on its own schedule, so a
 * fixed wait is too short when CI is busy; this polls until the heading is there instead.
 */
async function drawn(root: HTMLElement): Promise<void> {
  await vi.waitFor(() => expect(root.querySelector("main h1")).not.toBeNull(), {
    timeout: 10_000,
  });
}

let started: StartedStudio | undefined;

afterEach(async () => {
  await started?.stop();
  started = undefined;
  document.body.replaceChildren();
});

verifies("studio.starting", () => {
  it("shows Starting Halonic… in the page's root until the window draws", () => {
    const page = new DOMParser().parseFromString(readFileSync(studioPage, "utf8"), "text/html");

    expect(page.getElementById("root")?.textContent).toBe(startingText);
  });

  it("replaces the text with the window when it draws", async () => {
    window.matchMedia = desktopMediaQueries;
    const root = document.createElement("div");
    root.textContent = startingText;
    document.body.append(root);

    started = startStudio({ element: root, window, userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
    await drawn(root);

    expect(root.textContent).not.toContain(startingText);
    expect(root.querySelector("main h1")?.textContent).toBe("Home");
  });
});
