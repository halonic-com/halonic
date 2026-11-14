// @vitest-environment jsdom
import { HostSettings } from "@halonicjs/app";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostSettingsService } from "../api.ts";
import { change, control, typeAndLeave } from "../test-support/controls.ts";
import { MemoryHostSettingsStore } from "../test-support/memory-host-settings-store.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { assistantPrefs } from "./assistant-prefs.ts";
import { AssistantSection, AssistantView } from "./assistant-section.tsx";

afterEach(unmountAll);

async function setup(place: "app" | "served" = "app") {
  const store = new MemoryHostSettingsStore();
  const settings = new HostSettings(store);
  await settings.load();
  const announce = vi.fn();
  const view = render(<AssistantView settings={settings} announce={announce} place={place} />);
  return { store, settings, announce, view };
}

const inputs = (view: HTMLElement) => [...view.querySelectorAll<HTMLInputElement>("input")];
const turnLimitBox = (view: HTMLElement) =>
  inputs(view).find((input) => input.placeholder === "16") as HTMLInputElement;

async function typeInTextArea(area: HTMLTextAreaElement, typed: string) {
  await act(async () => {
    area.focus();
    const prototype = Object.getPrototypeOf(area) as object;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(area, typed);
    area.dispatchEvent(new Event("input", { bubbles: true }));
    area.blur();
  });
}

