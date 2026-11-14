// @vitest-environment jsdom
import { HostSettings } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
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
  const view = render(<AssistantView settings={settings} announce={vi.fn()} place={place} />);
  return { settings, view };
}

const labelled = (view: HTMLElement, label: string) =>
  [
    ...view.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    ),
  ].find((input) => view.querySelector(`label[for="${input.id}"]`)?.textContent === label) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement;
const tuningRow = (view: HTMLElement) =>
  [...view.querySelectorAll("details")].find((row) => row.textContent?.startsWith("Tuning"));

verifies("settings.ai-agent-tuning", () => {
  it("has no Tuning row while Not set up, and a closed one once a provider is set", async () => {
    const { view } = await setup();
    expect(tuningRow(view)).toBeUndefined();
    await change(control(view, "select"), "anthropic");
    expect(tuningRow(view)?.open).toBe(false);
  });

  it("saves a temperature, refuses one out of range, and empties back to the default", async () => {
    const { view, settings } = await setup();
    await change(control(view, "select"), "anthropic");
    await typeAndLeave(labelled(view, "Temperature") as HTMLInputElement, "0.3");
    expect(settings.get(assistantPrefs.temperature)).toBe(0.3);
    await typeAndLeave(labelled(view, "Temperature") as HTMLInputElement, "3");
    expect(view.textContent).toContain("Enter a number from 0 to 2.");
    expect(settings.get(assistantPrefs.temperature)).toBe(0.3);
    await typeAndLeave(labelled(view, "Temperature") as HTMLInputElement, "");
    expect(settings.get(assistantPrefs.temperature)).toBeNull();
  });

  it("checks top-p and max tokens", async () => {
    const { view, settings } = await setup();
    await change(control(view, "select"), "anthropic");
    await typeAndLeave(labelled(view, "Top-p") as HTMLInputElement, "1.5");
    expect(view.textContent).toContain("Enter a number from 0 to 1.");
    await typeAndLeave(labelled(view, "Top-p") as HTMLInputElement, "0.9");
    expect(settings.get(assistantPrefs.topP)).toBe(0.9);
    await typeAndLeave(labelled(view, "Max tokens") as HTMLInputElement, "0");
    expect(view.textContent).toContain("Enter a whole number above 0.");
    await typeAndLeave(labelled(view, "Max tokens") as HTMLInputElement, "800");
    expect(settings.get(assistantPrefs.maxTokens)).toBe(800);
  });

  it("saves stop sequences one per line and the reasoning effort", async () => {
    const { view, settings } = await setup();
    await change(control(view, "select"), "anthropic");
    await typeAndLeave(labelled(view, "Stop") as unknown as HTMLInputElement, "END\n\nSTOP");
    expect(settings.get(assistantPrefs.stop)).toEqual(["END", "STOP"]);
    await change(labelled(view, "Reasoning effort") as HTMLSelectElement, "high");
    expect(settings.get(assistantPrefs.reasoningEffort)).toBe("high");
    await change(labelled(view, "Reasoning effort") as HTMLSelectElement, "");
    expect(settings.get(assistantPrefs.reasoningEffort)).toBe("");
  });

  it("reads a saved value that doesn't fit as the default", async () => {
    const store = new MemoryHostSettingsStore();
    store.stored.set("assistant.top-p", 5);
    store.stored.set("assistant.reasoning-effort", "max");
    const bad = new HostSettings(store);
    await bad.load();
    expect(bad.get(assistantPrefs.topP)).toBeNull();
    expect(bad.get(assistantPrefs.reasoningEffort)).toBe("");
  });

  it("shows the values as text when served", async () => {
    const store = new MemoryHostSettingsStore();
    store.stored.set("assistant.provider", "anthropic");
    store.stored.set("assistant.temperature", 0.3);
    const settings = new HostSettings(store);
    await settings.load();
    const view = render(<AssistantView settings={settings} announce={vi.fn()} place="served" />);
    expect(view.textContent).toContain("Temperature0.3");
    expect(view.textContent).toContain("Top-pProvider default");
  });
});
