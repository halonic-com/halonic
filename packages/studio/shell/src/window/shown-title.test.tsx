// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { TabSet } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { ShownTitleSource, WorkspaceContext } from "../workspace-context.ts";
import { shownTitleOf } from "./shown-title.ts";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

const changes = { key: "changes", title: "Changes" };
const run = { key: "run/acme/r1", title: "r1" };

/** Counts how often a source's listener ran. */
function listen(source: ShownTitleSource) {
  const heard = { count: 0 };
  const stop = source.subscribe(() => {
    heard.count += 1;
  });
  return { heard, stop };
}

let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  restoreMedia = new FakeMediaQueries(1280).install();
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia();
});

verifies("shell.shown-title", () => {
  it("follows a switch between a tab on Home and a tab on Changes", () => {
    const tabs = new TabSet();
    const source = shownTitleOf(tabs);
    tabs.openInNewTab(changes);
    tabs.activateAt(0);
    const { heard } = listen(source);

    expect(source.get()).toBe("Home");
    tabs.activateAt(1);

    expect(source.get()).toBe("Changes");
    expect(heard.count).toBe(1);
  });

  it("follows a rename of the active tab, and Back", () => {
    const tabs = new TabSet();
    const source = shownTitleOf(tabs);
    tabs.openHere(run);
    const { heard } = listen(source);

    tabs.rename(run.key, "Support triage");
    expect(source.get()).toBe("Support triage");
    tabs.back();

    expect(source.get()).toBe("Home");
    expect(heard.count).toBe(2);
  });

  it("says nothing on a switch between two tabs with the same name, or once stopped", () => {
    const tabs = new TabSet();
    const source = shownTitleOf(tabs);
    tabs.newTab();
    const { heard, stop } = listen(source);

    tabs.activateAt(0);
    stop();
    tabs.openHere(changes);

    expect(heard.count).toBe(0);
  });

  it("reaches a feature's view through its context on the desktop", async () => {
    const seen: (ShownTitleSource | undefined)[] = [];
    const feature = defineFeature({
      id: "looking",
      title: "Looking",
      register(studio) {
        studio.statusBar.add({
          id: "page",
          order: 10,
          view: "Page",
          load: async () => ({
            Page: ({ context }: { context: WorkspaceContext }) => {
              seen.push(context.shownTitle);
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
    act(() => workspace.tabs.openHere(changes));

    expect(seen.at(-1)?.get()).toBe("Changes");
  });
});
