// @vitest-environment jsdom
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { type UnfencedYesHost, UnfencedYesService } from "../api.ts";
import { click } from "../test-support/controls.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentSandboxSection } from "./agent-sandbox-section.tsx";
import { UnfencedYesBlock } from "./unfenced-yes.tsx";

afterEach(unmountAll);

type Status = Awaited<ReturnType<UnfencedYesHost["status"]>>;

const where = "Give it from a plugin's page in Plugins: open the plugin, then Review.";

function hostWith(...statuses: Status[]): UnfencedYesHost {
  const status = vi.fn<UnfencedYesHost["status"]>();
  for (const each of statuses) status.mockResolvedValueOnce(each);
  return { status, takeBack: vi.fn(async () => {}) };
}

async function show(host: UnfencedYesHost, onOpenPlugins?: () => void) {
  const view = render(
    <UnfencedYesBlock host={host} onOpenPlugins={onOpenPlugins} announce={vi.fn()} />,
  );
  await act(async () => {});
  return view;
}

function button(view: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...view.querySelectorAll("button")].find((each) => each.textContent?.includes(label));
}

/** Agent sandbox as the settings container draws it, with only the yes and the Settings links. */
async function section(sections: SettingsSectionProps["context"]["settingsSections"]) {
  const openSettings = vi.fn();
  const services = new Map<unknown, unknown>([
    [UnfencedYesService, hostWith({ run: "needs-yes", reason: "container" })],
  ]);
  const context = {
    services: {
      find: (key: unknown) => services.get(key),
      get: (key: unknown) => services.get(key),
    },
    announcer: { announce: () => {} },
    settingsSections: sections,
    openSettings,
  } as unknown as SettingsSectionProps["context"];
  const view = render(
    <AgentSandboxSection context={context} place="app" surface="window" closeSettings={() => {}} />,
  );
  await act(async () => {});
  return { view, openSettings };
}

verifies("settings.unfenced-yes-where", () => {
  it("names where the yes is given, with Open Plugins, while a yes is needed", async () => {
    const open = vi.fn();
    const view = await show(hostWith({ run: "needs-yes", reason: "container" }), open);

    expect(view.textContent).toContain(where);
    await click(button(view, "Open Plugins") as HTMLButtonElement);
    expect(open).toHaveBeenCalledOnce();
  });

  it("names the place without a button when there's no Plugins to open", async () => {
    const view = await show(hostWith({ run: "needs-yes", reason: "windows" }));

    expect(view.textContent).toContain(where);
    expect(button(view, "Open Plugins")).toBeUndefined();
  });

  it("says neither while a yes is saved or the host can't say", async () => {
    const saved = await show(
      hostWith({ run: "allowed", reason: "container", allowedAt: "2026-11-21T10:00:00" }),
      vi.fn(),
    );
    expect(saved.textContent).not.toContain(where);
    expect(button(saved, "Open Plugins")).toBeUndefined();

    const unread = await show(
      { status: vi.fn(async () => Promise.reject(new Error("no host"))), takeBack: vi.fn() },
      vi.fn(),
    );
    expect(unread.textContent).not.toContain(where);
  });

  it("names the place once Take back has taken the yes back", async () => {
    const host = hostWith(
      { run: "allowed", reason: "container", allowedAt: "2026-11-21T10:00:00" },
      { run: "needs-yes", reason: "container" },
    );
    const view = await show(host, vi.fn());

    await click(button(view, "Take back") as HTMLButtonElement);
    await act(async () => {});

    expect(view.textContent).toContain(where);
    expect(button(view, "Take back")).toBeUndefined();
    expect(button(view, "Open Plugins")).toBeDefined();
  });

  it("opens Settings on Plugins from Agent sandbox, and has no link without that section", async () => {
    const withPlugins = await section([{ id: "plugins", title: "Plugins" }]);
    await click(button(withPlugins.view, "Open Plugins") as HTMLButtonElement);
    expect(withPlugins.openSettings).toHaveBeenCalledWith("plugins");

    const without = await section([{ id: "appearance", title: "Appearance" }]);
    expect(without.view.textContent).toContain(where);
    expect(button(without.view, "Open Plugins")).toBeUndefined();
  });
});
