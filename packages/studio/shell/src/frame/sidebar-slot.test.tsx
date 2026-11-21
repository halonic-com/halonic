// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, type MouseEvent, useEffect, useState } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { createCloseStack } from "../close-stack/close-stack.ts";
import { createShellEngine } from "../engine/engine-connection.ts";
import { usePageHeadingFocus } from "../tabs/history-moves.ts";
import { installFakeInert } from "../test-support/fake-inert.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ShellFrame } from "./shell-frame.tsx";

let media: FakeMediaQueries;
let uninstall: () => void;
let uninstallPopover: () => void;
let uninstallInert: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(800);
  uninstall = media.install();
  uninstallPopover = installFakePopover();
  uninstallInert = installFakeInert();
});

afterEach(() => {
  unmountAll();
  uninstall();
  uninstallPopover();
  uninstallInert();
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

/** What every frame here needs: its announcer, close stack, engine, toasts and language. */
function frameServices() {
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  return {
    announcer,
    closeStack: createCloseStack(),
    engine: createShellEngine(announcer, timers),
    toasts: createToastStore(),
    language: "en",
  };
}

function renderFrame(
  options: { current?: "home" | "none"; sidebar?: boolean; width?: number } = {},
) {
  const services = frameServices();
  const { closeStack } = services;
  const container = render(
    <ShellFrame
      {...services}
      titleBar={<button type="button">Back</button>}
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

type Page = "home" | "agents" | "file";

/**
 * A window that knows which page it shows, as `StudioWindow` does. A file opened from the tree asks
 * for the page's `h1` here, as the window's `openHere` does: after the drawer's own effect.
 */
function PickingWindow() {
  const [services] = useState(frameServices);
  const [page, setPage] = useState<Page>("home");
  const focusNewPage = usePageHeadingFocus();
  return (
    <ShellFrame
      {...services}
      shownPage={page}
      sidebar={
        <PickingSidebar
          page={page}
          onPlace={setPage}
          onFile={() => {
            setPage("file");
            focusNewPage();
          }}
        />
      }
    >
      {page === "agents" ? <LoadingPage title="Agents" /> : <h1>{page}</h1>}
    </ShellFrame>
  );
}

/**
 * Agents is a link that asks for the page's `h1` itself, as `PlacesList` does: before the drawer's
 * own effect. The Files tree's `workspace.yaml` and `docs` are rows, not links: the file opens, the
 * folder only opens in the tree.
 */
function PickingSidebar({
  page,
  onPlace,
  onFile,
}: {
  readonly page: Page;
  readonly onPlace: (place: Page) => void;
  readonly onFile: () => void;
}) {
  const focusNewPage = usePageHeadingFocus();
  return (
    <nav aria-label="Places">
      <a href="/home" aria-current={page === "home" ? "page" : undefined}>
        Home
      </a>
      <a
        href="/agents"
        onClick={(event) => {
          event.preventDefault();
          onPlace("agents");
          focusNewPage();
        }}
      >
        Agents
      </a>
      <div role="tree" aria-label="Files">
        <button type="button" role="treeitem" onClick={onFile}>
          workspace.yaml
        </button>
        <button type="button" role="treeitem" aria-expanded="false">
          docs
        </button>
      </div>
    </nav>
  );
}

/** A page whose view is still loading when it opens: its `h1` shows in a later commit. */
function LoadingPage({ title }: { readonly title: string }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() => setLoaded(true));
  }, []);
  return loaded ? <h1>{title}</h1> : null;
}

function renderPickingWindow() {
  const container = render(<PickingWindow />);
  const named = (selector: string, name: string) =>
    Array.from(container.querySelectorAll<HTMLElement>(selector)).find(
      (element) => element.textContent === name,
    ) as HTMLElement;
  const drawer = () => container.querySelector("nav")?.parentElement as HTMLElement;
  const openDrawer = () =>
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Places"]')?.click());
  return { container, named, drawer, openDrawer };
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

  it("folds the sidebar into a Places button at the title bar's far left in a narrow window", () => {
    const { container, placesButton, drawer } = renderFrame();
    const titleBar = container.querySelector("header") as HTMLElement;
    expect(titleBar.firstElementChild?.querySelector("button")).toBe(placesButton());
    expect(placesButton()?.getAttribute("aria-label")).toBe("Places");
    expect(placesButton()?.getAttribute("aria-expanded")).toBe("false");
    expect(drawer().hidden).toBe(true);
  });

  it("opens the sidebar as a 264px drawer over the scrim, with focus on the current place", () => {
    const { container, placesButton, drawer, link, openDrawer } = renderFrame();
    openDrawer();

    expect(placesButton()?.getAttribute("aria-expanded")).toBe("true");
    expect(placesButton()?.closest(".bg-surface-muted")).not.toBeNull();
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

  it("closes on a pick of a place still loading, and its h1 takes the focus once drawn", async () => {
    const { container, named, drawer, openDrawer } = renderPickingWindow();
    openDrawer();

    await act(async () => named("a", "Agents").click());
    expect(drawer().hidden).toBe(true);
    expect(container.querySelector("main")?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(container.querySelector("main h1"));
    expect(document.activeElement?.textContent).toBe("Agents");
  });

  it("closes when a file opens from the Files tree, with the focus on its h1, and not on moves in the tree", () => {
    const { container, named, drawer, openDrawer } = renderPickingWindow();
    openDrawer();

    act(() => named("[role=treeitem]", "docs").click());
    expect(drawer().hidden).toBe(false);

    act(() => named("[role=treeitem]", "workspace.yaml").click());
    expect(drawer().hidden).toBe(true);
    expect(document.activeElement).toBe(container.querySelector("main h1"));
    expect(document.activeElement?.textContent).toBe("file");
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
