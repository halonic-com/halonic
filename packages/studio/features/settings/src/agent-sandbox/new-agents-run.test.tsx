// @vitest-environment jsdom
import { HostSettings } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { change, click } from "../test-support/controls.ts";
import { MemoryHostSettingsStore } from "../test-support/memory-host-settings-store.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentSandboxHostView } from "./agent-sandbox-section.tsx";
import { sandboxPrefs } from "./sandbox-prefs.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

async function show(place: "app" | "served" = "app", saved?: string) {
  const store = new MemoryHostSettingsStore();
  if (saved !== undefined) store.stored.set("sandbox.new-agents", saved);
  const settings = new HostSettings(store);
  await settings.load();
  const view = render(
    <AgentSandboxHostView host={undefined} place={place} settings={settings} announce={() => {}} />,
  );
  await act(async () => {});
  const select = view.querySelector("select") as HTMLSelectElement;
  return { view, store, select, settings };
}

const button = (label: string) =>
  [...document.querySelectorAll("button")].find((each) => each.textContent?.startsWith(label));

verifies("settings.new-agents-run", () => {
  it("shows the first line and reads In a sandbox when nothing is saved", async () => {
    const { view, select } = await show();
    expect(view.textContent).toContain("Agents run in a sandbox unless you choose otherwise.");
    expect(view.textContent).toContain("New agents run");
    expect(view.textContent).toContain(
      "Each agent can be changed on its Harness page. This applies on this computer only.",
    );
    expect(select.selectedOptions[0]?.textContent).toBe("In a sandbox (recommended)");
  });

  it("reads a value it doesn't know as the sandbox", async () => {
    const { select } = await show("app", "elsewhere");
    expect(select.value).toBe("sandbox");
  });

  it("asks before On this computer, and saves nothing on Cancel", async () => {
    const { store, select } = await show();
    await change(select, "this-computer");
    expect(document.body.textContent).toContain("Run new agents on this computer?");
    expect(store.stored.has("sandbox.new-agents")).toBe(false);
    await click(button("Cancel") as HTMLElement);
    expect(document.body.textContent).not.toContain("Run new agents on this computer?");
    expect(select.value).toBe("sandbox");
    expect(store.stored.has("sandbox.new-agents")).toBe(false);
  });

  it("saves On this computer once confirmed", async () => {
    const { store, select, settings } = await show();
    await change(select, "this-computer");
    await click(button("Run new agents on this computer") as HTMLElement);
    expect(store.stored.get("sandbox.new-agents")).toBe("this-computer");
    expect(settings.get(sandboxPrefs.newAgents)).toBe("this-computer");
    expect(select.value).toBe("this-computer");
  });

  it("saves In a sandbox at once, and says when a save fails", async () => {
    const { view, store, select } = await show("app", "this-computer");
    store.failSaves = true;
    await change(select, "sandbox");
    expect(view.textContent).toContain("Couldn't save where new agents run on this computer.");
    expect(select.value).toBe("this-computer");
    store.failSaves = false;
    await change(select, "sandbox");
    expect(select.value).toBe("sandbox");
  });

  it("is view only in served Studio", async () => {
    const { view, select } = await show("served");
    expect(select.disabled).toBe(true);
    expect(view.textContent).toContain(
      "View only here. Change where agents run on the computer running Halonic.",
    );
  });
});
