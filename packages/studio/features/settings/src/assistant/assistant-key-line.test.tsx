// @vitest-environment jsdom
import { HostSettings } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { AssistantNavigation, AssistantWorkspace, AssistantWorkspaceFacts } from "../api.ts";
import { click } from "../test-support/controls.ts";
import { MemoryHostSettingsStore } from "../test-support/memory-host-settings-store.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { assistantPrefs } from "./assistant-prefs.ts";
import { AssistantView } from "./assistant-section.tsx";

afterEach(unmountAll);

const acme: AssistantWorkspaceFacts = {
  name: "Acme",
  localOnly: false,
  sessionModel: null,
  usesSecret: () => true,
};

/** The links of the workspace made last: each test makes one workspace and shows it. */
let lastNavigate: AssistantNavigation | undefined;

function fakeWorkspace(initial: AssistantWorkspaceFacts | null, stored: boolean | Error = true) {
  let facts = initial;
  const listeners = new Set<() => void>();
  const calls: string[] = [];
  const workspace: AssistantWorkspace = {
    current: () => facts,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    keyStored: async () => {
      if (stored instanceof Error) throw stored;
      return stored;
    },
  };
  const navigate: AssistantNavigation = {
    openProviderPage: (name) => calls.push(`provider ${name}`),
    addProvider: (type, name) => calls.push(`add ${type} ${name}`),
    openSessionAi: () => calls.push("session-ai"),
  };
  lastNavigate = navigate;
  const change = async (next: AssistantWorkspaceFacts | null) => {
    facts = next;
    await act(async () => {
      for (const listener of listeners) listener();
    });
  };
  return { workspace, navigate, calls, change };
}

async function setup(
  workspace: AssistantWorkspace | undefined,
  place: "app" | "served" = "app",
  provider = "anthropic",
) {
  const settings = new HostSettings(new MemoryHostSettingsStore());
  await settings.load();
  await settings.set(assistantPrefs.provider, provider as never);
  if (provider === "anthropic") await settings.set(assistantPrefs.secretName, "anthropic-api-key");
  const closeSettings = vi.fn();
  const view = render(
    <AssistantView
      settings={settings}
      announce={vi.fn()}
      place={place}
      workspace={workspace}
      navigate={lastNavigate}
      closeSettings={closeSettings}
    />,
  );
  await act(async () => {});
  return { settings, closeSettings, view };
}

const buttonNamed = (view: HTMLElement, name: string) => {
  const found = [...view.querySelectorAll("button")].find((b) => b.textContent === name);
  if (found === undefined) throw new Error(`No button ${name}`);
  return found;
};
const keyLine = (view: HTMLElement) => view.textContent ?? "";

