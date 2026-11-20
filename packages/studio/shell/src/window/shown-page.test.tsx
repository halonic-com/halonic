// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { shownPageOf } from "./active-item.ts";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

const r1 = { key: "run/acme/r1", title: "Run r1" };

let restore: (() => void)[] = [];

afterEach(() => {
  unmountAll();
  for (const undo of restore) undo();
  restore = [];
});

/** Draws a window of this width with a feature whose dialog host keeps the context it gets. */
async function windowWith(width: number) {
  restore = [new FakeMediaQueries(width).install(), fakeShowModal()];
  const contexts: WorkspaceContext[] = [];
  const feature = defineFeature({
    id: "watcher",
    title: "Watcher",
    register(studio) {
      studio.places.add({ id: "inbox", view: "Inbox", load: async () => ({ Inbox: () => null }) });
      studio.dialogs.add({
        id: "watcher.host",
        order: 10,
        view: "Host",
        load: async () => ({
          Host: ({ context }: { context: WorkspaceContext }) => {
            contexts.push(context);
            return null;
          },
        }),
      });
    },
  });
  const shell = createShell({ features: [feature], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const context = contexts.at(-1);
  if (context === undefined) throw new Error("The dialog host wasn't drawn.");
  return { context, workspace };
}

verifies("shell.shown-page", () => {
  it("names a place's page, an item's page, and neither for a list under a place", () => {
    expect(shownPageOf("inbox")).toEqual({ place: "inbox" });
    expect(shownPageOf("run/acme/r1")).toEqual({ item: { kind: "run", hub: "acme", id: "r1" } });
    expect(shownPageOf("library/agents")).toEqual({});
  });

  it("follows the active tab on the desktop, from the same context", async () => {
    const { context, workspace } = await windowWith(1280);

    act(() => workspace.tabs.openHere({ key: "inbox", title: "Inbox" }));
    expect(context.shown?.()).toEqual({ place: "inbox" });
    act(() => workspace.tabs.openHere(r1));

    expect(context.shown?.()).toEqual({ item: { kind: "run", hub: "acme", id: "r1" } });
  });

  it("follows the phone's own page on a phone", async () => {
    const { context } = await windowWith(390);

    act(() => context.openPlace?.("inbox"));

    expect(context.shown?.()).toEqual({ place: "inbox" });
  });
});
