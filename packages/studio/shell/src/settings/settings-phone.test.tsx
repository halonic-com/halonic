// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import type { HomeCardProps } from "../home/home-page.tsx";
import type { SettingsScope, SettingsSectionContribution } from "../points/frame.ts";
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

function section(
  id: string,
  title: string,
  scope: SettingsScope,
  order: number,
  extra: Partial<SettingsSectionContribution> = {},
): SettingsSectionContribution {
  return {
    id,
    title,
    scope,
    order,
    view: "SectionView",
    load: async () => ({ SectionView }),
    ...extra,
  };
}

/** The Formats summary is on its way until the test lets it answer. */
let answerFormats: (line: string | undefined) => void = () => undefined;

/** Home's card asks for the Assistant section, as the Harness page's **Open Settings ›** does. */
function OpenAssistantCard({ context }: HomeCardProps) {
  return (
    <>
      <button
        type="button"
        className="open-assistant"
        onClick={() => context.openSettings?.("assistant")}
      >
        Assistant
      </button>
      <button
        type="button"
        className="open-developer"
        onClick={() => context.openSettings?.("developer")}
      >
        Developer
      </button>
    </>
  );
}

const sectionsFeature = defineFeature({
  id: "sections",
  title: "Sections",
  register(studio) {
    studio.settings.add(
      section("appearance", "Appearance", "display", 10, {
        summary: () => "System theme · characters on",
      }),
    );
    studio.settings.add(
      section("formats", "Formats", "display", 20, {
        summary: () => new Promise((resolve) => (answerFormats = resolve)),
      }),
    );
    studio.settings.add(section("assistant", "Assistant", "host", 30));
    studio.settings.add(section("models", "Models", "workspace", 10));
    studio.settings.add(section("developer", "Developer", "display", 90, { phone: false }));
    studio.home.addCard({
      id: "needs-you",
      view: "OpenAssistantCard",
      load: async () => ({ OpenAssistantCard }),
    });
  },
});

async function renderPhone(name: string | null = "Acme") {
  const shell = createShell({ features: [sectionsFeature], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({
    toasts: shell.toasts,
    services,
    name: name ?? undefined,
  });
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
    [...container.querySelectorAll("main tr")]
      .map((tr) => tr.querySelector("[role=gridcell]")?.textContent)
      .filter((name) => name !== undefined);
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
  const groupHeadings = () =>
    [...container.querySelectorAll("main h3")].map((heading) => heading.textContent);
  return { container, title, heading, back, rowNames, tapRow, tapMore, groupHeadings };
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
    expect(rowNames()).toEqual([
      "Models",
      "AppearanceSystem theme · characters on",
      "Formats",
      "Assistant",
    ]);
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

  it("heads the groups by where each section's values are kept, and never lists Developer", async () => {
    const { tapRow, tapMore, groupHeadings, rowNames } = await renderPhone();
    tapMore();
    await tapRow("Settings");

    expect(groupHeadings()).toEqual([
      "Acme· , Workspace settings",
      "On this phone",
      "On your computer",
    ]);
    expect(rowNames()).not.toContain("Developer");
  });

  it("leaves out the workspace's group when no workspace is open", async () => {
    const { tapRow, tapMore, groupHeadings } = await renderPhone(null);
    tapMore();
    await tapRow("Settings");

    expect(groupHeadings()).toEqual(["On this phone", "On your computer"]);
  });

  it("gives each row a 20px icon, its summary and a chevron, and names it by the name and summary", async () => {
    const { container, tapRow, tapMore } = await renderPhone();
    tapMore();
    await tapRow("Settings");

    const appearance = [...container.querySelectorAll("main tr")].find((tr) =>
      tr.textContent?.startsWith("Appearance"),
    );
    expect(appearance?.textContent).toContain("System theme · characters on");
    expect(appearance?.querySelector("svg")).not.toBeNull();
    expect(appearance?.textContent).toBe("AppearanceSystem theme · characters on");
  });

  it("shows a summary that answers later when it does, and says it is loading until then", async () => {
    const { container, tapRow, tapMore, rowNames } = await renderPhone();
    tapMore();
    await tapRow("Settings");
    expect(container.querySelector("main [role=status]")?.textContent).toBe("Loading settings");
    expect(rowNames()).toContain("Formats");

    await act(async () => answerFormats("Follow this phone · English (United Kingdom)"));

    expect(container.querySelector("main [role=status]")).toBeNull();
    expect(rowNames()).toContain("FormatsFollow this phone · English (United Kingdom)");
  });

  it("keeps the name alone when a summary fails", async () => {
    const { container, tapRow, tapMore, rowNames } = await renderPhone();
    tapMore();
    await tapRow("Settings");

    await act(async () => answerFormats(Promise.reject(new Error("no answer")) as never));

    expect(container.querySelector("main [role=status]")).toBeNull();
    expect(rowNames()).toContain("Formats");
  });

  it("does not open Developer from a link: it is not on a phone", async () => {
    const { container, title } = await renderPhone();
    const developerCard = container.querySelector<HTMLElement>(".open-developer");
    act(() => developerCard?.click());
    await settle();

    expect(title()).toBe("Settings");
    expect(container.querySelector(".section-view")).toBeNull();
  });

  it("returns to the list scrolled where it was", async () => {
    const { container, back, tapRow, tapMore } = await renderPhone();
    tapMore();
    await tapRow("Settings");
    const main = container.querySelector("main") as HTMLElement;
    act(() => {
      main.scrollTop = 120;
      main.dispatchEvent(new Event("scroll"));
    });

    await tapRow("Formats");
    main.scrollTop = 0;
    back();

    expect((container.querySelector("main") as HTMLElement).scrollTop).toBe(120);
  });
});
