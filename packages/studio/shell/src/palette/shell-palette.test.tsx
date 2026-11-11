// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import type {
  CommandContribution,
  SearchProviderContribution,
  SearchResult,
} from "../points/commands.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { Registered } from "../points/point-store.ts";
import { type TabLocation, TabSet } from "../tabs/tab-set.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { RecentPlaces } from "./recent-places.ts";
import { ShellPalette, usePaletteKey } from "./shell-palette.tsx";

const agents: TabLocation = { key: "agents", title: "Agents" };
const refundChecker: SearchResult = {
  item: { kind: "agent", hub: "acme", id: "refund-checker" },
  label: "Refund checker",
};

let restoreModal: () => void;

beforeEach(() => {
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
});

/** A provider whose answers the test gives, one question at a time. */
function heldProvider() {
  const questions: { words: string; answer: (results: readonly SearchResult[]) => void }[] = [];
  const provider: Registered<SearchProviderContribution> = {
    featureId: "agents",
    id: "agents",
    title: "Agents",
    order: 0,
    search: (words) =>
      new Promise((resolve, reject) => {
        questions.push({
          words,
          answer: (results) =>
            results.length === 0 && words === "fail" ? reject(new Error("down")) : resolve(results),
        });
      }),
  };
  return { provider, questions };
}

interface PaletteSetup {
  readonly commands?: readonly Registered<CommandContribution>[];
  readonly platform?: KeyboardPlatform;
}

const ctrlK: KeyboardEventInit = { key: "k", code: "KeyK", ctrlKey: true };

function renderPalette({ commands = [], platform = "windows" }: PaletteSetup = {}) {
  const tabs = new TabSet();
  const recent = new RecentPlaces(tabs);
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  const said: string[] = [];
  announcer.mountRegions({
    polite: { say: (text) => said.push(text) },
    assertive: { say: (text) => said.push(text) },
  });
  const toasts = createToastStore();
  const held = heldProvider();
  const ranWith: string[] = [];
  const contextFor = (featureId: string) => {
    ranWith.push(featureId);
    return { featureId } as unknown as WorkspaceContext;
  };

  function Window() {
    const [open, setOpen] = useState(false);
    usePaletteKey(platform, () => setOpen(true));
    return open ? (
      <ShellPalette
        tabs={tabs}
        recent={recent}
        providers={[held.provider]}
        commands={commands}
        kinds={{ get: (kind) => (kind === "agent" ? { label: "Agent" } : undefined) }}
        contextFor={contextFor}
        announcer={announcer}
        toasts={toasts}
        notAnswering="The engine isn't answering."
        platform={platform}
        onClose={() => setOpen(false)}
      />
    ) : null;
  }

  const view = render(<Window />);
  const box = () => view.querySelector<HTMLInputElement>('[role="combobox"]');
  return {
    tabs,
    toasts,
    ranWith,
    questions: held.questions,
    box,
    /** Presses keys on the window, Ctrl K unless told otherwise. */
    open: (keys: KeyboardEventInit = ctrlK) =>
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { ...keys, bubbles: true, cancelable: true }),
        );
      }),
    type: (words: string) =>
      act(() => {
        const field = box() as HTMLInputElement;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
          field,
          words,
        );
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }),
    press: (key: string, held: KeyboardEventInit = {}) =>
      act(() => {
        box()?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...held }));
      }),
    answer: async (index: number, results: readonly SearchResult[]) => {
      await act(async () => {
        held.questions[index]?.answer(results);
      });
    },
    rowNames: () =>
      [...view.querySelectorAll('[role="option"]')].map((row) => row.getAttribute("aria-label")),
    /** Each row's place icon, by the row's name; `null` for a row with none. */
    rowIcons: () =>
      [...view.querySelectorAll('[role="option"]')].map((row) => [
        row.getAttribute("aria-label"),
        row.querySelector("[data-place-icon]")?.getAttribute("data-place-icon") ?? null,
      ]),
    heard: () => {
      timers.advance(0);
      return said;
    },
  };
}

