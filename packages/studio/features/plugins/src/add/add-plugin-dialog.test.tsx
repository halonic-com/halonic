// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AddPluginDialog } from "./add-plugin-dialog.tsx";
import type { PluginAddOutcome, PluginAddSource, PluginInstaller } from "./plugin-installer.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

interface Seen {
  readonly sources: PluginAddSource[];
  readonly added: string[];
  readonly opened: string[];
}

function show(
  add: PluginInstaller["add"],
  seen: Seen,
  chooseFolder?: PluginInstaller["chooseFolder"],
) {
  render(
    <AddPluginDialog
      installer={{ add, ...(chooseFolder === undefined ? {} : { chooseFolder }) }}
      onAdded={(plugin) => seen.added.push(plugin)}
      onOpen={(plugin) => seen.opened.push(plugin)}
      onCancel={() => {}}
    />,
  );
}

function fresh(): Seen {
  return { sources: [], added: [], opened: [] };
}

function reply(seen: Seen, outcome: PluginAddOutcome): PluginInstaller["add"] {
  return async (source) => {
    seen.sources.push(source);
    return outcome;
  };
}

function button(name: string): HTMLButtonElement {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
  const found =
    buttons.find((candidate) => candidate.textContent?.trim() === name) ??
    buttons.find((candidate) => candidate.textContent?.startsWith(name) === true);
  if (found === undefined) throw new Error(`No button ${name}`);
  return found;
}

async function press(name: string) {
  await act(async () => button(name).click());
  // The dialog's alert slot empties for a frame on each attempt, then shows the failure.
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

function inputLabelled(label: string): HTMLInputElement {
  const field = [...document.querySelectorAll("label")].find((l) =>
    l.textContent?.startsWith(label),
  );
  const id = field?.getAttribute("for");
  const input = id === null || id === undefined ? null : document.getElementById(id);
  if (!(input instanceof HTMLInputElement)) throw new Error(`No field ${label}`);
  return input;
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pickGit() {
  const radio = [...document.querySelectorAll<HTMLInputElement>("input[type=radio]")][1];
  await act(async () => radio?.click());
}

const text = () => document.querySelector("dialog")?.textContent ?? "";

verifies("plugins.plugin-add", () => {
  it("says what to enter when Add is pressed on an empty field, and asks nothing", async () => {
    const seen = fresh();
    show(reply(seen, { kind: "added", plugin: "weather" }), seen);
    await press("Add plugin");
    expect(text()).toContain("Enter a folder or a git address.");
    expect(seen.sources).toEqual([]);
  });

  it("asks for a folder, and for a git address with its version", async () => {
    const seen = fresh();
    show(reply(seen, { kind: "added", plugin: "weather" }), seen);
    await type(inputLabelled("Folder"), "/plugins/halonic-weather");
    await press("Add plugin");
    // The window closes the dialog once it's added; a fresh one stands in for the next time.
    unmountAll();
    show(reply(seen, { kind: "added", plugin: "weather" }), seen);
    await pickGit();
    await type(inputLabelled("Address"), "https://github.com/acme/halonic-weather.git");
    await type(inputLabelled("Branch, tag or version"), "v1.2.0");
    await press("Add plugin");
    expect(seen.sources).toEqual([
      { kind: "folder", path: "/plugins/halonic-weather" },
      {
        kind: "git",
        address: "https://github.com/acme/halonic-weather.git",
        ref: "v1.2.0",
      },
    ]);
    expect(seen.added).toEqual(["weather", "weather"]);
  });

  it("says Getting halonic-weather… and makes the field unavailable while it copies", async () => {
    const seen = fresh();
    let finish: (outcome: PluginAddOutcome) => void = () => {};
    show(
      () => new Promise((resolve) => (finish = resolve)),
      seen,
      async () => undefined,
    );
    await type(inputLabelled("Folder"), "/plugins/halonic-weather/");
    await press("Add plugin");
    expect(text()).toContain("Getting halonic-weather…");
    expect(inputLabelled("Folder").disabled).toBe(true);
    expect(button("Choose folder…").getAttribute("aria-busy")).toBe("true");
    await act(async () => finish({ kind: "added", plugin: "weather" }));
    expect(seen.added).toEqual(["weather"]);
  });

  it("lists a broken plugin's problems and offers Try again", async () => {
    const seen = fresh();
    show(
      reply(seen, {
        kind: "broken",
        problems: [
          {
            file: "plugin.yaml",
            path: ["ui", "commands", 0, "tool"],
            message: "No tool called x.",
          },
          { file: "plugin.yaml", path: [], message: "Missing sdk." },
        ],
      }),
      seen,
    );
    await type(inputLabelled("Folder"), "/plugins/halonic-weather");
    await press("Add plugin");
    const shown = text();
    expect(shown).toContain(
      "Can't add halonic-weather. Its plugin.yaml has 2 problems. Nothing was installed.",
    );
    expect(shown).toContain("plugin.yaml ui.commands.0.tool");
    expect(shown).toContain("No tool called x.");
    expect(button("Try again")).toBeDefined();
    expect(seen.added).toEqual([]);
  });

  it("offers Open for a plugin that is already installed", async () => {
    const seen = fresh();
    show(reply(seen, { kind: "taken", plugin: "weather" }), seen);
    await type(inputLabelled("Folder"), "/plugins/halonic-weather");
    await press("Add plugin");
    expect(text()).toContain(
      "A plugin called weather is already installed. Update it from its page.",
    );
    await press("Open weather");
    expect(seen.opened).toEqual(["weather"]);
  });

  it("says offline and no plugin.yaml in the same words as the microcopy", async () => {
    const seen = fresh();
    show(reply(seen, { kind: "offline", host: "github.com" }), seen);
    await type(inputLabelled("Folder"), "/x");
    await press("Add plugin");
    expect(text()).toContain("Couldn't reach github.com: you're offline.");
    unmountAll();
    show(reply(seen, { kind: "no-manifest" }), seen);
    await type(inputLabelled("Folder"), "/x");
    await press("Add plugin");
    expect(text()).toContain("That folder has no plugin.yaml.");
  });

  it("says why when adding throws, and that nothing was installed", async () => {
    const seen = fresh();
    show(async () => {
      throw new Error("The disk is full.");
    }, seen);
    await type(inputLabelled("Folder"), "/plugins/halonic-weather");
    await press("Add plugin");
    expect(text()).toContain(
      "Couldn't add halonic-weather: The disk is full. Nothing was installed.",
    );
  });

  it("fills the folder from Choose folder…", async () => {
    const seen = fresh();
    show(reply(seen, { kind: "added", plugin: "weather" }), seen, async () => "/picked/one");
    await press("Choose folder…");
    expect(inputLabelled("Folder").value).toBe("/picked/one");
  });

  it("clears the failure when the person picks the other source", async () => {
    const seen = fresh();
    show(reply(seen, { kind: "no-manifest" }), seen);
    await type(inputLabelled("Folder"), "/plugins/empty");
    await press("Add plugin");
    expect(text()).toContain("That folder has no plugin.yaml.");
    await pickGit();
    expect(text()).not.toContain("That folder has no plugin.yaml.");
    expect(button("Add plugin")).toBeDefined();
  });
});
