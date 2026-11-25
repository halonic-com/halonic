// @vitest-environment jsdom

import { HostSettings } from "@halonicjs/app";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import { FakeRemoteControl } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { type KeepAwakeHost, KeepAwakeService } from "../api.ts";
import { RemoteSection } from "../settings/remote-section.tsx";
import { remoteContext, settle } from "../test-support/context.ts";
import { MemoryHostSettingsStore } from "../test-support/memory-host-settings-store.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { keepAwakeSetting } from "./keep-awake.ts";
import { KeepAwakeFollower } from "./keep-awake-follower.tsx";

afterEach(unmountAll);

const TITLE = "Keep this computer awake while it's plugged in";
const FAILED = "Couldn't save the keep-awake setting. Try again.";

/** The shell's `keep_awake_set`, recording each call; `refuse` makes the next calls fail. */
class FakeKeepAwake implements KeepAwakeHost {
  readonly calls: { keep: boolean; remote: boolean }[] = [];
  refuse = false;

  async set(keep: boolean, remote: boolean): Promise<boolean> {
    this.calls.push({ keep, remote });
    if (this.refuse) throw new Error("failed");
    return keep && remote;
  }
}

async function scene(options: { readonly withShell?: boolean } = {}) {
  const store = new MemoryHostSettingsStore();
  const settings = new HostSettings(store);
  await settings.load();
  const remote = new FakeRemoteControl();
  const shell = new FakeKeepAwake();
  const announced: string[] = [];
  const context = remoteContext(remote, announced, {
    [HostSettingsService.name]: settings,
    ...(options.withShell === false ? {} : { [KeepAwakeService.name]: shell }),
  });
  return { store, settings, remote, shell, announced, context };
}

async function renderSection(context: ReturnType<typeof remoteContext>) {
  const view = render(
    <RemoteSection
      context={context}
      closeSettings={() => undefined}
      place="app"
      surface="window"
    />,
  );
  await settle();
  const keepSwitch = () => view.querySelector<HTMLInputElement>(`input[aria-label="${TITLE}"]`);
  const press = async () => {
    act(() => keepSwitch()?.click());
    await settle();
  };
  return { view, keepSwitch, press };
}

verifies("remote.keep-awake", () => {
  it("shows the row with its line, off on a fresh install", async () => {
    const { context, store } = await scene();
    const { view, keepSwitch } = await renderSection(context);

    expect(store.stored.size).toBe(0);
    expect(view.textContent).toContain(TITLE);
    expect(view.textContent).toContain("So your phone can reach it.");
    expect(keepSwitch()?.checked).toBe(false);
  });

  it("doesn't show the row where the shell has no keep_awake_set", async () => {
    const { context } = await scene({ withShell: false });
    const { view, keepSwitch } = await renderSection(context);

    expect(keepSwitch()).toBeNull();
    expect(view.textContent).not.toContain(TITLE);
  });

  it("tells the shell with remote's state, then saves the setting", async () => {
    const { context, remote, shell, store } = await scene();
    await remote.setRemote(true);
    const { keepSwitch, press } = await renderSection(context);

    await press();

    expect(shell.calls).toEqual([{ keep: true, remote: true }]);
    expect(store.stored.get("remote.keep-awake")).toBe(true);
    expect(keepSwitch()?.checked).toBe(true);
  });

  it("says and announces a refusal, and saves nothing", async () => {
    const { context, shell, store, announced } = await scene();
    shell.refuse = true;
    const { view, keepSwitch, press } = await renderSection(context);

    await press();

    expect(view.textContent).toContain(FAILED);
    expect(announced).toEqual([FAILED]);
    expect(keepSwitch()?.checked).toBe(false);
    expect(store.stored.has("remote.keep-awake")).toBe(false);
  });

  it("puts the shell back when the save fails", async () => {
    const { context, shell, store, announced } = await scene();
    store.failSaves = true;
    const { keepSwitch, press } = await renderSection(context);

    await press();

    expect(shell.calls).toEqual([
      { keep: true, remote: false },
      { keep: false, remote: false },
    ]);
    expect(keepSwitch()?.checked).toBe(false);
    expect(announced).toEqual([FAILED]);
  });

  it("follows remote while Settings is closed", async () => {
    const { context, remote, shell, settings } = await scene();
    await settings.set(keepAwakeSetting, true);
    render(<KeepAwakeFollower context={context} />);
    await settle();

    await remote.setRemote(true);
    await settle();
    await remote.setRemote(false);
    await settle();

    expect(shell.calls).toEqual([
      { keep: true, remote: false },
      { keep: true, remote: true },
      { keep: true, remote: false },
    ]);
  });
});