verifies("shell.palette-wiring", () => {
  it("opens on Ctrl K with an empty box, listing open tabs and recent places", () => {
    const palette = renderPalette();
    palette.tabs.openHere(agents);
    palette.tabs.openInNewTab({ key: "runs", title: "Runs" });
    palette.open();
    expect(palette.box()?.value).toBe("");
    expect(palette.rowNames()).toEqual(["Agents, switch to tab", "Runs, switch to tab", "Home"]);
  });

  it("opens on Cmd K on macOS, and not on Ctrl K there", () => {
    const palette = renderPalette({ platform: "macos" });
    palette.open(ctrlK);
    expect(palette.box()).toBeNull();
    palette.open({ key: "k", code: "KeyK", metaKey: true });
    expect(palette.box()).not.toBeNull();
  });

  it("opens on Ctrl K on a layout without Latin letters, by the key's place", () => {
    const palette = renderPalette();
    palette.open({ key: "л", code: "KeyK", ctrlKey: true });
    expect(palette.box()).not.toBeNull();
  });

  it("leaves Ctrl T alone on a Latin layout where that key sits where K does", () => {
    const palette = renderPalette();
    palette.open({ key: "t", code: "KeyK", ctrlKey: true });
    expect(palette.box()).toBeNull();
  });

  it("does nothing on Ctrl K while a modal dialog is open", () => {
    const palette = renderPalette();
    const dialog = document.body.appendChild(document.createElement("dialog"));
    dialog.showModal();
    palette.open();
    expect(palette.box()).toBeNull();
    dialog.remove();
    palette.open();
    expect(palette.box()).not.toBeNull();
  });

  it("uses only the answer to the latest words", async () => {
    const palette = renderPalette();
    palette.open();
    palette.type("re");
    palette.type("ref");
    expect(palette.questions.map((question) => question.words)).toEqual(["re", "ref"]);
    await palette.answer(0, [refundChecker]);
    expect(palette.rowNames()).toEqual([]);
    await palette.answer(1, [refundChecker]);
    expect(palette.rowNames()).toEqual(["Refund checker, agent"]);
  });

  it("keeps showing what earlier words found while a newer search runs", async () => {
    const palette = renderPalette();
    palette.open();
    palette.type("refund");
    await palette.answer(0, [refundChecker]);
    palette.type("refund c");
    expect(palette.questions).toHaveLength(2);
    expect(palette.rowNames()).toEqual(["Refund checker, agent"]);
  });

  it("asks again on Try again after a provider failed", async () => {
    const palette = renderPalette();
    palette.open();
    palette.type("fail");
    await palette.answer(0, []);
    const tryAgain = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    act(() => tryAgain?.click());
    expect(palette.questions.map((question) => question.words)).toEqual(["fail", "fail"]);
  });

  it("opens an item here and closes, or in a new tab and stays open", async () => {
    const palette = renderPalette();
    palette.open();
    palette.type("refund");
    await palette.answer(0, [refundChecker]);
    palette.press("Enter", { ctrlKey: true });
    expect(palette.tabs.state.tabs).toHaveLength(2);
    expect(palette.box()).not.toBeNull();
    expect(palette.heard()).toContain("Opened Refund checker in a new tab.");

    palette.press("Enter");
    expect(palette.box()).toBeNull();
    expect(palette.tabs.active.history.at(-1)).toEqual({
      key: "agent/acme/refund-checker",
      title: "Refund checker",
      kind: "agent",
    });
  });

  it("closes and runs an action with its feature's context, and a failure is a toast", async () => {
    const palette = renderPalette({
      commands: [
        {
          featureId: "agents",
          id: "agents.new",
          title: "New agent",
          run: () => {
            throw new Error("disk gone");
          },
        },
      ],
    });
    palette.open();
    palette.type("new");
    await palette.answer(0, []);
    await act(async () => palette.press("Enter"));
    expect(palette.box()).toBeNull();
    expect(palette.ranWith.at(-1)).toBe("agents");
    expect(palette.toasts.list().map((toast) => [toast.tone, toast.title])).toEqual([
      ["danger", "Couldn't run New agent."],
    ]);
  });
});

verifies("shell.palette-dialog", () => {
  it("says Search in the empty box", () => {
    const palette = renderPalette();
    palette.open();
    expect(palette.box()?.placeholder).toBe("Search");
  });

  it("shows a place's outline icon from the sidebar on its row, and none on an item's", async () => {
    const palette = renderPalette();
    palette.tabs.openHere(agents);
    palette.open();
    expect(palette.rowIcons()).toEqual([
      ["Agents, switch to tab", "agents"],
      ["Home", "home"],
    ]);
    palette.type("ref");
    await palette.answer(0, [refundChecker]);
    expect(palette.rowIcons()).toEqual([["Refund checker, agent", null]]);
  });
});
