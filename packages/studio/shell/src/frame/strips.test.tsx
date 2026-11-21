// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { createCloseStack } from "../close-stack/close-stack.ts";
import { createShellEngine } from "../engine/engine-connection.ts";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { ShellFrame } from "./shell-frame.tsx";
import { Strips } from "./strips.tsx";

let uninstall: (() => void) | undefined;

afterEach(() => {
  unmountAll();
  uninstall?.();
  uninstall = undefined;
});

const firstRunBar = async () => ({ Bar: () => <p>1 Demo</p> });
const nothing = async () => ({ Empty: () => null });
const broken = async () => ({
  Broken: (): never => {
    throw new Error("The bar couldn't draw.");
  },
});

const contextFor = (): WorkspaceContext => ({}) as WorkspaceContext;

/** The frame at a width, with the strips the features add. */
async function renderFrame(width: number, strips: Parameters<typeof Strips>[0]["strips"]) {
  const media = new FakeMediaQueries(width);
  uninstall = media.install();
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  const container = render(
    <ShellFrame
      announcer={announcer}
      closeStack={createCloseStack()}
      engine={createShellEngine(announcer, timers)}
      toasts={createToastStore()}
      language="en"
      titleBar={<button type="button">Back</button>}
      phoneTopBar={<header data-top-bar="">Inbox</header>}
      strips={<Strips strips={strips} contextFor={contextFor} />}
    >
      <p>The page</p>
    </ShellFrame>,
  );
  // The views load lazily, as the status bar's items do.
  await act(async () => {});
  return container;
}

function stripsOf(...features: Parameters<typeof defineFeature>[0][]) {
  return createShell({ features: features.map(defineFeature) }).contributions.strips.list();
}

verifies("shell.frame-strips", () => {
  it("lists strips by order, then id, with the feature that added them", () => {
    const strips = stripsOf(
      {
        id: "first-run",
        title: "First run",
        register: (studio) =>
          studio.strips.add({ id: "first-run.bar", order: 10, view: "Bar", load: firstRunBar }),
      },
      {
        id: "remote",
        title: "Remote",
        register: (studio) =>
          studio.strips.add({ id: "remote.notice", order: 5, view: "Bar", load: firstRunBar }),
      },
    );
    expect(strips.map((strip) => [strip.id, strip.featureId])).toEqual([
      ["remote.notice", "remote"],
      ["first-run.bar", "first-run"],
    ]);
  });

  it("draws a strip in the panel on the desktop, before the page", async () => {
    const strips = stripsOf({
      id: "first-run",
      title: "First run",
      register: (studio) =>
        studio.strips.add({ id: "first-run.bar", order: 10, view: "Bar", load: firstRunBar }),
    });
    const container = await renderFrame(1440, strips);
    const strip = container.querySelector("[data-strips]");
    expect(strip?.textContent).toBe("1 Demo");
    expect(container.querySelector("header.h-titlebar")?.contains(strip as Node)).toBe(false);
    const main = container.querySelector("main") as HTMLElement;
    expect(strip?.compareDocumentPosition(main)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("draws a strip under the top bar on a phone", async () => {
    const strips = stripsOf({
      id: "first-run",
      title: "First run",
      register: (studio) =>
        studio.strips.add({ id: "first-run.bar", order: 10, view: "Bar", load: firstRunBar }),
    });
    const container = await renderFrame(390, strips);
    const topBar = container.querySelector("[data-top-bar]") as HTMLElement;
    const strip = container.querySelector("[data-strips]") as HTMLElement;
    expect(topBar.compareDocumentPosition(strip)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(strip.compareDocumentPosition(container.querySelector("main") as HTMLElement)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("takes no room while no strip draws anything, and a broken one doesn't take the others", async () => {
    const strips = stripsOf({
      id: "first-run",
      title: "First run",
      register: (studio) => {
        studio.strips.add({ id: "first-run.empty", order: 1, view: "Empty", load: nothing });
        studio.strips.add({ id: "first-run.broken", order: 2, view: "Broken", load: broken });
      },
    });
    // React reports the broken view's error, which the boundary then hides.
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = await renderFrame(1440, strips);
    reported.mockRestore();
    const strip = container.querySelector("[data-strips]") as HTMLElement;
    expect(strip.className).toContain("empty:hidden");
    expect(strip.childElementCount).toBe(0);
    expect(strip.textContent).toBe("");
  });

  it("draws no strips at all without any", async () => {
    const container = await renderFrame(1440, []);
    expect(container.querySelector("[data-strips]")).toBeNull();
  });
});
