// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { homeViewWords } from "../home/home-view.tsx";
import type { HomeContentPaneProps, HomeListColumnProps } from "../points/home.ts";
import { serviceKey } from "../service-key.ts";
import { createShell, type Shell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

let restoreMedia: (() => void) | undefined;
let restoreModal: () => void;

beforeEach(() => {
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia?.();
  restoreMedia = undefined;
});

/** A service only the _chats_ feature's context reaches, so a slot shows whose context it got. */
const ChatsOwner = serviceKey<string>("chats.owner");

/** Home's list column as a feature draws it: one row, which opens "triage" in the pane. */
function ChatsColumn({ context, setOpen }: HomeListColumnProps) {
  return (
    <nav aria-label="Chats">
      <p className="owner">{context.services.get(ChatsOwner)}</p>
      <button type="button" className="triage" onClick={() => setOpen("triage")}>
        Triage
      </button>
    </nav>
  );
}

/** Home's content pane as a feature draws it: the open chat, else the sections. */
function ChatsPane({ context, open, sections }: HomeContentPaneProps) {
  const owner = context.services.get(ChatsOwner);
  return (
    <section className="chats-pane" data-owner={owner}>
      {open === undefined ? sections : `Chat ${open}`}
    </section>
  );
}

const chatsFeature = defineFeature({
  id: "chats",
  title: "Chats",
  provides: [ChatsOwner],
  register(studio) {
    studio.services.provide(ChatsOwner, () => "the chats feature");
    studio.home.setView({
      listColumn: { view: "ChatsColumn", load: async () => ({ ChatsColumn }) },
      contentPane: { view: "ChatsPane", load: async () => ({ ChatsPane }) },
    });
    studio.home.addCard({
      id: "needs-you",
      view: "NeedsYouCard",
      load: async () => ({ NeedsYouCard: () => <p className="needs-you">Nothing waits</p> }),
    });
  },
});

/** Draws the window at `width` with `features`, and lets Home's views load. */
async function renderHome(features: Parameters<typeof createShell>[0]["features"], width = 1280) {
  restoreMedia = new FakeMediaQueries(width).install();
  const shell: Shell = createShell({ features, timers: new FakeTimers() });
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
  await settle();
  await settle();
  return container;
}

/** Lets the lazily imported views resolve and React draw them. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function buttonNamed(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === name,
  );
}

verifies("shell.home-view", () => {
  it("draws the list column beside the content pane, with Home's sections in the pane", async () => {
    const container = await renderHome([chatsFeature]);
    const frame = container.querySelector("[data-sidebar-frame]");
    const column = frame?.querySelector('nav[aria-label="Chats"]')?.parentElement;
    expect(column?.className).toContain("w-[34%]");
    expect(column?.className).toContain("max-w-[380px]");
    const pane = frame?.querySelector(".chats-pane");
    expect(pane?.querySelector("h1")?.textContent).toBe("Home");
    expect(pane?.querySelector(".needs-you")?.textContent).toBe("Nothing waits");
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("gives both slots the context of the feature that set them", async () => {
    const container = await renderHome([chatsFeature]);
    expect(container.querySelector(".owner")?.textContent).toBe("the chats feature");
    expect(container.querySelector(".chats-pane")?.getAttribute("data-owner")).toBe(
      "the chats feature",
    );
  });

  it("shows in the content pane what the list column opened", async () => {
    const container = await renderHome([chatsFeature]);
    await act(async () => container.querySelector<HTMLButtonElement>(".triage")?.click());
    expect(container.querySelector(".chats-pane")?.textContent).toBe("Chat triage");
  });

  it("draws Home's sections alone while no feature set a view", async () => {
    const container = await renderHome([]);
    expect(container.querySelector("[data-sidebar-frame] .chats-pane")).toBeNull();
    expect(container.querySelector('nav[aria-label="Chats"]')).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Home");
  });

  it("shows one pane at a time under 900px: the list, then the open item under Back to Home", async () => {
    const container = await renderHome([chatsFeature], 800);
    expect(container.querySelector('nav[aria-label="Chats"]')).not.toBeNull();
    expect(container.querySelector(".chats-pane")).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>(".triage")?.click());
    expect(container.querySelector('nav[aria-label="Chats"]')).toBeNull();
    expect(container.querySelector(".chats-pane")?.textContent).toBe("Chat triage");
    await act(async () => buttonNamed(container, homeViewWords.back)?.click());
    expect(container.querySelector('nav[aria-label="Chats"]')).not.toBeNull();
  });

  it("shows Home's sections alone on a phone", async () => {
    const container = await renderHome([chatsFeature], 390);
    expect(container.querySelector('nav[aria-label="Chats"]')).toBeNull();
    expect(container.querySelector(".chats-pane")).toBeNull();
    expect(container.querySelector(".needs-you")?.textContent).toBe("Nothing waits");
  });
});
