// @vitest-environment jsdom

import { verifies, waitUntil } from "@halonicjs/testing-spec";
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

/** A Google setup the computer lists, started but not signed in. */
const googleSetup = {
  accountRef: "gaccount_abc123",
  account: "kim@acme.example",
  available: [{ id: "gmail", label: "Gmail", googleApis: [], googleScopes: [] }],
  route: { app: "own", runsOn: "this-computer" },
  accountType: "personal",
  startedAt: "2026-11-08T10:00:00.000Z",
  projectId: null,
  stepsDone: {},
  inProductionTickedAt: null,
  clientId: null,
  clientSecretSavedAt: null,
  signInStartedAt: null,
  lastSignInAt: null,
  wrongAccountAt: null,
  lastSignInEnded: null,
  refreshRefused: null,
  services: {},
};

let element: HTMLElement;
let started: StartedStudio | undefined;
let restoreDialogs: (() => void) | undefined;

/** jsdom has `<dialog>` but no `showModal()` or `close()`; the Ctrl K palette opens with them. */
function fakeModalDialogs(): () => void {
  const prototype = HTMLDialogElement.prototype;
  Object.defineProperty(prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  return () => {
    Reflect.deleteProperty(prototype, "showModal");
    Reflect.deleteProperty(prototype, "close");
  };
}

beforeEach(() => {
  window.matchMedia = desktopMediaQueries;
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  restoreDialogs?.();
  restoreDialogs = undefined;
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

  it("names the asking agent as the computer names it, not by its id", async () => {
    const waiting = {
      id: "run_acme1",
      status: "waiting",
      workflowId: "reply",
      hubId: "support",
      startedAt: "2026-11-19T10:00:00.000Z",
      lastSeq: 4,
      accepts: ["approve", "reject"],
      approvals: [
        {
          agent: "writer",
          tool: "read_note",
          connector: "notes",
          args: {},
          callId: "call_1",
          at: "2026-11-19T10:00:01.000Z",
          state: "draft",
          branch: null,
          item: null,
        },
      ],
    };
    started = startStudio({
      element,
      window,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      fetch: async (path) =>
        path === "/api/workspace"
          ? Response.json({ name: "Acme", sample: false, folder: "~/Projects/acme" })
          : Response.json({ runs: [waiting], agents: { writer: "Writer" } }),
    });

    // With a run waiting, the Inbox row carries its count as well as its name.
    const inbox = await vi.waitFor(
      () => {
        const link = [...element.querySelectorAll('nav[aria-label="Places"] a')].find((a) =>
          a.textContent?.startsWith("Inbox"),
        );
        expect(link).toBeDefined();
        return link as HTMLElement;
      },
      { timeout: 4_000 },
    );
    inbox.click();
    await vi.waitFor(() => expect(element.textContent).toContain("Writer wants to use read_note"), {
      timeout: 4_000,
    });
    expect(element.textContent).not.toContain("writer wants to use");
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

/** A phone's window, 390px wide: each `(width < Npx)` query matches when 390 is below N. */
function phoneMediaQueries(query: string): MediaQueryList {
  const below = Number(/\(width < (\d+)px\)/.exec(query)?.[1] ?? Number.NaN);
  return { ...desktopMediaQueries(query), matches: 390 < below };
}

/** The served Studio of the workspace Acme, with nothing waiting. */
function startAcme(): StartedStudio {
  return startStudio({
    element,
    window,
    userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    fetch: async (path) =>
      path === "/api/workspace"
        ? Response.json({ name: "Acme", sample: false, folder: "~/Projects/acme" })
        : Response.json({ runs: [] }),
  });
}

/** Clicks the first element under `selector` whose text is `text`, once the window has drawn it. */
async function click(selector: string, text: string): Promise<void> {
  const found = await vi.waitFor(
    () => {
      const match = [...element.querySelectorAll<HTMLElement>(selector)].find(
        (each) => each.textContent === text,
      );
      expect(match).toBeDefined();
      return match as HTMLElement;
    },
    { timeout: 4_000 },
  );
  found.click();
}

verifies("studio.served-settings", () => {
  it("lists Appearance and Formats on this phone, and no group on your computer", async () => {
    window.matchMedia = phoneMediaQueries;
    started = startAcme();
    const more = await vi.waitFor(
      () => {
        const link = element.querySelector<HTMLElement>(
          'nav[aria-label="Places"] a[aria-label^="More"]',
        );
        expect(link).not.toBeNull();
        return link as HTMLElement;
      },
      { timeout: 4_000 },
    );
    more.click();
    await click("main [role=gridcell]", "Settings");

    const headings = await vi.waitFor(
      () => {
        const found = [...element.querySelectorAll("main h2")].map((h) => h.textContent);
        expect(found).toContain("On this phone");
        return found;
      },
      { timeout: 4_000 },
    );
    expect(headings).not.toContain("On your computer");
    const rows = [...element.querySelectorAll("main tr [role=gridcell]")].map(
      (cell) => cell.textContent?.split(/(?=[A-Z])/)[0],
    );
    expect(rows).toContain("Appearance");
    expect(rows).toContain("Formats");
    expect(element.textContent).not.toContain("Agent sandbox");
    expect(element.textContent).not.toContain("Assistant");
  });

  it("offers no Ctrl K command that opens Assistant, Agent sandbox or About Halonic", async () => {
    restoreDialogs = fakeModalDialogs();
    started = startAcme();
    await inboxLink();
    // Pressed again until the box shows: the window listens for Ctrl K once it has drawn.
    const box = await vi.waitFor(
      () => {
        const field = element.querySelector<HTMLInputElement>("[role=combobox]");
        if (field === null) {
          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "k",
              ctrlKey: true,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
        expect(field).not.toBeNull();
        return field as HTMLInputElement;
      },
      { timeout: 4_000 },
    );
    // Types `words` and waits until the palette says `said`, as it does once typing stops.
    const search = async (words: string, said: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(box, words);
      box.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.waitFor(() => expect(element.textContent).toContain(said), { timeout: 4_000 });
      return [...element.querySelectorAll("[role=option]")].map((option) => option.textContent);
    };

    expect((await search("Appearance", "1 result")).join()).toContain("Appearance");
    expect(await search("Assistant", "No results")).toEqual([]);
    expect(await search("Agent sandbox", "No results")).toEqual([]);
    expect(await search("About Halonic", "No results")).toEqual([]);
  });
});

verifies("studio.served-google-setup-accounts", () => {
  it("lists the Google setup in the served window's Inbox, read-only", {
    timeout: 30_000,
  }, async () => {
    started = startStudio({
      element,
      window,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      fetch: async (path) => {
        if (path === "/api/google/setups") {
          return Response.json({ signIn: "elsewhere", setups: [googleSetup] });
        }
        return path === "/api/workspace"
          ? Response.json({ name: "Acme", sample: false, folder: "~/Projects/acme" })
          : Response.json({ runs: [] });
      },
    });
    const find = (text: RegExp) =>
      [...element.querySelectorAll<HTMLElement>("a, button, td[role=gridcell]")].find((e) =>
        text.test(e.textContent ?? ""),
      );
    await waitUntil("the Inbox place to be in the window", () => find(/^Inbox/) !== undefined, {
      timeout: 10_000,
    });
    expect(find(/^Library/)).toBeUndefined();
    find(/^Inbox/)?.click();
    await waitUntil(
      "the Google setup item to be listed",
      () => find(/Set up Google for kim@acme.example/) !== undefined,
      { timeout: 10_000 },
    );
    find(/Set up Google for kim@acme.example/)?.click();
    await waitUntil(
      "the read-only setup to be shown",
      () => (element.textContent ?? "").includes("This window only shows the setup."),
      { timeout: 10_000 },
    );
  });
});
