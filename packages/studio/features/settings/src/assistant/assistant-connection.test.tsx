// @vitest-environment jsdom
import { HostSettings } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { change, control, typeAndLeave } from "../test-support/controls.ts";
import { MemoryHostSettingsStore } from "../test-support/memory-host-settings-store.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { assistantPrefs } from "./assistant-prefs.ts";
import { AssistantView } from "./assistant-section.tsx";

afterEach(unmountAll);

async function setup(place: "app" | "served" = "app") {
  const store = new MemoryHostSettingsStore();
  const settings = new HostSettings(store);
  await settings.load();
  const announce = vi.fn();
  const view = render(<AssistantView settings={settings} announce={announce} place={place} />);
  return { store, settings, announce, view };
}

const row = (view: HTMLElement) => view.querySelector("details");
const labelled = (view: HTMLElement, label: string) =>
  [...view.querySelectorAll<HTMLInputElement>("input")].find(
    (input) => view.querySelector(`label[for="${input.id}"]`)?.textContent === label,
  ) as HTMLInputElement;

verifies("settings.ai-agent-connection", () => {
  it("has no How it connects row while Not set up", async () => {
    const { view } = await setup();
    expect(row(view)).toBeNull();
  });

  it("shows the row closed for a hosted provider", async () => {
    const { view } = await setup();
    await change(control(view, "select"), "anthropic");
    expect(row(view)?.open).toBe(false);
    expect(row(view)?.textContent).toContain("How it connects");
  });

  it("opens the row with the focus in Base URL when OpenAI-compatible is picked", async () => {
    const { view } = await setup();
    await change(control(view, "select"), "openai-compatible");
    expect(row(view)?.open).toBe(true);
    expect(document.activeElement).toBe(labelled(view, "Base URL"));
  });

  it("refuses a wrong Base URL and saves a good one", async () => {
    const { view, settings } = await setup();
    await change(control(view, "select"), "openai-compatible");
    await typeAndLeave(labelled(view, "Base URL"), "localhost");
    expect(view.textContent).toContain("Enter a full address, like http://localhost:8000/v1.");
    expect(settings.get(assistantPrefs.baseUrl)).toBe("");
    await typeAndLeave(labelled(view, "Base URL"), "http://localhost:8000/v1");
    expect(settings.get(assistantPrefs.baseUrl)).toBe("http://localhost:8000/v1");
  });

  it("saves the secret name, and refuses one a secret can't have", async () => {
    const { view, settings } = await setup();
    await change(control(view, "select"), "anthropic");
    await typeAndLeave(labelled(view, "Secret name"), "9bad name");
    expect(view.textContent).toContain("Use a letter first");
    await typeAndLeave(labelled(view, "Secret name"), "my-key");
    expect(settings.get(assistantPrefs.secretName)).toBe("my-key");
  });

  it("keeps the row open and the focus in place while a Base URL is saved", async () => {
    const { view, store, settings } = await setup();
    await change(control(view, "select"), "anthropic");
    await act(async () => store.changeElsewhere("assistant.provider", "openai-compatible"));
    expect(row(view)?.open).toBe(true);
    await typeAndLeave(labelled(view, "Base URL"), "http://localhost:8000/v1");
    expect(settings.get(assistantPrefs.baseUrl)).toBe("http://localhost:8000/v1");
    expect(row(view)?.open).toBe(true);
    const secret = labelled(view, "Secret name");
    await act(async () => secret.focus());
    expect(document.activeElement).toBe(secret);
  });

  it("does not move the focus into Base URL when the provider pick fails", async () => {
    const { view, store } = await setup();
    store.failSaves = true;
    await change(control(view, "select"), "openai-compatible");
    expect(document.activeElement).not.toBe(labelled(view, "Base URL"));
  });

  it("puts Local back and says so when its save fails", async () => {
    const { view, store, announce } = await setup();
    await change(control(view, "select"), "anthropic");
    store.failSaves = true;
    const local = view.querySelectorAll<HTMLInputElement>('[role="switch"]')[0];
    await act(async () => local?.click());
    expect(local?.checked).toBe(false);
    expect(view.textContent).toContain("Couldn't save Local on this computer.");
    expect(announce).toHaveBeenCalledWith(
      "Couldn't save Local on this computer. Local is back off.",
    );
  });
});

verifies("settings.ai-agent-view-only", () => {
  it("shows values and no controls when served", async () => {
    const { view, store } = await setup("served");
    await act(async () => store.changeElsewhere("assistant.provider", "ollama"));
    expect(view.textContent).toContain(
      "View only here. Change the assistant on the computer running Halonic.",
    );
    expect(view.textContent).toContain("Ollama (local)");
    expect(view.querySelector("input, select, textarea, [role='switch']")).toBeNull();
  });
});
