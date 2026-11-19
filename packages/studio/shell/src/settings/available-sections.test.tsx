// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import type { HomeCardProps } from "../home/home-page.tsx";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { StudioWindow } from "../window/studio-window.tsx";
import { StudioWorkspace } from "../window/studio-workspace.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

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

/** Lists the sections the window gives features, as Ctrl K reads them. */
function SectionsCard({ context }: HomeCardProps) {
  return (
    <output className="settings-sections">
      {(context.settingsSections ?? []).map(({ id }) => id).join(",")}
    </output>
  );
}

/** How the test drives Remote's `available`, and what the window gave it. */
const remote = {
  set: (_available: boolean): void => undefined,
  stops: 0,
  context: undefined as WorkspaceContext | undefined,
};

const sectionsFeature = defineFeature({
  id: "sections",
  title: "Sections",
  register(studio) {
    const view = { view: "SectionView", load: async () => ({ SectionView }) };
    studio.settings.add({
      id: "appearance",
      title: "Appearance",
      scope: "display",
      order: 10,
      ...view,
    });
    studio.settings.add({
      id: "remote",
      title: "Remote",
      scope: "host",
      order: 20,
      ...view,
      available(context, set) {
        remote.context = context;
        remote.set = set;
        return () => {
          remote.stops += 1;
        };
      },
    });
    studio.home.addCard({
      id: "needs-you",
      view: "SectionsCard",
      load: async () => ({ SectionsCard }),
    });
  },
});

async function renderWindow() {
  const shell = createShell({ features: [sectionsFeature], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name: "Acme" });
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="linux"
      language="en"
    />,
  );
  await settle();
  const listed = () => container.querySelector(".settings-sections")?.textContent;
  const openSettingsList = async () => {
    act(() =>
      container
        .querySelector<HTMLElement>('nav[aria-label="Places"] a[aria-label^="More"]')
        ?.click(),
    );
    const settings = [...container.querySelectorAll("main tr [role=gridcell]")].find(
      (cell) => cell.textContent === "Settings",
    );
    act(() => (settings as HTMLElement | undefined)?.click());
    await settle();
  };
  const rowNames = () =>
    [...container.querySelectorAll("main tr [role=gridcell]")].map((cell) => cell.textContent);
  return { listed, openSettingsList, rowNames };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("shell.settings-section-available", () => {
  it("leaves a section out until it says it is available", async () => {
    const { listed } = await renderWindow();

    expect(listed()).toBe("appearance");
    expect(remote.context?.services).toBeDefined();
  });

  it("lists the section once it says true, and leaves it out again on false", async () => {
    const { listed, openSettingsList, rowNames } = await renderWindow();
    act(() => remote.set(true));
    expect(listed()).toBe("appearance,remote");

    await openSettingsList();
    expect(rowNames()).toEqual(["Appearance", "Remote"]);

    act(() => remote.set(false));
    expect(rowNames()).toEqual(["Appearance"]);
  });

  it("stops asking when the window goes", async () => {
    remote.stops = 0;
    await renderWindow();
    unmountAll();

    expect(remote.stops).toBe(1);
  });
});
