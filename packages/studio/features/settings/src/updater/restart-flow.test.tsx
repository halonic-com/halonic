// @vitest-environment jsdom
import {
  createToastStore,
  OpenExternalProvider,
  type ToastStore,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RestartRunsService, type UpdaterHost, UpdaterService } from "../api.ts";
import { click } from "../test-support/controls.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { createRestartFlow, RestartFlowService } from "./restart-flow.ts";
import { RestartHost } from "./restart-host.tsx";
import type { RestartRuns } from "./restart-runs.ts";
import { RestartStatusItem } from "./restart-status-item.tsx";
import { runsBody } from "./restart-text.ts";
import { updateCommands } from "./update-commands.ts";
import type { UpdateState, UpdateStatus } from "./updater-status.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const notesUrl = "https://example.test/notes";
const ready: UpdateState = { kind: "ready", version: "0.1.1", notesUrl };

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
  const services = new Map<string, unknown>([
    [UpdaterService.name, updater.host],
    [RestartFlowService.name, flow],
    [RestartRunsService.name, { count }],
  ]);
  const context = {
    services: { find: (key: { name: string }) => services.get(key.name) },
    announcer: { announce },
  } as unknown as WorkspaceContext;
  const toasts = createToastStore();
  const openExternal = vi.fn(async () => {});
  const frame = (child: ReactNode) => (
    <ToastStoreProvider store={toasts}>
      <OpenExternalProvider openExternal={openExternal}>{child}</OpenExternalProvider>
    </ToastStoreProvider>
  );
  return { ...updater, flow, announce, context, toasts, openExternal, frame };
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
const titles = (toasts: ToastStore) => toasts.list().map((toast) => toast.title);

verifies("settings.restart-flow", () => {
  it("shows Restart to update only while an update is ready, with a name that says the version", async () => {
    const { view, set } = await mount(statusOf({ kind: "up-to-date" }));
    expect(view.querySelector("button")).toBeNull();
    set(statusOf(ready));
    const item = view.querySelector("button");
    expect(item?.textContent).toContain("Restart to update");
    expect(item?.textContent).toContain("Halonic 0.1.1 is ready. Restart to update");
    expect(item?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(view.querySelector("span.hidden")?.className).toContain("wide:contents");
  });

  it("shows nothing when another tool manages updates", async () => {
    const managed = { by: "scoop", command: "scoop update halonic" } as const;
    const { view } = await mount(statusOf(ready, { managed }));
    expect(view.querySelector("button")).toBeNull();
  });

  it("restarts at once when no run would stop", async () => {
    const { view, host } = await mount(statusOf(ready));
    await click(view.querySelector("button") as HTMLElement);
    expect(host.restart).toHaveBeenCalledOnce();
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("asks first when runs would stop, with Cancel focused, and restarts only on the danger button", async () => {
    const { view, host } = await mount(statusOf(ready), { running: 2, waitingForYou: 1 });
    await click(view.querySelector("button") as HTMLElement);
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
    const { view, host, toasts } = await mount(statusOf(ready), undefined, count);
    await click(view.querySelector("button") as HTMLElement);
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

  it("shows the Updated to toast once, with What's new", async () => {
    const justUpdated = { from: "0.1.0", to: "0.1.1", notCarriedOver: [] };
    const { toasts, set, openExternal } = await mount(
      statusOf({ kind: "up-to-date" }, { justUpdated }),
    );
    set(statusOf({ kind: "up-to-date" }, { justUpdated }));
    expect(titles(toasts)).toEqual(["Updated to Halonic 0.1.1"]);
    toasts.list()[0]?.action?.onClick();
    expect(openExternal).toHaveBeenCalledWith(
      "https://github.com/halonic-com/halonic/releases/tag/v0.1.1",
    );
  });

  it("shows the didn't install toast with Try again, and the release page after a second failure", async () => {
    const first = await mount(statusOf({ kind: "did-not-install", version: "0.1.1", attempts: 1 }));
    await settle();
    const toast = first.toasts.list()[0];
    expect(toast?.tone).toBe("danger");
    expect(toast?.title).toBe("Halonic 0.1.1 didn't install. You're still on 0.1.0.");
    expect(toast?.action?.label).toBe("Try again");
    toast?.action?.onClick();
    expect(first.host.download).toHaveBeenCalledOnce();

    first.set(statusOf({ kind: "did-not-install", version: "0.1.1", attempts: 2 }));
    const second = first.toasts.list()[1];
    expect(second?.text).toBe("Download it from the release page.");
    expect(second?.action?.label).toBe("Open release page");
  });
});
