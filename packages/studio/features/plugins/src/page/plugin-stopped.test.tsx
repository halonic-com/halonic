// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { noActions, noSettings, weather } from "../test-support/plugins.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { PluginUnfencedRuns } from "../trust/unfenced-status.ts";
import { PluginPage } from "./plugin-page.tsx";
import type { InstalledPlugin } from "./plugin-pages.ts";
import type { PluginRunStates } from "./stopped-status.tsx";

let removePopover = () => {};
beforeEach(() => {
  fakeModal();
  removePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restoreModal();
  removePopover();
});

const stoppedLine =
  "Halonic stopped Weather: the sandbox didn't work when it started, so none of it ran.";
const offLine =
  "Weather is off on this computer until you allow plugins and integrations to run without the sandbox.";

/** The host's run states: the stop the test sets, which Check again forgets. */
function runStatesOf(stopped: boolean) {
  let state = { stopped };
  return {
    runState: vi.fn(async () => state),
    checkAgain: vi.fn(async () => {
      state = { stopped: false };
      return state;
    }),
  } satisfies PluginRunStates;
}

async function show(
  plugin: InstalledPlugin,
  runStates: PluginRunStates,
  options: {
    place?: "app" | "served";
    unfencedRuns?: PluginUnfencedRuns;
    toasts?: ReturnType<typeof createToastStore>;
  } = {},
) {
  const view = render(
    <ToastStoreProvider store={options.toasts ?? createToastStore()}>
      <PluginPage
        plugin={plugin}
        {...noSettings()}
        actions={{
          ...noActions().actions,
          runStates,
          ...(options.unfencedRuns === undefined ? {} : { unfencedRuns: options.unfencedRuns }),
        }}
        onOpenPanel={() => {}}
        place={options.place ?? "app"}
      />
    </ToastStoreProvider>,
  );
  await act(async () => {});
  return view;
}

function button(view: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...view.ownerDocument.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
}

