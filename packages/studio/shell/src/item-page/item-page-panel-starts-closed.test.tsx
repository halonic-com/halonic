// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, createRef } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { FakeResizeObserver } from "../test-support/fake-resize-observer.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ItemPage, type ItemPageHandle } from "./item-page.tsx";

let uninstallPopover: () => void;
let uninstallResizeObserver: () => void;

beforeEach(() => {
  uninstallPopover = installFakePopover();
  uninstallResizeObserver = FakeResizeObserver.install();
});

afterEach(() => {
  unmountAll();
  uninstallPopover();
  uninstallResizeObserver();
});

function chatTab(handle: React.Ref<ItemPageHandle<"items">>): HTMLElement {
  return render(
    <ItemPage<"items">
      icon={<svg />}
      kind="Chat"
      name="Add a routine"
      onRename={() => {}}
      views={[{ id: "items", label: "Items" }]}
      handle={handle}
      chat={{ startsOpen: true, panelStartsClosed: true, render: () => <textarea /> }}
    >
      {() => <p>Nothing shown yet</p>}
    </ItemPage>,
  );
}

const panel = (page: HTMLElement) => page.querySelector<HTMLElement>('[role="tabpanel"]');
const named = (page: HTMLElement, name: string) =>
  [...page.querySelectorAll("button")].find(
    (button) => (button.getAttribute("aria-label") ?? button.textContent) === name,
  );

verifies("shell.item-page-panel-starts-closed", () => {
  it("opens with the chat alone and a button that shows the panel", () => {
    const page = chatTab(createRef());
    expect(panel(page)?.parentElement?.hidden).toBe(true);
    expect(page.querySelector('header [role="tablist"]')).toBeNull();
    expect(named(page, "Items")).toBeDefined();
  });

  it("shows the panel beside the chat when the page asks, focus where it says", () => {
    const handle = createRef<ItemPageHandle<"items">>();
    const page = chatTab(handle);
    const box = page.querySelector("textarea") as HTMLTextAreaElement;
    box.focus();
    act(() => handle.current?.show("items", () => box));
    expect(panel(page)?.parentElement?.hidden).toBe(false);
    expect(document.activeElement).toBe(box);
  });
});
