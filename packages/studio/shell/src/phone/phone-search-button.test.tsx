// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { RecentPlaces } from "../palette/recent-places.ts";
import { TabSet } from "../tabs/tab-set.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { PhoneSearchButton } from "./phone-search-button.tsx";

let restoreModal: () => void;

beforeEach(() => {
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
});

/** The Search button on a phone that showed Runs last; `opened` says where the focus was then. */
function renderButton() {
  const tabs = new TabSet();
  const recent = new RecentPlaces(tabs);
  tabs.openHere({ key: "runs", title: "Runs" });
  const opened: string[] = [];
  const view = render(
    <PhoneSearchButton
      recent={recent}
      providers={[]}
      commands={[]}
      kinds={{ get: () => undefined }}
      contextFor={(featureId) => ({ featureId }) as unknown as WorkspaceContext}
      announcer={createAnnouncer({ timers: new FakeTimers() })}
      toasts={createToastStore()}
      notAnswering="Halonic on your computer isn't answering."
      platform="linux"
      onOpenLocation={(location) =>
        opened.push(
          `${location.title}, focus on ${document.activeElement?.getAttribute("aria-label")}`,
        )
      }
    />,
  );
  const button = () => view.querySelector<HTMLButtonElement>('button[aria-label="Search"]');
  return {
    view,
    button,
    opened,
    sheet: () => view.querySelector("dialog"),
    tap: (element: HTMLElement | null | undefined) => act(() => element?.click()),
  };
}

verifies("shell.phone-search-button", () => {
  it("is a 48px icon button named Search that opens the sheet with the focus in its field", () => {
    const search = renderButton();
    expect(search.sheet()).toBeNull();
    expect(search.button()?.className).toContain("phone:size-touch");
    search.tap(search.button());
    expect(search.sheet()?.querySelector("h2")?.textContent).toBe("Search");
    expect(document.activeElement?.getAttribute("role")).toBe("combobox");
  });

  it("puts the focus back on Search when the sheet closes", () => {
    const search = renderButton();
    search.tap(search.button());
    search.tap(search.sheet()?.querySelector<HTMLElement>('button[aria-label="Close"]'));
    expect(search.sheet()).toBeNull();
    expect(document.activeElement).toBe(search.button());
  });

  it("closes the sheet and gives the focus back before a picked place opens", () => {
    const search = renderButton();
    search.tap(search.button());
    search.tap(search.view.querySelector<HTMLElement>('[role="option"][aria-label="Runs"]'));
    expect(search.sheet()).toBeNull();
    expect(search.opened).toEqual(["Runs, focus on Search"]);
  });
});
