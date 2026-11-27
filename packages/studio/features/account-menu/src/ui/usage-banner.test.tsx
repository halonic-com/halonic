// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AccountMenuFacts,
  type AccountMenuHost,
  AccountMenuHostService,
  type UsageWarning,
} from "../api.ts";
import { UsageBanner } from "./usage-banner.tsx";
import { usageBannerWords } from "./usage-banner-words.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  localStorage.clear();
});

const december = "2026-12-02T00:00:00.000Z";
const january = "2027-01-02T00:00:00.000Z";

const agentTime: UsageWarning = { unit: "harnessMs", percent: 82, resetsAt: december };

function facts(warnings: readonly UsageWarning[]): AccountMenuFacts {
  return {
    name: "Sofia Marin",
    productName: "Acme Agents",
    plan: "Pro",
    usedPercent: 40,
    warnings,
    accountUrl: "https://account.example.com/acme",
    planUrl: "https://account.example.com/acme#plan",
  };
}

function fakeHost(answer: Promise<AccountMenuFacts | null>) {
  let signedOutOf: string | null = null;
  const listeners = new Set<() => void>();
  return {
    load: vi.fn(() => answer),
    signOut: async () => {
      signedOutOf = "Acme Agents";
      for (const listener of listeners) listener();
    },
    signedOutOf: () => signedOutOf,
    onSignedOut: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open: vi.fn<(address: string) => void>(),
    signInAddress: "/api/sign-in",
  } satisfies AccountMenuHost;
}

async function renderBanner(host: AccountMenuHost | undefined): Promise<HTMLElement> {
  const find = (key: unknown) => (key === AccountMenuHostService ? host : undefined);
  const context = { services: { find } } as unknown as WorkspaceContext;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <PresentationProvider presentation="desktop">
        <main>
          <h1>Runs</h1>
        </main>
        <UsageBanner context={context} />
      </PresentationProvider>,
    );
  });
  return container;
}

function bannerText(container: HTMLElement): string | undefined {
  return container.querySelector("p")?.textContent ?? undefined;
}

function button(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (one) => one.textContent === name || one.getAttribute("aria-label") === name,
  );
}

verifies("account-menu.usage-banner", () => {
  describe("the usage banner", () => {
    it("says agent time at 82% is 82% used, with the reset day, and opens the plan", async () => {
      const host = fakeHost(Promise.resolve(facts([agentTime])));
      const container = await renderBanner(host);
      expect(bannerText(container)).toBe(
        "You've used 82% of this month's agent time · It resets on 2 Dec 2026.",
      );
      await act(async () => button(container, usageBannerWords.seeUsage)?.click());
      expect(host.open).toHaveBeenCalledWith("https://account.example.com/acme#plan");
    });

    it("is a region named by its sentence, and not a live one", async () => {
      const container = await renderBanner(fakeHost(Promise.resolve(facts([agentTime]))));
      // A section with a name is a region landmark.
      const region = container.querySelector("section[aria-labelledby]");
      const name = document.getElementById(region?.getAttribute("aria-labelledby") ?? "");
      expect(name?.textContent).toBe(
        "You've used 82% of this month's agent time · It resets on 2 Dec 2026.",
      );
      expect(container.querySelector("[aria-live]")).toBeNull();
    });

    it("shows once: closed, it stays closed this period, and focus goes to the page's heading", async () => {
      const host = fakeHost(Promise.resolve(facts([agentTime])));
      const container = await renderBanner(host);
      await act(async () => button(container, usageBannerWords.close)?.click());
      expect(bannerText(container)).toBeUndefined();
      expect(document.activeElement?.textContent).toBe("Runs");

      const again = await renderBanner(fakeHost(Promise.resolve(facts([agentTime]))));
      expect(bannerText(again)).toBeUndefined();
      const nextPeriod = { ...agentTime, resetsAt: january };
      const next = await renderBanner(fakeHost(Promise.resolve(facts([nextPeriod]))));
      expect(bannerText(next)).toContain("agent time");
    });

    it("shows the highest unit, then the next one once that is closed", async () => {
      const tokens = { unit: "tokens", percent: 91, resetsAt: december };
      const container = await renderBanner(fakeHost(Promise.resolve(facts([agentTime, tokens]))));
      expect(bannerText(container)).toContain("this month's tokens");
      await act(async () => button(container, usageBannerWords.close)?.click());
      expect(bannerText(container)).toContain("this month's agent time");
    });

    it("reads the cost unit as a percentage of usage, never money", async () => {
      const cost = { unit: "cost", percent: 85, resetsAt: december };
      const container = await renderBanner(fakeHost(Promise.resolve(facts([cost]))));
      const text = bannerText(container);
      expect(text).toBe("You've used 85% of this month's usage · It resets on 2 Dec 2026.");
      expect(text).not.toMatch(/[€$£]|cost|EUR|USD/);
    });

    it("shows nothing under 80%, at 100%, or for a unit the flows don't name", async () => {
      const warnings = [
        { ...agentTime, percent: 79 },
        { unit: "runs", percent: 100, resetsAt: december },
        { unit: "cacheTokens", percent: 90, resetsAt: december },
      ];
      const container = await renderBanner(fakeHost(Promise.resolve(facts(warnings))));
      expect(container.textContent).toBe("Runs");
    });

    it("shows nothing without a host, without a menu, when it can't load, or once signed out", async () => {
      const report = vi.spyOn(console, "error").mockImplementation(() => {});
      const failure = new Error("503");
      // Each host is made just before it's drawn, so the rejection is never left unhandled.
      const hosts = [
        () => undefined,
        () => fakeHost(Promise.resolve(null)),
        () => fakeHost(Promise.reject(failure)),
      ];
      for (const host of hosts) {
        expect(bannerText(await renderBanner(host()))).toBeUndefined();
      }
      expect(report).toHaveBeenCalledWith("Couldn't read the usage for the banner.", failure);
      report.mockRestore();

      const host = fakeHost(Promise.resolve(facts([agentTime])));
      const container = await renderBanner(host);
      await act(async () => host.signOut());
      expect(bannerText(container)).toBeUndefined();
    });

    it("still closes for this page when the device can't remember it, and says why", async () => {
      const report = vi.spyOn(console, "error").mockImplementation(() => {});
      const full = new Error("QuotaExceededError");
      const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw full;
      });
      const container = await renderBanner(fakeHost(Promise.resolve(facts([agentTime]))));
      await act(async () => button(container, usageBannerWords.close)?.click());
      expect(bannerText(container)).toBeUndefined();
      expect(report).toHaveBeenCalledWith("Couldn't remember the closed usage banner.", full);
      setItem.mockRestore();
      report.mockRestore();
    });
  });
});
