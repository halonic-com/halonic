// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { ItemPage } from "../item-page/item-page.tsx";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

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

function Page() {
  return (
    <ItemPage
      icon={<svg viewBox="0 0 16 16" />}
      kind="Workflow"
      name="Page"
      onRename={() => undefined}
      views={[{ id: "flow", label: "Flow" }]}
    >
      {() => <p>Flow</p>}
    </ItemPage>
  );
}

const workflowsFeature = defineFeature({
  id: "workflows",
  title: "Workflows",
  register(studio) {
    studio.itemKinds.add({
      kind: "workflow",
      label: "Workflow",
      icon: "workflows",
      place: "workflows",
      open: { view: "Page", load: async () => ({ Page }) },
    });
    studio.itemKinds.add({
      kind: "loose",
      label: "Loose",
      icon: "workflows",
      open: { view: "Page", load: async () => ({ Page }) },
    });
  },
});

function renderWindow() {
  const shell = createShell({ features: [workflowsFeature], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
    />,
  );
  return { container, workspace };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function backLink(container: HTMLElement): HTMLAnchorElement | null {
  return container.querySelector<HTMLAnchorElement>('main nav[aria-label="Back"] a');
}

const supportReply = { key: "workflow/acme/support-reply", title: "Support reply" };

verifies("shell.page-back-link", () => {
  it("shows a real link to the place above the page, and the window's title names the page", async () => {
    const { container, workspace } = renderWindow();
    act(() => workspace.tabs.openHere(supportReply));
    await settle();

    const link = backLink(container);
    expect(link?.textContent).toBe("Workflows");
    expect(link?.getAttribute("href")).toBe("#workflows");
    expect(link?.getAttribute("aria-label")).toBe("Back to Workflows");
    expect(link?.compareDocumentPosition(container.querySelector("main header") as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(document.title.startsWith("Support reply")).toBe(true);
  });

  it("opens the place in the same tab on a click", async () => {
    const { container, workspace } = renderWindow();
    act(() => workspace.tabs.openHere(supportReply));
    await settle();

    act(() => backLink(container)?.click());

    expect(workspace.tabs.state.tabs).toHaveLength(1);
    expect(workspace.tabs.active.history.at(-1)?.key).toBe("workflows");
  });

  it("opens the place in a new tab on a Ctrl-click, leaving the page", async () => {
    const { container, workspace } = renderWindow();
    act(() => workspace.tabs.openHere(supportReply));
    await settle();

    act(() => {
      backLink(container)?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }),
      );
    });

    expect(workspace.tabs.state.tabs.map((tab) => tab.history.at(-1)?.key)).toEqual([
      supportReply.key,
      "workflows",
    ]);
  });

  it("shows no link on Home or for a kind without a place", async () => {
    const { container, workspace } = renderWindow();
    await settle();
    expect(backLink(container)).toBeNull();

    act(() => workspace.tabs.openHere({ key: "loose/acme/one", title: "One" }));
    await settle();
    expect(backLink(container)).toBeNull();
  });
});
