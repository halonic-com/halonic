// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { createCloseStack } from "../close-stack/close-stack.ts";
import { createShellEngine } from "../engine/engine-connection.ts";
import { installFakeInert } from "../test-support/fake-inert.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ShellFrame } from "./shell-frame.tsx";

let media: FakeMediaQueries;
let uninstall: () => void;
let uninstallInert: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(1440);
  uninstall = media.install();
  uninstallInert = installFakeInert();
});

afterEach(() => {
  unmountAll();
  uninstall();
  uninstallInert();
});

function renderFrame() {
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  return render(
    <ShellFrame
      announcer={announcer}
      closeStack={createCloseStack()}
      engine={createShellEngine(announcer, timers)}
      toasts={createToastStore()}
      language="en"
      titleBar={<button type="button">Back</button>}
      sidebar={<nav aria-label="Places">Home</nav>}
      statusBar="1 error"
    >
      <p>Home page</p>
    </ShellFrame>,
  );
}

function classesOf(element: Element | null | undefined): string[] {
  return (element?.className ?? "").split(" ");
}

verifies("shell.frame", () => {
  it("puts the sidebar on the app frame and the page with the status bar on a framed panel 8px beside it", () => {
    const container = renderFrame();
    const sidebar = container.querySelector('nav[aria-label="Places"]');
    const panel = container.querySelector("[data-framed-panel]");

    expect(panel?.contains(sidebar ?? null)).toBe(false);
    expect(panel?.contains(container.querySelector("main"))).toBe(true);
    expect(panel?.lastElementChild?.tagName).toBe("FOOTER");
    expect(classesOf(panel)).toEqual(
      expect.arrayContaining(["rounded-lg", "border", "border-border", "bg-surface"]),
    );
    // The 8px is on the column that holds the window tabs, on the frame, over the panel.
    const column = panel?.closest("[data-framed-column]");
    expect(classesOf(column)).toContain("ms-2");
    // Nothing between the sidebar and the frame: the frame's row has no fill of its own.
    expect(classesOf(column)).not.toContain("bg-surface");
    expect(classesOf(column?.parentElement)).not.toContain("bg-surface");
  });

  it("draws the desktop frame in the Messenger's app frame colour, not the halo", () => {
    const container = renderFrame();
    const frame = container.querySelector('[data-layout="desktop"]');
    expect(classesOf(frame)).toContain("bg-app-frame");
    expect(classesOf(frame)).not.toContain("bg-halo-frame");
  });

  it("keeps the Places drawer in a narrow window, with the framed panel taking the whole row", () => {
    const container = renderFrame();
    act(() => media.resize(800));
    const drawer = container.querySelector('nav[aria-label="Places"]')?.parentElement;
    const panel = container.querySelector("[data-framed-panel]");

    expect(drawer?.className).toContain("w-sidebar bg-surface-subtle shadow-3");
    expect(classesOf(panel?.closest("[data-framed-column]"))).not.toContain("ms-2");
    expect(classesOf(panel)).toContain("rounded-lg");
  });

  it("draws no frame on a phone and keeps the same page across the width", () => {
    const container = renderFrame();
    const main = container.querySelector("main");
    act(() => media.resize(400));

    expect(container.querySelector("[data-framed-panel]")).toBeNull();
    expect(container.querySelector('[data-layout="phone"]')).not.toBeNull();
    expect(container.querySelector("main")).toBe(main);
  });
});
