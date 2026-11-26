// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type StartedStudio, startStudio } from "../studio/start-studio.ts";

/** Sofia's account menu, as the computer answers `GET /api/account-menu`. */
const sofia = {
  name: "Sofia Marin",
  productName: "Acme Agents",
  plan: "Pro",
  usedPercent: 62,
  warnings: [],
  billing: null,
  accountUrl: "https://account.example.com/acme",
  planUrl: "https://account.example.com/acme#plan",
  plansUrl: "https://account.example.com/acme/plans?from=app",
  billingUrl: "https://account.example.com/acme#billing",
  exportUrl: "https://account.example.com/acme/export",
};

let element: HTMLElement;
let started: StartedStudio | undefined;
/** The window's width; every `(width < Npx)` query follows it. */
let width = 1280;
const listeners = new Set<() => void>();
const prototype = HTMLElement.prototype as unknown as Record<string, unknown>;
const dialogPrototype = HTMLDialogElement.prototype as unknown as Record<string, unknown>;

/** jsdom has no `matchMedia`: this one follows `width` and tells the shell when it changes. */
function widthQueries(query: string): MediaQueryList {
  const below = Number(/\(width < (\d+)px\)/.exec(query)?.[1] ?? Number.NaN);
  return {
    matches: width < below,
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

/** Resizes the window, as turning a phone or narrowing a browser does. */
async function resize(to: number): Promise<void> {
  width = to;
  for (const listener of [...listeners]) listener();
  await Promise.resolve();
}

beforeEach(() => {
  width = 1280;
  window.matchMedia = widthQueries;
  // jsdom has neither popovers nor modal dialogs: these stand in for the browser's.
  for (const name of ["showPopover", "hidePopover", "togglePopover"]) {
    prototype[name] = () => {};
  }
  dialogPrototype["showModal"] = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  dialogPrototype["close"] = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  listeners.clear();
  for (const name of ["showPopover", "hidePopover", "togglePopover", "showModal", "close"]) {
    delete prototype[name];
    delete dialogPrototype[name];
  }
  element.remove();
});

/** The served Studio of Acme Agents, with Sofia signed in. */
function startAcme(): StartedStudio {
  return startStudio({
    element,
    window,
    userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    fetch: async (path) => {
      if (path === "/api/workspace") {
        return Response.json({ name: "Acme", sample: false, folder: "~/Projects/acme" });
      }
      if (path === "/api/account-menu") return Response.json(sofia);
      if (path === "/api/sign-out") return new Response(null, { status: 204 });
      return Response.json({ runs: [] });
    },
  });
}

/** The first element under `selector` whose text or label starts with `text`, once drawn. */
function found(selector: string, text: string): Promise<HTMLElement> {
  return vi.waitFor(
    () => {
      const match = [...element.querySelectorAll<HTMLElement>(selector)].find(
        (each) =>
          (each.textContent ?? "").startsWith(text) ||
          (each.getAttribute("aria-label") ?? "").startsWith(text),
      );
      expect(match).toBeDefined();
      return match as HTMLElement;
    },
    { timeout: 10_000 },
  );
}

async function click(selector: string, text: string): Promise<void> {
  (await found(selector, text)).click();
}

verifies("account-menu.sign-out", () => {
  it("keeps the signed-out page when the window narrows to a phone page under a place", {
    timeout: 30_000,
  }, async () => {
    started = startAcme();
    await click("button", "Account menu, Sofia Marin");
    await click("[role=menuitem]", "Sign out");
    await vi.waitFor(() => expect(document.title).toBe("Signed out · Acme Agents"));

    // On the phone, Settings sits under More: its top bar has Back and none of the title bar's
    // items, so the account menu's item isn't drawn there.
    await resize(390);
    await click('nav[aria-label="Places"] a', "More");
    await click("main [role=gridcell]", "Settings");
    await found("header button", "Back");
    expect(element.querySelector("header button[aria-label^='Account menu']")).toBeNull();
    const page = await vi.waitFor(
      () => {
        const open = document.querySelector("dialog[open]");
        expect(open?.querySelector("h1")?.textContent).toBe("You've signed out of Acme Agents");
        return open;
      },
      { timeout: 4_000 },
    );
    expect(page?.querySelector("button")?.textContent).toBe("Sign in again");
  });
});
