// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AccountMenuFacts, type AccountMenuHost, AccountMenuHostService } from "../api.ts";
import { AccountMenuItem } from "./account-menu-item.tsx";
import { SignedOutDialog } from "./signed-out-dialog.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];
const prototype = HTMLElement.prototype as unknown as Record<string, unknown>;
const dialogPrototype = HTMLDialogElement.prototype as unknown as Record<string, unknown>;

beforeEach(() => {
  // jsdom has neither popovers nor modal dialogs: these stand in for the browser's.
  for (const name of ["showPopover", "hidePopover", "togglePopover"]) {
    prototype[name] = () => {};
  }
  dialogPrototype["showModal"] = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
});

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  for (const name of ["showPopover", "hidePopover", "togglePopover", "showModal"]) {
    delete prototype[name];
    delete dialogPrototype[name];
  }
});

const sofia: AccountMenuFacts = {
  name: "Sofia Marin",
  productName: "Acme Agents",
  plan: "Pro",
  usedPercent: 62,
  accountUrl: "https://account.example.com/acme",
  planUrl: "https://account.example.com/acme#plan",
};

function fakeHost(
  answer: Promise<AccountMenuFacts | null>,
  signOut: () => Promise<void> = async () => {},
) {
  // Like the served host, it remembers the sign-out, which outlives any one drawing of the item.
  let signedOutOf: string | null = null;
  const listeners = new Set<() => void>();
  return {
    load: vi.fn(() => answer),
    signOut: vi.fn(async () => {
      await signOut();
      signedOutOf = (await answer)?.productName ?? null;
      for (const listener of listeners) listener();
    }),
    signedOutOf: () => signedOutOf,
    onSignedOut: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open: vi.fn<(address: string) => void>(),
    signInAddress: "/api/sign-in",
  } satisfies AccountMenuHost;
}

/**
 * Draws the menu's title bar item, unless `withItem` is false, as a phone under a place does, and
 * the feature's dialog host, which the window draws once in every layout.
 */
async function renderItem(
  host: AccountMenuHost | undefined,
  {
    withItem = true,
    announce = vi.fn(),
  }: { readonly withItem?: boolean; readonly announce?: (text: string) => void } = {},
): Promise<HTMLElement> {
  const find = (key: unknown) => (key === AccountMenuHostService ? host : undefined);
  const context = { services: { find }, announcer: { announce } } as unknown as WorkspaceContext;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <PresentationProvider presentation="desktop">
        {withItem ? <AccountMenuItem context={context} /> : null}
        <SignedOutDialog context={context} />
      </PresentationProvider>,
    );
  });
  return container;
}

function item(container: HTMLElement, label: string): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>("[role=menuitem]")].find((element) =>
    element.textContent?.includes(label),
  );
}

async function pick(container: HTMLElement, label: string): Promise<void> {
  await act(async () => item(container, label)?.click());
}

verifies("account-menu.menu", () => {
  describe("the account menu", () => {
    it("shows nothing when the computer has no menu (404)", async () => {
      const container = await renderItem(fakeHost(Promise.resolve(null)));
      expect(container.innerHTML).toBe("");
    });

    it("shows nothing when the computer can't answer, saying why, or nothing provides the host", async () => {
      const report = vi.spyOn(console, "error").mockImplementation(() => {});
      const failure = new Error("503");
      const failing = await renderItem(fakeHost(Promise.reject(failure)));
      const desktop = await renderItem(undefined);
      expect(failing.innerHTML).toBe("");
      expect(desktop.innerHTML).toBe("");
      expect(report).toHaveBeenCalledWith("Couldn't read the account menu.", failure);
      report.mockRestore();
    });

    it("names the customer and opens the answer's addresses from the usage line and Account", async () => {
      const host = fakeHost(Promise.resolve(sofia));
      const container = await renderItem(host);

      const trigger = container.querySelector("button[aria-haspopup=menu]");
      expect(trigger?.getAttribute("aria-label")).toBe("Account menu, Sofia Marin");
      expect(trigger?.textContent).toBe("SM");
      const menu = container.querySelector("[role=menu]");
      expect(menu?.textContent).toContain("Signed in as Sofia Marin");
      const items = [...container.querySelectorAll("[role=menuitem]")];
      expect(
        items.map((element) => element.getAttribute("aria-label") ?? element.textContent),
      ).toEqual(["Pro, 62% of this month's usage", "Account", "Sign out"]);

      await pick(container, "62% of this month's usage");
      await pick(container, "Account");
      expect(host.open.mock.calls).toEqual([[sofia.planUrl], [sofia.accountUrl]]);
    });

    it("reads the plan alone with no cost limit, and No plan with no plan", async () => {
      const noLimit = await renderItem(fakeHost(Promise.resolve({ ...sofia, usedPercent: null })));
      const noPlan = await renderItem(fakeHost(Promise.resolve({ ...sofia, plan: null })));
      expect(item(noLimit, "Pro")?.textContent).not.toContain("%");
      expect(item(noPlan, "No plan")?.textContent).not.toContain("%");
    });

    it("names the plan nearly used up from 80% and used up at 100%, capping the figure", async () => {
      const under = await renderItem(fakeHost(Promise.resolve({ ...sofia, usedPercent: 79 })));
      const over = await renderItem(fakeHost(Promise.resolve({ ...sofia, usedPercent: 80 })));
      const past = await renderItem(fakeHost(Promise.resolve({ ...sofia, usedPercent: 120 })));
      expect(item(under, "79%")?.getAttribute("aria-label")).toBe("Pro, 79% of this month's usage");
      expect(item(over, "80%")?.getAttribute("aria-label")).toBe(
        "Pro, 80% of this month's usage, nearly used up",
      );
      expect(item(past, "100%")?.getAttribute("aria-label")).toBe(
        "Pro, 100% of this month's usage, used up",
      );
    });

    it("shows the name as text, never as markup or a link", async () => {
      const name = '<a href="https://evil.example">Click</a>';
      const container = await renderItem(fakeHost(Promise.resolve({ ...sofia, name })));
      expect(container.querySelector("a")).toBeNull();
      expect(container.querySelector("[role=menu]")?.textContent).toContain(name);
    });
  });
});