verifies("settings.ai-agent-section", () => {
  it("opens Not set up, with the turn limit empty and connector tools on", async () => {
    const { view, store } = await setup();
    expect(view.textContent).toContain(
      "Used for new assistant chats in every workspace on this computer. Never saved in a workspace.",
    );
    expect(view.textContent).toContain("Assistant model");
    expect(view.textContent).toContain("Answers");
    expect(control<HTMLSelectElement>(view, "select").value).toBe("not-set-up");
    expect(view.textContent).toContain(
      "Not set up. Assistant chats use each workspace's model aliases.",
    );
    expect(turnLimitBox(view).value).toBe("");
    expect(view.textContent).toContain(
      "Model turns, tool calls included, before it stops and asks to continue.",
    );
    expect(control<HTMLInputElement>(view, '[role="switch"]').checked).toBe(true);
    expect(store.stored.size).toBe(0);
  });

  it("says the computer running Halonic when served", async () => {
    const { view } = await setup("served");
    expect(view.textContent).toContain("every workspace on the computer running Halonic");
  });

  it("saves a picked provider with its address, secret name and Local", async () => {
    const { view, settings } = await setup();
    await change(control(view, "select"), "ollama");
    expect(settings.get(assistantPrefs.provider)).toBe("ollama");
    expect(settings.get(assistantPrefs.baseUrl)).toBe("http://localhost:11434/v1");
    expect(settings.get(assistantPrefs.local)).toBe(true);
    expect(settings.get(assistantPrefs.secretName)).toBe("");
    expect(view.textContent).not.toContain("Not set up. Assistant chats");
  });

  it("saves the model when you leave it, and refuses an empty one with a provider set", async () => {
    const { view, settings } = await setup();
    await change(control(view, "select"), "anthropic");
    const model = inputs(view).find((input) => input.placeholder === "claude-sonnet-5-5");
    await typeAndLeave(model as HTMLInputElement, "  ");
    expect(view.textContent).toContain("Enter a model name, like claude-sonnet-5-5.");
    expect(settings.get(assistantPrefs.model)).toBe("");
    await typeAndLeave(model as HTMLInputElement, "claude-sonnet-5-5");
    expect(settings.get(assistantPrefs.model)).toBe("claude-sonnet-5-5");
    expect(view.textContent).not.toContain("Enter a model name");
  });

  it("saves a turn limit, refuses a wrong one, and clears back to the default", async () => {
    const { view, settings } = await setup();
    await typeAndLeave(turnLimitBox(view), "70");
    expect(view.textContent).toContain("Enter a whole number from 1 to 64.");
    expect(settings.get(assistantPrefs.turnLimit)).toBe(16);
    await typeAndLeave(turnLimitBox(view), "24");
    expect(settings.get(assistantPrefs.turnLimit)).toBe(24);
    expect(view.textContent).not.toContain("Enter a whole number");
    await typeAndLeave(turnLimitBox(view), "");
    expect(settings.get(assistantPrefs.turnLimit)).toBe(16);
  });

  it("saves the instructions when you leave them", async () => {
    const { view, settings } = await setup();
    await typeInTextArea(control<HTMLTextAreaElement>(view, "textarea"), "Answer briefly.");
    expect(settings.get(assistantPrefs.instructions)).toBe("Answer briefly.");
  });

  describe("when a save fails", () => {
    it("puts the switch back and says so under it and in the dialog", async () => {
      const { view, store, announce } = await setup();
      store.failSaves = true;
      await act(async () => control<HTMLInputElement>(view, '[role="switch"]').click());
      expect(control<HTMLInputElement>(view, '[role="switch"]').checked).toBe(true);
      expect(view.textContent).toContain("Couldn't save connector tools on this computer.");
      expect(announce).toHaveBeenCalledWith(
        "Couldn't save connector tools on this computer. Connector tools are back on.",
      );
    });

    it("puts a pick back, and keeps a typed value in its field", async () => {
      const { view, store, announce } = await setup();
      store.failSaves = true;
      await change(control(view, "select"), "openai");
      expect(control<HTMLSelectElement>(view, "select").value).toBe("not-set-up");
      expect(announce).toHaveBeenCalledWith(
        "Couldn't save the provider on this computer. Provider is back to Not set up.",
      );
      await typeAndLeave(turnLimitBox(view), "30");
      expect(turnLimitBox(view).value).toBe("30");
      expect(view.textContent).toContain("Couldn't save the turn limit on this computer.");
    });

    it("keeps the old provider and its fields when a later write of the pick fails", async () => {
      const { view, store, settings, announce } = await setup();
      store.failKeys.add(assistantPrefs.secretName.key);
      await change(control(view, "select"), "ollama");
      expect(control<HTMLSelectElement>(view, "select").value).toBe("not-set-up");
      expect(settings.get(assistantPrefs.provider)).toBe("not-set-up");
      expect(settings.get(assistantPrefs.baseUrl)).toBe("");
      expect(settings.get(assistantPrefs.local)).toBe(false);
      expect(view.textContent).toContain("Couldn't save the provider on this computer.");
      expect(announce).toHaveBeenCalledWith(
        "Couldn't save the provider on this computer. Provider is back to Not set up.",
      );
    });

    it("clears the line at the next good save", async () => {
      const { view, store } = await setup();
      store.failSaves = true;
      await typeAndLeave(turnLimitBox(view), "30");
      store.failSaves = false;
      await typeAndLeave(turnLimitBox(view), "30");
      expect(view.textContent).not.toContain("Couldn't save");
    });
  });

  it("shows a value another window or the CLI saved", async () => {
    const { view, store } = await setup();
    await act(async () => store.changeElsewhere("assistant.turn-limit", 20));
    expect(turnLimitBox(view).value).toBe("20");
  });
});

verifies("settings.ai-agent-section", () => {
  it("says it couldn't load when the settings can't be read, and loads them on Try again", async () => {
    const store = new MemoryHostSettingsStore();
    let readable = false;
    const read = store.read.bind(store);
    store.read = async () => {
      if (!readable) throw new Error("The settings file is locked.");
      return read();
    };
    const settings = new HostSettings(store);
    await settings.load().catch(() => undefined);
    const context = {
      services: { get: (key: unknown) => (key === HostSettingsService ? settings : undefined) },
      announcer: { announce: vi.fn() },
    } as unknown as SettingsSectionProps["context"];
    const view = render(
      <AssistantSection context={context} place="app" surface="window" closeSettings={() => {}} />,
    );

    expect(view.textContent).toContain("Couldn't load the Assistant settings from this computer.");
    expect(view.querySelector("select")).toBeNull();
    const tryAgain = [...view.querySelectorAll("button")].find(
      (b) => b.textContent === "Try again",
    );

    readable = true;
    await act(async () => tryAgain?.click());

    expect(view.textContent).not.toContain("Couldn't load");
    expect(control<HTMLSelectElement>(view, "select").value).toBe("not-set-up");
  });
});