verifies("plugins.plugin-page-stopped", () => {
  it("says the host stopped a trusted plugin because the sandbox failed, in a danger Callout with Check again", async () => {
    const runStates = runStatesOf(true);
    const view = await show(weather("on"), runStates);

    expect(runStates.runState).toHaveBeenCalledWith("weather");
    expect(view.textContent).toContain(stoppedLine);
    expect(view.textContent).toContain(
      "Halonic tries Weather in the sandbox again the next time a run uses it, and never runs it without the sandbox.",
    );
    expect(view.textContent).not.toContain("Trusted on");
    expect(view.querySelector(".bg-danger-soft")).not.toBeNull();
    expect(button(view, "Check again")).toBeDefined();
  });

  it("shows R15 before R13 when the host says both", async () => {
    const unfencedRuns = {
      status: async () => ({ run: "needs-yes", reason: "windows" }) as const,
      allow: async () => null,
    };
    const view = await show(weather("on"), runStatesOf(true), { unfencedRuns });

    expect(view.textContent).toContain(stoppedLine);
    expect(view.textContent).not.toContain(offLine);
  });

  it("asks the host to forget the stop on Check again, then shows the status box, moves focus to it and says the next run tries the sandbox", async () => {
    const runStates = runStatesOf(true);
    const toasts = createToastStore();
    const view = await show(weather("on"), runStates, { toasts });

    await act(async () => button(view, "Check again")?.click());
    await act(async () => {});

    expect(runStates.checkAgain).toHaveBeenCalledWith("weather");
    expect(view.textContent).not.toContain(stoppedLine);
    const focused = document.activeElement;
    expect(focused?.getAttribute("tabindex")).toBe("-1");
    expect(focused?.textContent).not.toContain(stoppedLine);
    // Nothing was tried yet, so the page doesn't leave "Trusted on …" to say the sandbox works.
    expect(toasts.list().map(({ tone, title }) => ({ tone, title }))).toEqual([
      {
        tone: "info",
        title: "Halonic tries Weather in the sandbox again the next time a run uses it.",
      },
    ]);
  });

  it("keeps R15 and says why in a toast when Check again fails", async () => {
    const runStates = {
      runState: async () => ({ stopped: true }),
      checkAgain: vi.fn(async () => {
        throw new Error("the agent host isn't answering");
      }),
    };
    const toasts = createToastStore();
    const view = render(
      <ToastStoreProvider store={toasts}>
        <PluginPage
          plugin={weather("on")}
          {...noSettings()}
          actions={{ ...noActions().actions, runStates }}
          onOpenPanel={() => {}}
        />
      </ToastStoreProvider>,
    );
    await act(async () => {});

    await act(async () => button(view, "Check again")?.click());
    await act(async () => {});

    expect(view.textContent).toContain(stoppedLine);
    // A plain Error has no words of its own for the page, so the toast gives the general reason.
    expect(toasts.list().map((toast) => toast.title)).toEqual([
      "Couldn't check again: Halonic ran into a problem it can't explain yet.",
    ]);
  });

  it("keeps the status box when the host didn't stop it or can't say", async () => {
    const running = await show(weather("on"), runStatesOf(false));
    expect(running.textContent).not.toContain(stoppedLine);
    unmountAll();

    const silent = await show(weather("on"), {
      runState: () => Promise.reject(new Error("no host")),
      checkAgain: async () => ({ stopped: false }),
    });
    expect(silent.textContent).not.toContain(stoppedLine);
  });

  it("doesn't ask the host for a plugin that isn't trusted yet", async () => {
    const runStates = runStatesOf(true);
    const view = await show(weather("not-trusted"), runStates);

    expect(runStates.runState).not.toHaveBeenCalled();
    expect(view.textContent).not.toContain(stoppedLine);
  });

  it.each(["not-trusted", "changed"] as const)(
    "drops R15 when a stopped plugin becomes %s on the open page",
    async (status) => {
      const runStates = runStatesOf(true);
      let setPlugin: (plugin: InstalledPlugin) => void = () => {};
      function Page() {
        const [plugin, set] = useState(weather("on"));
        setPlugin = set;
        return (
          <PluginPage
            plugin={plugin}
            {...noSettings()}
            actions={{ ...noActions().actions, runStates }}
            onOpenPanel={() => {}}
          />
        );
      }
      const view = render(
        <ToastStoreProvider store={createToastStore()}>
          <Page />
        </ToastStoreProvider>,
      );
      await act(async () => {});
      expect(view.textContent).toContain(stoppedLine);

      await act(async () => setPlugin(weather(status)));

      expect(view.textContent).not.toContain(stoppedLine);
    },
  );

  it("drops a late answer for a plugin that lost its trust while the host answered", async () => {
    let answer: (state: { stopped: boolean }) => void = () => {};
    const runStates = {
      runState: () => new Promise<{ stopped: boolean }>((resolve) => (answer = resolve)),
      checkAgain: async () => ({ stopped: false }),
    };
    let setPlugin: (plugin: InstalledPlugin) => void = () => {};
    function Page() {
      const [plugin, set] = useState(weather("on"));
      setPlugin = set;
      return (
        <PluginPage
          plugin={plugin}
          {...noSettings()}
          actions={{ ...noActions().actions, runStates }}
          onOpenPanel={() => {}}
        />
      );
    }
    const view = render(
      <ToastStoreProvider store={createToastStore()}>
        <Page />
      </ToastStoreProvider>,
    );

    await act(async () => setPlugin(weather("not-trusted")));
    await act(async () => answer({ stopped: true }));

    expect(view.textContent).not.toContain(stoppedLine);
  });

  it("has no Check again where the page is view only", async () => {
    const view = await show(weather("on"), runStatesOf(true), { place: "served" });

    expect(view.textContent).toContain(stoppedLine);
    expect(button(view, "Check again")).toBeUndefined();
  });
});