verifies("account-menu.sign-out", () => {
  describe("Sign out", () => {
    it("signs out and shows the signed-out page, whose button opens the sign-in address", async () => {
      const host = fakeHost(Promise.resolve(sofia));
      const container = await renderItem(host);
      await pick(container, "Sign out");

      expect(host.signOut).toHaveBeenCalledOnce();
      const page = container.querySelector("dialog[open]");
      const heading = page?.querySelector("h1");
      expect(heading?.textContent).toBe("You've signed out of Acme Agents");
      expect(document.activeElement).toBe(heading);
      expect(document.title).toBe("Signed out · Acme Agents");
      expect(container.querySelector("[role=menu]")).toBeNull();

      const signIn = page?.querySelector("button");
      expect(signIn?.textContent).toBe("Sign in again");
      await act(async () => signIn?.click());
      expect(host.open).toHaveBeenCalledWith("/api/sign-in");
    });

    it("keeps the menu and says so when the session wasn't ended", async () => {
      const host = fakeHost(Promise.resolve(sofia), async () => {
        throw new Error("500");
      });
      const announce = vi.fn();
      const container = await renderItem(host, { announce });
      await pick(container, "Sign out");

      expect(container.querySelector("dialog")).toBeNull();
      expect(item(container, "Sign out")?.textContent).toContain("Couldn't sign out. Try again.");
      // The menu has closed, so the note is read out as well (WCAG 4.1.3).
      expect(announce).toHaveBeenCalledExactlyOnceWith("Couldn't sign out. Try again.", "polite");
    });

    it("keeps the signed-out page when the window draws the item again elsewhere", async () => {
      const host = fakeHost(Promise.resolve(sofia));
      const before = await renderItem(host);
      await pick(before, "Sign out");
      const first = mounted.shift();
      act(() => first?.root.unmount());
      first?.container.remove();

      // The phone's top bar draws a new item after a resize or a rotation.
      const after = await renderItem(host);
      expect(after.querySelector("dialog[open] h1")?.textContent).toBe(
        "You've signed out of Acme Agents",
      );
      expect(host.load).toHaveBeenCalledOnce();
    });

    it("shows the signed-out page where the window draws no item, as a phone under a place", async () => {
      const host = fakeHost(Promise.resolve(sofia));
      const menu = await renderItem(host);
      const underPlace = await renderItem(host, { withItem: false });
      expect(underPlace.querySelector("dialog")).toBeNull();

      await pick(menu, "Sign out");
      expect(underPlace.querySelector("dialog[open] h1")?.textContent).toBe(
        "You've signed out of Acme Agents",
      );
    });

    it("puts its title back when the window names its page again", async () => {
      const container = await renderItem(fakeHost(Promise.resolve(sofia)));
      await pick(container, "Sign out");
      await act(async () => {
        document.title = "Agents · Acme";
      });
      expect(document.title).toBe("Signed out · Acme Agents");
    });

    it("doesn't close the signed-out page on Escape", async () => {
      const container = await renderItem(fakeHost(Promise.resolve(sofia)));
      await pick(container, "Sign out");
      const cancel = new Event("cancel", { cancelable: true });
      act(() => {
        container.querySelector("dialog")?.dispatchEvent(cancel);
      });
      expect(cancel.defaultPrevented).toBe(true);
    });
  });
});
