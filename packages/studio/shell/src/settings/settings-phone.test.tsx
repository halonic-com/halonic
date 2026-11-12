// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import type { HomeCardProps } from "../home/home-page.tsx";
import type { SettingsScope } from "../points/frame.ts";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { StudioWindow } from "../window/studio-window.tsx";
import { StudioWorkspace } from "../window/studio-workspace.ts";

let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  restoreMedia = new FakeMediaQueries(390).install();
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia();
});

function SectionView() {
  return <p className="section-view">drawn</p>;
}

function section(id: string, title: string, scope: SettingsScope, order: number) {
  return { id, title, scope, order, view: "SectionView", load: async () => ({ SectionView }) };
}

/** Home's card asks for the Assistant section, as the Harness page's **Open Settings ›** does. */
function OpenAssistantCard({ context }: HomeCardProps) {
  return (
    <button
      type="button"
      className="open-assistant"
      onClick={() => context.openSettings?.("assistant")}
    >
      Assistant
    </button>
  );
}

const sectionsFeature = defineFeature({
  id: "sections",
  title: "Sections",
  register(studio) {
    studio.settings.add(section("appearance", "Appearance", "display", 10));
    studio.settings.add(section("formats", "Formats", "display", 20));
    studio.settings.add(section("assistant", "Assistant", "host", 30));
    studio.home.addCard({
      id: "needs-you",
      view: "OpenAssistantCard",
      load: async () => ({ OpenAssistantCard }),
    });
  },
});

async function renderPhone() {
  const shell = createShell({ features: [sectionsFeature], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name: "Acme" });
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="served"
      platform="linux"
      language="en"
    />,
  );
  await settle();
  const title = () => container.querySelector("header p")?.textContent;
  const heading = () => container.querySelector("main h1")?.textContent;
  const back = () =>
    act(() => container.querySelector<HTMLElement>('header button[aria-label="Back"]')?.click());
  const rowNames = () =>
    [...container.querySelectorAll("main tr")].map(
      (tr) => tr.querySelector("[role=gridcell]")?.textContent,
    );
  const tapRow = async (name: string) => {
    const row = [...container.querySelectorAll("main tr")].find(
      (tr) => tr.querySelector("[role=gridcell]")?.textContent === name,
    );
    act(() => row?.querySelector<HTMLElement>("[role=gridcell]")?.click());
    await settle();
  };
  const tapMore = () =>
    act(() =>
      container
        .querySelector<HTMLElement>('nav[aria-label="Places"] a[aria-label^="More"]')
        ?.click(),
    );
  return { container, title, heading, back, rowNames, tapRow, tapMore };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("shell.settings-list-page", () => {
  it("opens Settings as a list page of the window's sections from More's last row", async () => {
    const { container, title, heading, rowNames, tapRow, tapMore } = await renderPhone();
    tapMore();
    expect(rowNames().at(-1)).toBe("Settings");

    await tapRow("Settings");

    expect(title()).toBe("Settings");
    expect(heading()).toBe("Settings");
    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(rowNames()).toEqual(["Appearance", "Formats", "Assistant"]);
    expect(container.querySelector('nav[aria-label="Places"]')).not.toBeNull();
  });

  it("opens a section as the next page, and Back returns to the list and then to More", async () => {
    const { container, title, heading, back, tapRow, tapMore } = await renderPhone();
    tapMore();
    await tapRow("Settings");

    await tapRow("Formats");
    expect(title()).toBe("Formats");
    expect(heading()).toBe("Formats");
    expect(container.querySelector(".section-view")?.textContent).toBe("drawn");
    expect(container.querySelector('nav[aria-label="Places"]')).toBeNull();

    back();
    expect(title()).toBe("Settings");
    back();
    expect(title()).toBe("More");
  });

  it("opens the section a view asks for above the list", async () => {
    const { container, title, back } = await renderPhone();

    act(() => container.querySelector<HTMLElement>(".open-assistant")?.click());
    await settle();
    expect(title()).toBe("Assistant");
    expect(container.querySelector(".section-view")).not.toBeNull();

    back();
    expect(title()).toBe("Settings");
  });
});
