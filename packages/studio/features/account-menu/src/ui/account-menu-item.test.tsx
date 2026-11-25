// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AccountMenuFacts, type AccountMenuHost, AccountMenuHostService } from "../api.ts";
import { AccountMenuItem } from "./account-menu-item.tsx";

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
  return {
    load: vi.fn(() => answer),
    signOut: vi.fn(signOut),
    open: vi.fn<(address: string) => void>(),
    signInAddress: "/api/sign-in",
  } satisfies AccountMenuHost;
}

async function renderItem(host: AccountMenuHost | undefined): Promise<HTMLElement> {
  const find = (key: unknown) => (key === AccountMenuHostService ? host : undefined);
  const context = { services: { find } } as unknown as WorkspaceContext;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <PresentationProvider presentation="desktop">
        <AccountMenuItem context={context} />
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

    it("shows nothing when the computer can't answer, or nothing provides the host", async () => {
      const failing = await renderItem(fakeHost(Promise.reject(new Error("503"))));
      const desktop = await renderItem(undefined);
      expect(failing.innerHTML).toBe("");
      expect(desktop.innerHTML).toBe("");
    });

    it("names the customer and opens the answer's addresses from the usage line and Account", async () => {
      const host = fakeHost(Promise.resolve(sofia));
      const container = await renderItem(host);

      const trigger = container.querySelector("button[aria-haspopup=menu]");
      expect(trigger?.getAttribute("aria-label")).toBe("Account menu, Sofia Marin");
      expect(trigger?.textContent).toBe("SM");
      expect(container.querySelector("[role=menu]")?.textContent).toContain("Sofia Marin");

      await pick(container, "Pro · 62% of this month's usage");
      await pick(container, "Account");
      expect(host.open.mock.calls).toEqual([[sofia.planUrl], [sofia.accountUrl]]);
    });

    it("reads the plan alone with no cost limit, and No plan with no plan", async () => {
      const noLimit = await renderItem(fakeHost(Promise.resolve({ ...sofia, usedPercent: null })));
      const noPlan = await renderItem(fakeHost(Promise.resolve({ ...sofia, plan: null })));
      expect(item(noLimit, "Pro")?.textContent).not.toContain("%");
      expect(item(noPlan, "No plan")).toBeDefined();
    });

    it("marks the usage line from 80%", async () => {
      const under = await renderItem(fakeHost(Promise.resolve({ ...sofia, usedPercent: 79 })));
      const over = await renderItem(fakeHost(Promise.resolve({ ...sofia, usedPercent: 80 })));
      expect(item(under, "79%")?.textContent).not.toContain("nearly used up");
      expect(item(over, "80%")?.textContent).toContain("nearly used up");
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
      expect(page?.querySelector("h1")?.textContent).toBe("You've signed out of Acme Agents");
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
      const container = await renderItem(host);
      await pick(container, "Sign out");

      expect(container.querySelector("dialog")).toBeNull();
      expect(item(container, "Sign out")?.textContent).toContain("Couldn't sign out. Try again.");
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
