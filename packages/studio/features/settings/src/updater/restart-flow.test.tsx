// @vitest-environment jsdom
import {
  ClipboardProvider,
  createToastStore,
  OpenExternalProvider,
  type ToastStore,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RestartRunsService, type UpdaterHost, UpdaterService } from "../api.ts";
import { settingsFeature } from "../feature.ts";
import { click } from "../test-support/controls.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { createRestartFlow, RestartFlowService } from "./restart-flow.ts";
import { RestartHost } from "./restart-host.tsx";
import type { RestartRuns } from "./restart-runs.ts";
import { RestartStatusItem } from "./restart-status-item.tsx";
import { runsBody } from "./restart-text.ts";
import { UpdateButton } from "./update-button.tsx";
import { updateCommands } from "./update-commands.ts";
import type { UpdateState, UpdateStatus } from "./updater-status.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const notesUrl = "https://example.test/notes";
const ready: UpdateState = { kind: "ready", version: "0.1.1", notesUrl };
/** The shell's link for a Preview build: its own repository (HAL-20424). */
const previewNotesUrl =
  "https://github.com/halonic-com/halonic-preview/releases/tag/v0.1.1-preview.425";

function statusOf(state: UpdateState, rest: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    current: "0.1.0",
    automatic: true,
    checking: false,
    lastChecked: Date.now(),
    justUpdated: null,
    managed: null,
    state,
    ...rest,
  };
}

function fakeUpdater(first: UpdateStatus) {
  const listeners = new Set<(status: UpdateStatus) => void>();
  const host = {
    status: vi.fn(async () => first),
    subscribe: vi.fn((listener: (status: UpdateStatus) => void) => {
      listeners.add(listener);
      listener(first);
      return () => listeners.delete(listener);
    }),
    check: vi.fn(async () => first),
    download: vi.fn(async () => first),
    cancel: vi.fn(async () => first),
    restart: vi.fn(async () => undefined),
    setAutomatic: vi.fn(async () => first),
    setTrack: vi.fn(async () => first),
  } satisfies UpdaterHost;
  const set = (next: UpdateStatus) =>
    act(() => {
      for (const listener of listeners) listener(next);
    });
  return { host, set };
}

/** The feature's context for one page: the updater, the flow and the runs a restart would stop. */
function setup(
  first: UpdateStatus,
  runs: RestartRuns = { running: 0, waitingForYou: 0 },
  count: () => Promise<RestartRuns> = async () => runs,
) {
  const updater = fakeUpdater(first);
  const flow = createRestartFlow();
  const announce = vi.fn();
  const openSettings = vi.fn();
  const services = new Map<string, unknown>([
    [UpdaterService.name, updater.host],
    [RestartFlowService.name, flow],
    [RestartRunsService.name, { count }],
  ]);
  const context = {
    services: limitedLookup(settingsFeature, {
      get: (key) => services.get(key.name),
      find: (key) => services.get(key.name),
    }),
    announcer: { announce },
    openSettings,
    settingsSections: [{ id: "about", title: "About Halonic" }],
  } as unknown as WorkspaceContext;
  const toasts = createToastStore();
  const openExternal = vi.fn(async () => {});
  const writeClipboard = vi.fn(async (_text: string) => true);
  const frame = (child: ReactNode) => (
    <ToastStoreProvider store={toasts}>
      <ClipboardProvider writeClipboard={writeClipboard}>
        <OpenExternalProvider openExternal={openExternal}>{child}</OpenExternalProvider>
      </ClipboardProvider>
    </ToastStoreProvider>
  );
  return {
    ...updater,
    flow,
    announce,
    openSettings,
    context,
    toasts,
    openExternal,
    writeClipboard,
    frame,
  };
}

async function mount(first: UpdateStatus, runs?: RestartRuns, count?: () => Promise<RestartRuns>) {
  const page = setup(first, runs, count);
  const view = render(
    page.frame(
      <>
        <RestartStatusItem context={page.context} />
        <RestartHost context={page.context} />
      </>,
    ),
  );
  await act(async () => {});
  return { ...page, view };
}

const settle = () => act(async () => {});
/** A press on Restart to update, which the Update dialog, About Halonic and Ctrl K all make. */
const press = (flow: { request(): void }) => act(async () => flow.request());
const titles = (toasts: ToastStore) => toasts.list().map((toast) => toast.title);

