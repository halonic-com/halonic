// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import type { FocusedAppContribution } from "../points/frame.ts";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { mountFocusedWindow } from "../window/focused-window.tsx";
import { StudioWorkspace } from "../window/studio-workspace.ts";
import type { SignInContribution, SignInNeed } from "./sign-ins.ts";

let media: FakeMediaQueries;
let restoreMedia: () => void;
let restoreModal: () => void;
const elements: HTMLDivElement[] = [];
const unmounts: (() => void)[] = [];

beforeEach(() => {
  media = new FakeMediaQueries(1280);
  restoreMedia = media.install();
  restoreModal = fakeShowModal();
});

afterEach(() => {
  for (const unmount of unmounts.splice(0)) act(unmount);
  for (const element of elements.splice(0)) element.remove();
  restoreModal();
  restoreMedia();
});

/** The agent host both windows share: the signed-out connections. */
let signedOut: SignInNeed[] = [];

const paperclip: SignInContribution = {
  id: "acme.paperclip",
  provider: "Paperclip",
  purpose: "your agents",
  blockingFor: ["inbox", "messenger"],
  watch: (_context, listener) => {
    listener({ kind: "read", needs: signedOut });
    return () => undefined;
  },
  start: async () => {
    signedOut = [];
    return {
      phrase: "blue-otter",
      approvalUrl: "https://paperclip.acme.test/approve",
      finished: Promise.resolve("signed-in"),
    };
  },
};

function appView(id: FocusedAppContribution["id"], title: string): FocusedAppContribution {
  const View = () => <h1>{title}</h1>;
  return { id, title, view: "View", load: async () => ({ View }), panel: true };
}

async function mountApp(app: FocusedAppContribution, opened: string[]): Promise<HTMLElement> {
  const feature = defineFeature({
    id: "acme",
    title: "Acme",
    register: (studio) => {
      studio.focusedApps.add(app);
      studio.signIns.add(paperclip);
    },
  });
  const shell = createShell({ features: [feature], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name: "Acme" });
  const [registered] = shell.contributions.focusedApps.list();
  if (registered === undefined) throw new Error("Acme added no focused app.");
  const element = document.createElement("div");
  document.body.append(element);
  elements.push(element);
  await act(async () => {
    const mounted = mountFocusedWindow(
      element,
      { shell, app: registered, workspace, language: "en", openStudio: () => undefined },
      async (address) => {
        opened.push(await address);
      },
    );
    unmounts.push(() => mounted.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return element;
}

function modalTitle(element: HTMLElement): string | undefined {
  return element.querySelector("dialog h2")?.textContent ?? undefined;
}

verifies("shell.sign-in-needed", () => {
  it("shows the same modal in the Inbox and the Messenger, and clears it in both after one sign-in", async () => {
    signedOut = [{ id: "acme-team", name: "Paperclip · Acme team" }];
    const opened: string[] = [];
    const inbox = await mountApp(appView("inbox", "Inbox"), opened);
    const messenger = await mountApp(appView("messenger", "Messenger"), opened);

    expect(modalTitle(inbox)).toBe("Sign in to Paperclip");
    expect(inbox.querySelector("dialog")?.textContent).toContain(
      "Inbox needs your Paperclip sign-in to work.",
    );
    expect(modalTitle(messenger)).toBe("Sign in to Paperclip");

    const signIn = inbox.querySelector<HTMLButtonElement>("dialog button");
    await act(async () => signIn?.click());
    await vi.waitFor(() => {
      expect(modalTitle(inbox)).toBeUndefined();
      expect(modalTitle(messenger)).toBeUndefined();
    });
    expect(opened).toEqual(["https://paperclip.acme.test/approve"]);
  });
});
