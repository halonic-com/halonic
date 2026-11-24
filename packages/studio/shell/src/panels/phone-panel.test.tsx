// @vitest-environment jsdom

import { SidePanel } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { PHONE_WIDTH, renderPhoneWindow, settle } from "../test-support/phone-window.tsx";
import { unmountAll } from "../test-support/render.tsx";
import type { PanelWindowViewProps } from "./panel-window-slot.tsx";

let restore: (() => void)[] = [];

beforeEach(() => {
  restore = [new FakeMediaQueries(PHONE_WIDTH).install(), fakeShowModal()];
});

afterEach(() => {
  unmountAll();
  for (const undo of restore) undo();
  window.history.replaceState(null, "");
});

/** A panel as the Assistant draws it: the kit's frame, a panel sheet with Back on a phone. */
function NotesPanel({ title, onClose }: PanelWindowViewProps) {
  return (
    <SidePanel title={title} onClose={onClose}>
      <textarea aria-label="Message" />
    </SidePanel>
  );
}

const assistant = defineFeature({
  id: "assistant",
  title: "Assistant",
  register(studio) {
    studio.panelWindows.add({
      id: "assistant.panel",
      order: 10,
      title: "Assistant",
      view: "NotesPanel",
      load: async () => ({ NotesPanel }),
    });
  },
});

const agents = defineFeature({
  id: "agents",
  title: "Agents",
  register(studio) {
    studio.places.add({
      id: "agents",
      view: "AgentsView",
      load: async () => ({ AgentsView: () => <h1 tabIndex={-1}>Agents</h1> }),
    });
  },
});

function renderWithPanel() {
  const phone = renderPhoneWindow([assistant, agents]);
  const panel = () => phone.container.querySelector<HTMLElement>("[data-panel-window]");
  const navigation = () => phone.container.querySelector('nav[aria-label="Places"]');
  const open = async () => {
    act(() => phone.button("Assistant")?.click());
    await settle();
  };
  return { ...phone, panel, navigation, open };
}

// As the browser does: the shell's entry comes off, and `popstate` fires on the one under it.
function pressAndroidBack() {
  act(() => {
    window.history.replaceState(null, "");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

verifies("shell.phone-panel", () => {
  it("puts the Assistant's orb after Search at the top of a place", () => {
    const { container, button } = renderWithPanel();

    const actions = [...container.querySelectorAll("header button")].map((each) =>
      each.getAttribute("aria-label"),
    );
    expect(actions).toEqual(["Search", "Assistant"]);
    // A see-through border, as Search's, which high contrast draws (component specs 15.1).
    expect(button("Assistant")?.className).toContain("border border-transparent");
    const orb = button("Assistant")?.querySelector(".agent-orb");
    expect(orb?.getAttribute("data-size")).toBe("24");
    expect(orb?.getAttribute("aria-hidden")).toBe("true");
    expect(orb?.getAttribute("style")).toContain("--orb-a: var(--halo-blue)");
  });

  it("opens the panel as a full page over the page, which stays there, inert", async () => {
    const { container, button, panel, navigation, open } = renderWithPanel();
    const home = container.querySelector("main");

    await open();

    expect(panel()?.className).toContain("absolute inset-0");
    expect(panel()?.querySelector("header button")?.getAttribute("aria-label")).toBe("Back");
    expect(button("Search")).toBeNull();
    expect(navigation()).toBeNull();
    expect(container.querySelector("main")).toBe(home);
    expect(home?.closest("[inert]")).not.toBeNull();
    expect(home?.querySelector("h1")?.textContent).toBe("Home");
  });

  it("closes with its Back, and gives the focus back to the orb", async () => {
    const { button, panel, navigation, open } = renderWithPanel();
    await open();

    act(() =>
      panel()?.querySelector<HTMLButtonElement>('header button[aria-label="Back"]')?.click(),
    );
    await settle();

    expect(panel()).toBeNull();
    expect(navigation()).not.toBeNull();
    expect(document.activeElement).toBe(button("Assistant"));
    expect(document.querySelector("main")?.closest("[inert]")).toBeNull();
  });

  it("closes with Android's back wherever the focus is", async () => {
    const { button, panel, title, open } = renderWithPanel();
    await open();
    act(() => (document.activeElement as HTMLElement | null)?.blur());

    pressAndroidBack();
    await settle();

    expect(panel()).toBeNull();
    expect(title()).toBe("Home");
    expect(document.activeElement).toBe(button("Assistant"));
  });

  it("shows no orb on a page under the top of a place", async () => {
    const { button, openUnderMore } = renderWithPanel();

    await openUnderMore("Agents");

    expect(button("Back")).not.toBeNull();
    expect(button("Assistant")).toBeNull();
  });
});