verifies("settings.restart-flow", () => {
  it("shows no Restart to update in the status bar: with a ready update, only the title bar's Update", async () => {
    const { view, set, context, frame } = await mount(statusOf({ kind: "up-to-date" }));
    const titleBar = render(frame(<UpdateButton context={context} />));
    await settle();
    set(statusOf(ready));
    expect(view.querySelector("button")).toBeNull();
    expect(view.textContent).not.toContain("Restart to update");
    const buttons = [...document.querySelectorAll("button")];
    expect(buttons).toHaveLength(1);
    expect(titleBar.contains(buttons[0] as HTMLElement)).toBe(true);
    expect(buttons[0]?.textContent).toBe("UpdateUpdate available: Halonic 0.1.1");
  });

  it("shows nothing when another tool manages updates", async () => {
    const managed = { by: "scoop", command: "scoop update halonic" } as const;
    const { view } = await mount(statusOf(ready, { managed }));
    expect(view.querySelector("button")).toBeNull();
  });

  it("under Scoop, shows the command in place of Restart to update only while a newer version is out", async () => {
    const managed = { by: "scoop", command: "scoop update halonic" } as const;
    const available = { kind: "available", version: "0.1.1", notesUrl: ready.notesUrl } as const;
    const { view, set, announce, openSettings } = await mount(
      statusOf({ kind: "up-to-date" }, { managed }),
    );
    expect(view.querySelector("button")).toBeNull();
    set(statusOf(available, { managed }));
    const item = view.querySelector("button");
    expect(item?.textContent).toContain("Updates are managed by Scoop. Run scoop update halonic.");
    expect(item?.textContent).toContain("Update with Scoop");
    expect(item?.textContent).toContain(
      "Halonic 0.1.1 is out. Updates are managed by Scoop. Run scoop update halonic.",
    );
    expect(item?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(announce).toHaveBeenCalledWith(
      "Halonic 0.1.1 is out. Run scoop update halonic to update.",
      "polite",
    );
    await click(item as HTMLElement);
    expect(openSettings).toHaveBeenCalledWith("about");
    for (const quiet of [
      { kind: "never-checked" },
      { kind: "cant-check", reason: "offline" },
    ] as const) {
      set(statusOf(quiet, { managed }));
      expect(view.querySelector("button")).toBeNull();
    }
  });

  it("restarts at once when no run would stop", async () => {
    const { flow, host } = await mount(statusOf(ready));
    await press(flow);
    expect(host.restart).toHaveBeenCalledOnce();
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("asks first when runs would stop, with Cancel focused, and restarts only on the danger button", async () => {
    const { flow, host } = await mount(statusOf(ready), { running: 2, waitingForYou: 1 });
    await press(flow);
    const dialog = document.querySelector("dialog[open]") as HTMLElement;
    expect(dialog.textContent).toContain("Restart Halonic now?");
    expect(dialog.textContent).toContain(
      "2 runs are still running, including 1 that's waiting for you. Restarting stops them.",
    );
    expect(dialog.textContent).toContain("Or keep working: Halonic 0.1.1 installs when you quit.");
    expect(document.activeElement?.textContent).toBe("Cancel");
    expect(host.restart).not.toHaveBeenCalled();
    const confirm = [...dialog.querySelectorAll("button")].find((each) =>
      each.textContent?.startsWith("Restart and stop 2 runs"),
    );
    await click(confirm as HTMLElement);
    expect(host.restart).toHaveBeenCalledOnce();
  });

  it("repeats the whole request on Try again, so a failed count still asks about running runs", async () => {
    const count = vi
      .fn<() => Promise<RestartRuns>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue({ running: 2, waitingForYou: 0 });
    const { flow, host, toasts } = await mount(statusOf(ready), undefined, count);
    await press(flow);
    expect(titles(toasts)).toEqual(["Halonic's updater didn't answer."]);
    expect(host.restart).not.toHaveBeenCalled();
    const again = toasts.list()[0]?.action;
    expect(again?.label).toBe("Try again");
    await act(async () => again?.onClick());
    expect(count).toHaveBeenCalledTimes(2);
    expect(host.restart).not.toHaveBeenCalled();
    expect(document.querySelector("dialog[open]")?.textContent).toContain(
      "2 runs are still running",
    );
  });

  it("ignores a second press while the first is still counting runs", async () => {
    let release: (runs: RestartRuns) => void = () => {};
    const count = vi.fn(() => new Promise<RestartRuns>((resolve) => (release = resolve)));
    const { flow, host } = await mount(statusOf(ready), undefined, count);
    await press(flow);
    await press(flow);
    await act(async () => release({ running: 0, waitingForYou: 0 }));
    expect(count).toHaveBeenCalledOnce();
    expect(host.restart).toHaveBeenCalledOnce();
  });

  it("words one run and several waiting runs", () => {
    expect(runsBody({ running: 1, waitingForYou: 0 })).toBe(
      "1 run is still running. Restarting stops it. You can run it again afterwards.",
    );
    expect(runsBody({ running: 3, waitingForYou: 2 })).toContain("including 2 that are waiting");
  });

  it("offers Restart to update in Ctrl K only while an update is ready", async () => {
    const { context, flow, set } = await mount(statusOf({ kind: "up-to-date" }));
    const titlesNow = () => updateCommands(context).map((command) => command.title);
    expect(titlesNow()).toEqual(["About Halonic", "Check for Halonic updates"]);
    set(statusOf(ready));
    expect(flow.canRestart()).toBe(true);
    expect(titlesNow()).toEqual([
      "About Halonic",
      "Check for Halonic updates",
      "Restart to update Halonic",
    ]);
  });

  it("offers About Halonic in Ctrl K only where the window has the section", async () => {
    const { context } = await mount(statusOf({ kind: "up-to-date" }));
    const without = { ...context, settingsSections: [{ id: "appearance", title: "Appearance" }] };
    expect(updateCommands(without).map((command) => command.title)).toEqual([
      "Check for Halonic updates",
    ]);
    const { settingsSections: _, ...unsaid } = context;
    expect(updateCommands(unsaid).map((command) => command.title)).toEqual([
      "Check for Halonic updates",
    ]);
  });

  it("says that a download started and that it is ready, once each, never a percentage", async () => {
    const downloading: UpdateState = {
      kind: "downloading",
      version: "0.1.1",
      done: 1,
      total: 10,
      unit: "bytes",
    };
    const { announce, set } = await mount(
      statusOf({ kind: "available", version: "0.1.1", notesUrl }),
    );
    set(statusOf(downloading));
    set(statusOf({ ...downloading, done: 5 }));
    set(statusOf(ready));
    expect(announce.mock.calls.map(([line]) => line)).toEqual([
      "Downloading Halonic 0.1.1.",
      "Halonic 0.1.1 is ready to install. Restart to update.",
    ]);
  });

  it("shows the Updated to dialog once, with what's new, in place of a toast", async () => {
    localStorage.clear();
    const notes = "- The title bar has an Update button.";
    const justUpdated = { from: "0.1.0", to: "0.1.1", notesUrl, notCarriedOver: [], notes };
    const { toasts, set } = await mount(statusOf({ kind: "up-to-date" }, { justUpdated }));
    set(statusOf({ kind: "up-to-date" }, { justUpdated }));
    expect(titles(toasts)).toEqual([]);
    const shown = [...document.querySelectorAll("dialog[open]")];
    expect(shown).toHaveLength(1);
    expect(shown[0]?.textContent).toContain("Updated to Halonic 0.1.1");
    expect(shown[0]?.textContent).toContain("You were on Halonic 0.1.0.");
    expect(shown[0]?.textContent).toContain(notes);
    expect(shown[0]?.querySelector("a")?.getAttribute("href")).toBe(notesUrl);
    unmountAll();
    // A reload in the same run: the shell still says justUpdated, the page has seen it.
    await mount(statusOf({ kind: "up-to-date" }, { justUpdated }));
    expect(document.querySelectorAll("dialog[open]")).toHaveLength(0);
  });

  it("links the Updated to dialog of a Preview build to the page the shell names", async () => {
    localStorage.clear();
    const to = "0.1.1-preview.425";
    const justUpdated = { from: "0.1.0", to, notesUrl: previewNotesUrl, notCarriedOver: [] };
    await mount(statusOf({ kind: "up-to-date" }, { justUpdated }));
    const link = document.querySelector("dialog[open] a");
    expect(link?.getAttribute("href")).toBe(previewNotesUrl);
  });

  it("shows the didn't install toast with Try again, and the release page after a second failure", async () => {
    const first = await mount(
      statusOf({ kind: "did-not-install", version: "0.1.1", attempts: 1, notesUrl }),
    );
    await settle();
    const toast = first.toasts.list()[0];
    expect(toast?.tone).toBe("danger");
    expect(toast?.title).toBe("Halonic 0.1.1 didn't install. You're still on 0.1.0.");
    expect(toast?.action?.label).toBe("Try again");
    expect(toast?.secondAction?.label).toBe("Open release page");
    expect(toast?.sticky).toBe(true);
    toast?.action?.onClick();
    expect(first.host.download).toHaveBeenCalledOnce();

    first.set(statusOf({ kind: "did-not-install", version: "0.1.1", attempts: 2, notesUrl }));
    const second = first.toasts.list()[1];
    expect(second?.text).toBe("Download it from the release page.");
    expect(second?.action?.label).toBe("Try again");
    expect(second?.secondAction?.label).toBe("Open release page");
  });

  it("opens the release page the shell names for a Preview build that didn't install", async () => {
    const version = "0.1.1-preview.425";
    const page = await mount(
      statusOf({ kind: "did-not-install", version, attempts: 1, notesUrl: previewNotesUrl }),
    );
    page.toasts.list()[0]?.secondAction?.onClick();
    expect(page.openExternal).toHaveBeenCalledWith(previewNotesUrl);
  });

  it("says the updater didn't answer when the toast's Try again can't download", async () => {
    const page = await mount(
      statusOf({ kind: "did-not-install", version: "0.1.1", attempts: 1, notesUrl }),
    );
    page.host.download.mockRejectedValueOnce(new Error("down"));
    await act(async () => page.toasts.list()[0]?.action?.onClick());
    expect(titles(page.toasts).at(-1)).toBe("Halonic's updater didn't answer.");
  });
});

verifies("settings.not-carried-toast", () => {
  it("shows one sticky toast for settings an update couldn't carry over, with Copy details", async () => {
    const justUpdated = {
      from: "0.1.0",
      to: "0.1.1",
      notesUrl,
      notCarriedOver: ["appearance.panelOpacity", "formats.dateStyle"],
    };
    const { toasts } = await mount(statusOf({ kind: "up-to-date" }, { justUpdated }));
    await settle();
    const toast = toasts.list().find((t) => t.sticky);
    expect(toast?.tone).toBe("info");
    expect(toast?.title).toBe(
      "Some settings couldn't be carried over from Halonic 0.1.0, so they're back to their defaults.",
    );
    expect(toast?.text).toBe("Halonic kept a copy of the old ones.");
    expect(toast?.action?.label).toBe("Copy details");
    expect(toasts.list().filter((t) => t.sticky)).toHaveLength(1);
  });

  it("shows it once for an update, however often the status arrives", async () => {
    const justUpdated = {
      from: "0.1.0",
      to: "0.1.1",
      notesUrl,
      notCarriedOver: ["formats.dateStyle"],
    };
    const { toasts, set } = await mount(statusOf({ kind: "up-to-date" }, { justUpdated }));
    set(statusOf({ kind: "up-to-date" }, { justUpdated }));
    await settle();
    expect(toasts.list().filter((t) => t.sticky)).toHaveLength(1);
  });

  it("copies the names and where the old copy is, never values, and stays open", async () => {
    const justUpdated = {
      from: "0.1.0",
      to: "0.1.1",
      notesUrl,
      notCarriedOver: ["appearance.panelOpacity", "formats.dateStyle"],
    };
    const { toasts, writeClipboard } = await mount(
      statusOf({ kind: "up-to-date" }, { justUpdated }),
    );
    await settle();
    const toast = toasts.list().find((t) => t.sticky);
    expect(toast?.action?.keepOpen).toBe(true);
    toast?.action?.onClick();
    await settle();
    expect(writeClipboard).toHaveBeenCalledTimes(1);
    expect(writeClipboard.mock.calls[0]?.[0]).toBe(
      [
        "Settings not carried over, Halonic 0.1.0 to 0.1.1:",
        "appearance.panelOpacity",
        "formats.dateStyle",
        "The old files are next to the current ones in Halonic's data folder, with .0.1.0.bak added to their names.",
      ].join("\n"),
    );
    expect(toasts.list().some((t) => t.sticky)).toBe(true);
  });

  it("shows no settings toast when nothing was left behind", async () => {
    const justUpdated = { from: "0.1.0", to: "0.1.1", notesUrl, notCarriedOver: [] };
    const { toasts } = await mount(statusOf({ kind: "up-to-date" }, { justUpdated }));
    await settle();
    expect(toasts.list().some((t) => t.sticky)).toBe(false);
  });
});
