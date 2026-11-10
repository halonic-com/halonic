// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, type MouseEvent } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { createCloseStack } from "../close-stack/close-stack.ts";
import { createShellEngine } from "../engine/engine-connection.ts";
import { usePageHeadingFocus } from "../tabs/history-moves.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ShellFrame } from "./shell-frame.tsx";

let media: FakeMediaQueries;
let uninstall: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(800);
  uninstall = media.install();
});

afterEach(() => {
  unmountAll();
  uninstall();
});

/**
 * A sidebar with a field, Home and Runs, at its own inline width as the resize edge sets it. Runs
 * focuses the page's `h1` through `usePageHeadingFocus`, as `PlacesList` does: in a layout effect
 * of the same commit that closes the drawer, before the drawer's own effect.
 */
function Sidebar({
  current,
  width,
}: {
  readonly current: "home" | "none";
  readonly width: number;
}) {
  const focusNewPage = usePageHeadingFocus();
  const pick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    focusNewPage();
  };
  return (
    <nav aria-label="Places" style={{ width }}>
      <input aria-label="Filter" />
      <a href="/home" aria-current={current === "home" ? "page" : undefined}>
        Home
      </a>
      <a href="/runs" onClick={pick}>
        Runs
      </a>
    </nav>
  );
}

function renderFrame(
  options: { current?: "home" | "none"; sidebar?: boolean; width?: number } = {},
) {
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  const closeStack = createCloseStack();
  const container = render(
    <ShellFrame
      announcer={announcer}
      closeStack={closeStack}
      engine={createShellEngine(announcer, timers)}
      toasts={createToastStore()}
      language="en"
      toolbar={<button type="button">Back</button>}
      sidebar={
        options.sidebar === false ? undefined : (
          <Sidebar current={options.current ?? "home"} width={options.width ?? 264} />
        )
      }
    >
      <h1 tabIndex={-1}>Runs</h1>
    </ShellFrame>,
  );
  const placesButton = () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Places"]');
  const drawer = () => container.querySelector("nav")?.parentElement as HTMLElement;
  const link = (name: string) =>
    Array.from(container.querySelectorAll("a")).find((a) => a.textContent === name) as HTMLElement;
  const openDrawer = () => act(() => placesButton()?.click());
  return { container, closeStack, placesButton, drawer, link, openDrawer };
}

function pressEscape() {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
}

verifies("shell.places-drawer", () => {
  it("docks the sidebar beside the page on a wide window, with no Places button", () => {
    act(() => media.resize(1440));
    const { placesButton, drawer, container } = renderFrame();
    expect(placesButton()).toBeNull();
    expect(drawer().hidden).toBe(false);
    expect(drawer().className).toBe("contents");
    expect(container.querySelector("main")?.hasAttribute("inert")).toBe(false);
  });

  it("folds the sidebar into a Places button at the toolbar's left in a narrow window", () => {
    const { container, placesButton, drawer } = renderFrame();
    const toolbar = container.querySelector(".h-toolbar") as HTMLElement;
    expect(toolbar.firstElementChild?.querySelector("button")).toBe(placesButton());
    expect(placesButton()?.getAttribute("aria-expanded")).toBe("false");
    expect(drawer().hidden).toBe(true);
  });

  it("opens the sidebar as a 264px drawer over the scrim, with focus on the current place", () => {
    const { container, placesButton, drawer, link, openDrawer } = renderFrame();
    openDrawer();

    expect(placesButton()?.getAttribute("aria-expanded")).toBe("true");
    expect(placesButton()?.parentElement?.className).toContain("bg-surface-muted");
    expect(drawer().hidden).toBe(false);
    expect(drawer().className).toContain("w-sidebar bg-surface-subtle shadow-3");
    expect(drawer().nextElementSibling?.className).toContain("start-sidebar");
    expect(drawer().nextElementSibling?.className).toContain("bg-(--stack-scrim)");
    expect(container.querySelector("main")?.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(link("Home"));
  });

  it("holds a sidebar widened to 400px to the drawer's 264px", () => {
    const { container, drawer, openDrawer } = renderFrame({ width: 400 });
    openDrawer();
    // jsdom applies no Tailwind: `*:w-full!` sizes the drawer's direct child over its inline width.
    expect(drawer().className.split(" ")).toContain("*:w-full!");
    expect(container.querySelector("nav")?.parentElement).toBe(drawer());
    expect(container.querySelector("nav")?.style.width).toBe("400px");
  });

  it("focuses the first place when no place is current", () => {
    const { link, openDrawer } = renderFrame({ current: "none" });
    openDrawer();
    expect(document.activeElement).toBe(link("Home"));
  });

  it("closes on Esc, through the close stack, and gives the focus back to the button", () => {
    const { closeStack, placesButton, drawer, openDrawer } = renderFrame();
    openDrawer();
    expect(closeStack.top()?.kind).toBe("drawer");

    pressEscape();
    expect(drawer().hidden).toBe(true);
    expect(closeStack.top()).toBeUndefined();
    expect(document.activeElement).toBe(placesButton());
  });

  it("closes on a pick and leaves the focus on the new page's h1", () => {
    const { container, drawer, link, openDrawer } = renderFrame();
    openDrawer();

    act(() => link("Runs").click());
    expect(drawer().hidden).toBe(true);
    expect(container.querySelector("main")?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(container.querySelector("main h1"));
  });

  it("closes on a click on the scrim or on the Places button", () => {
    const { placesButton, drawer, openDrawer } = renderFrame();
    openDrawer();
    act(() => (drawer().nextElementSibling as HTMLElement).click());
    expect(drawer().hidden).toBe(true);
    expect(document.activeElement).toBe(placesButton());

    openDrawer();
    openDrawer();
    expect(drawer().hidden).toBe(true);
  });

  it("closes when focus moves on outside it, and leaves the focus there", () => {
    const { container, drawer, openDrawer } = renderFrame();
    openDrawer();
    const back = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Back",
    ) as HTMLElement;

    act(() => back.focus());
    expect(drawer().hidden).toBe(true);
    expect(document.activeElement).toBe(back);
  });

  it("docks again when the window widens, keeps the sidebar's state, and starts closed when narrow", () => {
    const { container, placesButton, drawer, openDrawer } = renderFrame();
    const filter = container.querySelector("input") as HTMLInputElement;
    filter.value = "ru";
    openDrawer();

    act(() => media.resize(1440));
    expect(placesButton()).toBeNull();
    expect(drawer().className).toBe("contents");
    expect(container.querySelector("input")).toBe(filter);
    expect(filter.value).toBe("ru");

    act(() => media.resize(800));
    expect(drawer().hidden).toBe(true);
  });

  it("shows no Places button when there's no sidebar", () => {
    const { placesButton } = renderFrame({ sidebar: false });
    expect(placesButton()).toBeNull();
  });
});
