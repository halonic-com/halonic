// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { currentLocation } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

let media: FakeMediaQueries;
let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(1280);
  restoreMedia = media.install();
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia();
});

/** The workflow names a feature has read so far, as a test learns them, and who listens. */
function workflowNames() {
  const names = new Map<string, string>();
  const listeners = new Set<() => void>();
  return {
    nameOf: (id: string) => names.get(id),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    learn(id: string, name: string) {
      names.set(id, name);
      for (const listener of listeners) listener();
    },
  };
}

/** A window whose _workflows_ feature names its tabs from `names`, else by the workflow's id. */
function renderWindow(names: ReturnType<typeof workflowNames>) {
  const feature = defineFeature({
    id: "workflows",
    title: "Workflows",
    register(studio) {
      studio.itemKinds.add({
        kind: "workflow",
        label: "Workflow",
        icon: "workflows",
        open: { view: "WorkflowView", load: async () => ({ WorkflowView: () => null }) },
        tab: {
          describe: (item) => ({ label: names.nameOf(item.id) ?? item.id }),
          exists: () => true,
          subscribe: (listener) => names.subscribe(listener),
        },
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
  return workspace.tabs;
}

const supportReply = { key: "workflow/acme/support-reply", title: "support-reply" };

verifies("shell.item-tab-names", () => {
  it("names a tab opened by the workflow's id after the workflow once it is read (L14, HAL-12730)", () => {
    const names = workflowNames();
    const tabs = renderWindow(names);
    act(() => tabs.openHere(supportReply));
    expect(currentLocation(tabs.active).title).toBe("support-reply");

    act(() => names.learn("support-reply", "Support reply"));

    expect(currentLocation(tabs.active).title).toBe("Support reply");
  });

  it("leaves a tab alone whose name is already the one the kind gives", () => {
    const names = workflowNames();
    const tabs = renderWindow(names);
    act(() => tabs.openHere({ ...supportReply, title: "Support reply" }));
    const before = tabs.state;

    act(() => names.learn("support-reply", "Support reply"));

    expect(tabs.state).toBe(before);
  });
  it("names the phone's page and the window again too, as a phone keeps its own pages (PT1, HAL-14489)", () => {
    const names = workflowNames();
    const tabs = renderWindow(names);
    act(() => tabs.openHere(supportReply));
    act(() => media.resize(400));
    const topBar = () => document.querySelector("header p")?.textContent;
    expect(topBar()).toBe("support-reply");

    act(() => names.learn("support-reply", "Support reply"));

    expect(topBar()).toBe("Support reply");
    expect(document.title.startsWith("Support reply · ")).toBe(true);
  });
});
