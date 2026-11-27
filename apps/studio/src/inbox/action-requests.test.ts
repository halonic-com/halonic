// @vitest-environment jsdom

import { shippedCatalog } from "@halonicjs/action-catalog";
import { PaperclipMessaging } from "@halonicjs/adapter-paperclip-client";
import { ServiceRegistry } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { inboxFeature } from "@halonicjs/studio-feature-inbox";
import { type InboxRuns, InboxRunsService } from "@halonicjs/studio-feature-inbox/api";
import { AgentMessagingService } from "@halonicjs/studio-services";
import {
  createShell,
  type MountedFocusedWindow,
  mountFocusedWindow,
  StudioWorkspace,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  AcmePaperclip,
  acmeCompany,
  acmeKey,
  socialPreviewRequest,
} from "./acme-paperclip.test-helper.ts";
import { provideActionSteppers } from "./provide-action-steppers.ts";

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

/** No runs wait: the Inbox shows only the agents' items. */
const noRuns: InboxRuns = {
  waiting: async (): Promise<readonly RunSummary[]> => [],
  subscribe: () => () => undefined,
  send: async () => {
    throw new Error("No run answers in this test.");
  },
};

let element: HTMLDivElement;
let mounted: MountedFocusedWindow | undefined;

beforeEach(() => {
  window.matchMedia = desktopMediaQueries;
  element = document.body.appendChild(document.createElement("div"));
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  element.remove();
});

/**
 * Halonic Inbox, the Inbox's own window, for a workspace as the app builds it: the app's action
 * steppers, and Acme's Paperclip provider checking stepper requests against the shipped catalog,
 * as the agent host makes it.
 */
function showInbox(paperclip: AcmePaperclip): void {
  const shell = createShell({ features: [inboxFeature], hostServices: [InboxRunsService] });
  const services = new ServiceRegistry();
  services.provide(InboxRunsService, noRuns);
  services.provide(
    AgentMessagingService,
    new PaperclipMessaging({
      address: paperclip.address,
      key: acmeKey,
      connection: "acme",
      company: acmeCompany,
      label: "Paperclip · Acme",
      stepperCatalog: shippedCatalog,
      fetch: paperclip.fetch,
    }),
  );
  provideActionSteppers(services);
  shell.services.instantiate(services);
  const app = shell.contributions.focusedApps.list().find((added) => added.id === "inbox");
  if (app === undefined) throw new Error("no Halonic Inbox");
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name: "Acme" });
  mounted = mountFocusedWindow(element, {
    shell,
    app,
    workspace,
    language: "en",
    openStudio: () => undefined,
  });
}

verifies("action-steppers.stepper-items", () => {
  it("opens a Paperclip card pinning one shipped stepper as the stepper in review, not the can't-read card", async () => {
    const madeAnHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const paperclip = new AcmePaperclip(socialPreviewRequest, madeAnHourAgo);
    showInbox(paperclip);

    const row = await vi.waitFor(
      () => {
        const found = element.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
        if (found === null) throw new Error("No row yet.");
        return found;
      },
      { timeout: 15_000 },
    );
    row.click();
    await vi.waitFor(() => {
      const titles = [...element.querySelectorAll("section h2")].map((h) => h.textContent);
      expect(titles).toContain("Upload a social preview image");
    });

    expect(element.textContent).toContain("GitHub: repository acme/app");
    expect(element.textContent).toContain("Open it in the desktop app to run it.");
    expect(element.textContent).not.toContain("This card has a stepper Halonic can't read:");
    const buttons = [...element.querySelectorAll("button")].map((button) => button.textContent);
    expect(buttons).toContain("Decline");
    expect(paperclip.unexpected).toEqual([]);
  }, 30_000);
});
