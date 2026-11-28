// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useEffect, useState } from "react";
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
  chatRows = ["inbox", "triage"];
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia?.();
  restoreMedia = undefined;
});

/** A service only the _chats_ feature's context reaches, so a slot shows whose context it got. */
const ChatsOwner = serviceKey<string>("chats.owner");

/** The chats the list column reads, and how a test takes one out while it's open. */
let chatRows: readonly string[] = [];
let removeChat: (id: string) => void = () => undefined;

/**
 * Home's list column as a feature draws it: it reads its chats before it draws them, as Home's
 * own column does, and its rows take the focus on their gridcell, as the kit's `List` rows do.
 */
function ChatsColumn({ context, setOpen }: HomeListColumnProps) {
  const [rows, setRows] = useState<readonly string[] | undefined>(undefined);
  useEffect(() => {
    void Promise.resolve(chatRows).then(setRows);
  }, []);
  removeChat = (id) => setRows((current) => current?.filter((each) => each !== id));
  return (
    <nav aria-label="Chats">
      <p className="owner">{context.services.get(ChatsOwner)}</p>
      <div role="grid">
        {rows?.map((id) => (
          <div key={id} role="row" data-row-id={id}>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: the kit's grid handles the keys. */}
            <div role="gridcell" tabIndex={-1} className={id} onClick={() => setOpen(id)}>
              {id}
            </div>
          </div>
        ))}
      </div>
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
    await act(async () => container.querySelector<HTMLElement>(".triage")?.click());
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
    await act(async () => container.querySelector<HTMLElement>(".triage")?.click());
    expect(container.querySelector('nav[aria-label="Chats"]')?.parentElement?.className).toBe(
      "hidden",
    );
    expect(container.querySelector(".chats-pane")?.textContent).toBe("Chat triage");
    await act(async () => buttonNamed(container, homeViewWords.back)?.click());
    expect(container.querySelector('nav[aria-label="Chats"]')?.parentElement?.className).not.toBe(
      "hidden",
    );
  });

  it("moves the focus to Back to Home when an item opens under 900px, and back to its row after", async () => {
    const container = await renderHome([chatsFeature], 800);
    container.querySelector<HTMLElement>(".triage")?.focus();
    await act(async () => container.querySelector<HTMLElement>(".triage")?.click());
    expect(document.activeElement).toBe(buttonNamed(container, homeViewWords.back));
    await act(async () => buttonNamed(container, homeViewWords.back)?.click());
    expect(document.activeElement).toBe(container.querySelector(".triage"));
  });

  it("moves the focus to the first row on Back to Home when the open item's row is gone", async () => {
    const container = await renderHome([chatsFeature], 800);
    await act(async () => container.querySelector<HTMLElement>(".triage")?.click());
    await act(async () => removeChat("triage"));
    await act(async () => buttonNamed(container, homeViewWords.back)?.click());
    expect(document.activeElement).toBe(container.querySelector(".inbox"));
  });

  it("shows Home's sections alone on a phone", async () => {
    const container = await renderHome([chatsFeature], 390);
    expect(container.querySelector('nav[aria-label="Chats"]')).toBeNull();
    expect(container.querySelector(".chats-pane")).toBeNull();
    expect(container.querySelector(".needs-you")?.textContent).toBe("Nothing waits");
  });
});