verifies("settings.ai-agent-key-line", () => {
  it("says a stored key is set and links to the provider page after closing Settings", async () => {
    const { workspace, calls } = fakeWorkspace(acme, true);
    const { view, closeSettings } = await setup(workspace);
    expect(keyLine(view)).toContain("● Key set · Replace it on the provider page ›");
    await click(buttonNamed(view, "Replace it on the provider page ›"));
    expect(closeSettings).toHaveBeenCalled();
    expect(calls).toEqual(["provider anthropic-api-key"]);
  });

  it("offers the provider page when a provider uses the name and no key is stored", async () => {
    const { workspace } = fakeWorkspace(acme, false);
    const { view } = await setup(workspace);
    expect(keyLine(view)).toContain("○ No key · Add it on the provider page ›");
  });

  it("starts Add provider filled in when no provider uses the name", async () => {
    const { workspace, calls } = fakeWorkspace({ ...acme, usesSecret: () => false }, false);
    const { view } = await setup(workspace);
    expect(keyLine(view)).toContain(
      "○ No key. Add a provider that uses anthropic-api-key to Acme ›",
    );
    expect(view.querySelector("code")?.textContent).toBe("anthropic-api-key");
    await click(buttonNamed(view, "Add a provider that uses anthropic-api-key to Acme ›"));
    expect(calls).toEqual(["add anthropic anthropic-api-key"]);
  });

  it("hides the dots from screen readers and shows no link while the navigation has none", async () => {
    const { workspace } = fakeWorkspace({ ...acme, usesSecret: () => false }, false);
    lastNavigate = { openSessionAi: () => {} };
    const { view } = await setup(workspace);
    expect(keyLine(view)).toContain(
      "○ No key. Add a provider that uses anthropic-api-key to Acme.",
    );
    expect(view.querySelector("p [aria-hidden=true]")?.textContent).toBe("○");
    expect(() =>
      buttonNamed(view, "Add a provider that uses anthropic-api-key to Acme ›"),
    ).toThrow();
    unmountAll();
    const stored = fakeWorkspace(acme, true);
    lastNavigate = { openSessionAi: () => {} };
    const { view: setView } = await setup(stored.workspace);
    expect(keyLine(setView)).toContain("● Key set");
    expect(keyLine(setView)).not.toContain("provider page");
  });

  it("asks to open a workspace with none open, or without a workspace service", async () => {
    const none = fakeWorkspace(null);
    expect(keyLine((await setup(none.workspace)).view)).toContain(
      "○ No key. Open a workspace to add it.",
    );
    unmountAll();
    expect(keyLine((await setup(undefined)).view)).toContain(
      "○ No key. Open a workspace to add it.",
    );
  });

  it("says no key is needed for a provider without a secret name, and shows no line when not set up", async () => {
    const { workspace } = fakeWorkspace(acme);
    expect(keyLine((await setup(workspace, "app", "ollama")).view)).toContain("No key needed.");
    unmountAll();
    expect(keyLine((await setup(workspace, "app", "not-set-up")).view)).not.toContain("Key");
  });

  it("says it couldn't check when the workspace can't answer", async () => {
    const { workspace } = fakeWorkspace(acme, new Error("no"));
    expect(keyLine((await setup(workspace)).view)).toContain("Couldn't check for a key.");
  });

  it("serves the key's place in words, with no link", async () => {
    const { workspace } = fakeWorkspace(acme, false);
    const { view } = await setup(workspace, "served");
    expect(keyLine(view)).toContain("No key on the computer running Halonic");
    expect(view.querySelector("button")).toBeNull();
  });

  it("warns while the workspace is local only and Local is off, and stops when Local goes on", async () => {
    const { workspace, change } = fakeWorkspace({ ...acme, localOnly: true });
    const { view } = await setup(workspace);
    const local = () => view.querySelectorAll<HTMLInputElement>('[role="switch"]')[0];
    expect(keyLine(view)).toContain("Acme is local only, so it can't use this cloud model.");
    await click(local() as HTMLInputElement);
    expect(keyLine(view)).not.toContain("is local only");
    await click(local() as HTMLInputElement);
    expect(keyLine(view)).toContain("is local only");
    await change({ ...acme, localOnly: false });
    expect(keyLine(view)).not.toContain("is local only");
  });

  it("does not warn about a cloud model while no provider is set up", async () => {
    const { workspace } = fakeWorkspace({ ...acme, localOnly: true });
    const { view } = await setup(workspace, "app", "not-set-up");
    expect(keyLine(view)).not.toContain("is local only");
  });

  it("says the workspace sets its own model, with a link to Session AI", async () => {
    const { workspace, calls } = fakeWorkspace({ ...acme, sessionModel: "smart" });
    const { view, closeSettings } = await setup(workspace);
    expect(keyLine(view)).toContain("Acme sets its own assistant model (smart).");
    await click(buttonNamed(view, "Workspace settings ›"));
    expect(closeSettings).toHaveBeenCalled();
    expect(calls).toEqual(["session-ai"]);
  });

  it("says it without a link when served", async () => {
    const { workspace } = fakeWorkspace({ ...acme, sessionModel: "smart" });
    const { view } = await setup(workspace, "served");
    expect(keyLine(view)).toContain("Acme sets its own assistant model (smart).");
    expect(keyLine(view)).not.toContain("Workspace settings");
  });
});
