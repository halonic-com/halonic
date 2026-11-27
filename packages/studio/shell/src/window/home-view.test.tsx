// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import type { HomeContentPaneProps, HomeListColumnProps } from "../points/home.ts";
import { createShell, type Shell } from "../shell.ts";
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

/** Home's list column as a feature draws it: one row, which opens "triage" in the pane. */
function ChatsColumn({ setOpen }: HomeListColumnProps) {
  return (
    <nav aria-label="Chats">
      <button type="button" className="triage" onClick={() => setOpen("triage")}>
        Triage
      </button>
    </nav>
  );
}

/** Home's content pane as a feature draws it: the open chat, else the sections. */
function ChatsPane({ open, sections }: HomeContentPaneProps) {
  return <section className="chats-pane">{open === undefined ? sections : `Chat ${open}`}</section>;
}

const chatsFeature = defineFeature({
  id: "chats",
  title: "Chats",
  register(studio) {
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

function renderHome(shell: Shell) {
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  return render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
    />,
  );
}

/** Lets the lazily imported views resolve and React draw them. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("shell.home-view", () => {
  it("draws the list column beside the content pane, with Home's sections in the pane", async () => {
    const container = renderHome(
      createShell({ features: [chatsFeature], timers: new FakeTimers() }),
    );
    await settle();
    await settle();
    expect(container.querySelector('nav[aria-label="Chats"]')).not.toBeNull();
    const pane = container.querySelector("main .chats-pane");
    expect(pane?.querySelector("h1")?.textContent).toBe("Home");
    expect(pane?.querySelector(".needs-you")?.textContent).toBe("Nothing waits");
  });

  it("shows in the content pane what the list column opened", async () => {
    const container = renderHome(
      createShell({ features: [chatsFeature], timers: new FakeTimers() }),
    );
    await settle();
    await settle();
    await act(async () => container.querySelector<HTMLButtonElement>(".triage")?.click());
    expect(container.querySelector("main .chats-pane")?.textContent).toBe("Chat triage");
  });

  it("draws Home's sections alone while no feature set a view", async () => {
    const container = renderHome(createShell({ features: [], timers: new FakeTimers() }));
    await settle();
    expect(container.querySelector("main .chats-pane")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Home");
  });
});
