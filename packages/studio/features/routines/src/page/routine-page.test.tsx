// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  EngineNotAnswering,
  type RoutinesHost,
  RoutinesHostService,
  type RoutineView,
  type RunNowRefusal,
  type RunNowResult,
} from "../api.ts";
import { routinesFeature } from "../feature.ts";
import {
  buttonNamed,
  installFakePopover,
  listing,
  memoryHost,
  openDialogsInJsdom,
  show,
  typeInto,
  unmount,
} from "../test-support.tsx";
import {
  daily,
  hostReading,
  runNowButton,
  screenOf,
  settle,
  showWithToasts,
} from "./page.test-helper.tsx";
import { RoutinePage, RoutineScreen } from "./routine-page.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const nameField = (page: HTMLElement) =>
  page.querySelector<HTMLInputElement>('input[aria-label="Routine name"]') as HTMLInputElement;

verifies("routines.page.frame-and-states", () => {
  it("shows the avatar, the kind, the name and the summary", async () => {
    const page = await show(screenOf(hostReading(() => daily).host));

    expect(page.textContent).toContain("ROUTINE");
    expect(nameField(page).value).toBe("Daily");
    expect(page.textContent).toContain("Weekdays at 07:30 → Briefing");
    expect(page.textContent).not.toContain("Changes not live yet");
    expect(page.textContent).not.toContain("doesn't run");
  });

  it("mutes the summary and starts it with Off when the routine is off", async () => {
    const page = await show(screenOf(hostReading(() => ({ ...daily, enabled: false })).host));

    const summary = [...page.querySelectorAll("p")].find((each) =>
      each.textContent?.includes("Briefing"),
    );
    expect(summary?.textContent).toBe("Off · Weekdays at 07:30 → Briefing");
    expect(summary?.className).toContain("text-fg-muted");
  });

  it("says changes that aren't live yet", async () => {
    const page = await show(screenOf(hostReading(() => ({ ...daily, changesNotLive: true })).host));
    expect(page.textContent).toContain("Changes not live yet");
  });

  it("gives a routine that is on but never live the notice alone", async () => {
    const never = { ...daily, everLive: false, changesNotLive: true };
    const page = await show(screenOf(hostReading(() => never).host));

    expect(page.textContent).toContain("This routine isn't live yet, so it doesn't run.");
    expect(page.textContent).not.toContain("Changes not live yet");
  });

  it("gives an off routine that was never live no notice", async () => {
    const never = { ...daily, enabled: false, everLive: false };
    const page = await show(screenOf(hostReading(() => never).host));
    expect(page.textContent).not.toContain("doesn't run");
  });

  it("doesn't repeat the name on a phone, where the top bar has it", async () => {
    const page = await show(
      <PresentationProvider presentation="phone">
        {screenOf(hostReading(() => daily).host)}
      </PresentationProvider>,
    );
    expect(page.textContent).toContain("ROUTINE");
    expect(page.querySelector("h1")?.className).toContain("sr-only");
    expect(page.querySelector("header")?.className).toContain("flex-col");
  });

  it("shows a skeleton only after 300 ms, and Still loading after 10 s", async () => {
    const { host } = memoryHost([], []);
    const slow = { ...host, read: () => new Promise<RoutineView>(() => {}) } as RoutinesHost;
    const page = await show(screenOf(slow));
    expect(page.querySelector("[role=status]")).toBeNull();

    await act(async () => vi.advanceTimersByTime(300));
    expect(page.querySelector("[role=status]")?.textContent).toContain("Loading daily");
    expect(page.textContent).not.toContain("Still loading");

    await act(async () => vi.advanceTimersByTime(10_000));
    expect(page.textContent).toContain("Still loading");
    expect(buttonNamed(page, "Try again")).toBeDefined();
  });

  it("says why it couldn't load, and Try again reads again and focuses the name", async () => {
    let failing = true;
    const { host } = hostReading(
      () => daily,
      () =>
        failing
          ? new KindedError("unavailable", "The engine isn't answering. It may still be starting.")
          : undefined,
    );
    const page = await show(screenOf(host));
    expect(page.textContent).toContain("Couldn't load this routine");
    expect(page.textContent).toContain("The engine isn't answering. It may still be starting.");

    failing = false;
    document.body.append(page);
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(nameField(page).value).toBe("Daily");
    expect(page.textContent).not.toContain("Couldn't load");
    expect(document.activeElement).toBe(page.querySelector("h1"));
  });

  it("says a routine that isn't there any more is gone, with Go to Routines", async () => {
    const goToRoutines = vi.fn();
    const { host } = hostReading(
      () => daily,
      () => new KindedError("not_found", "No such routine."),
    );
    const page = await show(
      <RoutineScreen
        host={host}
        hubId="acme"
        id="gone"
        announce={() => {}}
        goToRoutines={goToRoutines}
      />,
    );

    expect(page.textContent).toContain("This routine isn't in this workspace any more.");
    await act(async () => buttonNamed(page, "Go to Routines")?.click());
    expect(goToRoutines).toHaveBeenCalledOnce();
  });

  it("reads again when the host says the routine changed, without a skeleton", async () => {
    let routine = daily;
    const { host, change } = hostReading(() => routine);
    const page = await show(screenOf(host));

    routine = { ...daily, enabled: false };
    await act(async () => change());

    expect(page.textContent).toContain("Off · Weekdays at 07:30 → Briefing");
    expect(page.querySelector("[role=status]")).toBeNull();
  });

  it("opens from an item of the routine kind", async () => {
    const { host } = hostReading(() => daily);
    const context = {
      services: limitedLookup(routinesFeature, {
        get: (key: unknown) => (key === RoutinesHostService ? host : undefined),
      }),
    };
    const page = await show(
      <RoutinePage
        item={{ kind: "routine", hub: "acme", id: "daily" }}
        context={context as never}
        Sections={() => null}
      />,
    );
    expect(nameField(page).value).toBe("Daily");
  });

  it("offers a routine to Ctrl K by name, with its hub and summary", async () => {
    const { host } = memoryHost(
      [{ id: "acme", name: "Acme" }],
      [listing("acme", "daily", "Daily", { summary: "Weekdays at 07:30 → Briefing" })],
    );
    const providers: Array<{
      search: (q: string, c: unknown) => Promise<unknown>;
    }> = [];
    routinesFeature.register({
      places: { add: () => {} },
      commands: { add: () => {} },
      itemKinds: { add: () => {} },
      itemPage: { addSection: () => {} },
      search: { addProvider: (provider: never) => providers.push(provider) },
    } as never);
    const context = {
      services: { get: (key: unknown) => (key === RoutinesHostService ? host : undefined) },
    };

    const found = await providers[0]?.search("DAI", context);

    expect(found).toEqual([
      {
        item: { kind: "routine", hub: "acme", id: "daily" },
        label: "Daily",
        detail: "Routine · Acme",
        description: "Weekdays at 07:30 → Briefing",
      },
    ]);
    expect(await providers[0]?.search("  ", context)).toEqual([]);
  });
});

/** A host whose routine is "Daily" until it is trashed, then not found, as the real host does. */
function hostWithTrash() {
  let trashed = false;
  const { host, change } = hostReading(
    () => daily,
    () => (trashed ? new KindedError("not_found", "No such routine.") : undefined),
  );
  const save = vi.fn(async () => {});
  const withTrash = {
    ...host,
    save,
    trash: async () => {
      trashed = true;
      change();
      return {
        undo: async () => {
          trashed = false;
          change();
        },
      };
    },
  } as RoutinesHost;
  return { host: withTrash, save };
}

verifies("routines.page.rename-and-delete", () => {
  let restorePopover: () => void;
  beforeEach(() => {
    restorePopover = installFakePopover();
  });
  afterEach(() => restorePopover());

  it("saves a new name on Enter, and only the name", async () => {
    const { host, save } = hostWithTrash();
    const { page } = await showWithToasts(host);

    await typeInto(nameField(page), "Morning");
    await act(async () =>
      nameField(page).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );

    expect(save).toHaveBeenCalledExactlyOnceWith(
      { hubId: "acme", id: "daily" },
      { name: "Morning" },
    );
  });

  it("puts the old name back on Esc and saves nothing", async () => {
    const { host, save } = hostWithTrash();
    const { page } = await showWithToasts(host);

    await typeInto(nameField(page), "Morning");
    await act(async () =>
      nameField(page).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );

    expect(nameField(page).value).toBe("Daily");
    expect(save).not.toHaveBeenCalled();
  });

  it("says why the name couldn't be saved", async () => {
    const { host, save } = hostWithTrash();
    save.mockRejectedValue(new KindedError("conflict", "The file changed on disk."));
    const { page, toasts } = await showWithToasts(host);

    await typeInto(nameField(page), "Morning");
    await act(async () =>
      nameField(page).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    await settle();

    expect(toasts.list()[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't rename Daily.",
      text: "The file changed on disk.",
    });
  });

  it("renames from a sheet in ⋮ on a phone, where the header has no name field", async () => {
    openDialogsInJsdom();
    const { host, save } = hostWithTrash();
    const page = await show(
      <PresentationProvider presentation="phone">
        <RoutineScreen host={host} hubId="acme" id="daily" announce={() => {}} />
      </PresentationProvider>,
    );
    expect(page.querySelector('input[aria-label="Routine name"]')).toBeNull();
    act(() =>
      page.querySelector<HTMLElement>('button[aria-label="More actions for Daily"]')?.click(),
    );
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (each) => each.textContent === "Rename",
    );
    await act(async () => item?.click());
    const sheet = document.querySelector("dialog[open]");
    const input = sheet?.querySelector<HTMLInputElement>("input") as HTMLInputElement;
    expect(sheet?.textContent).toContain("Rename routine");
    expect(input.value).toBe("Daily");
    await typeInto(input, "   ");
    await act(async () => buttonNamed(sheet as HTMLElement, "Rename")?.click());
    expect(sheet?.textContent).toContain("Give it a name.");
    expect(save).not.toHaveBeenCalled();
    await typeInto(input, "Morning");
    await act(async () => buttonNamed(sheet as HTMLElement, "Rename")?.click());
    expect(save).toHaveBeenCalledExactlyOnceWith(
      { hubId: "acme", id: "daily" },
      { name: "Morning" },
    );
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("deletes from ⋮ with no dialog, then shows the routine gone, and Undo brings it back", async () => {
    const { host } = hostWithTrash();
    const { page, toasts } = await showWithToasts(host);

    act(() =>
      page.querySelector<HTMLElement>('button[aria-label="More actions for Daily"]')?.click(),
    );
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (each) => each.textContent === "Delete",
    );
    await act(async () => item?.click());
    await settle();

    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(toasts.list()[0]).toMatchObject({
      title: "Moved Daily to the trash.",
      text: "It won't start Briefing any more. Runs it already started keep going.",
      action: { label: "Undo" },
    });
    expect(page.textContent).toContain("This routine isn't in this workspace any more.");
    expect(document.activeElement?.textContent).toContain("isn't in this workspace any more");

    await act(async () => toasts.list()[0]?.action?.onClick());
    await settle();

    expect(nameField(page).value).toBe("Daily");
    expect(document.activeElement?.tagName).toBe("H1");
  });
});

/** A host that reads "Daily" and answers Run now with `answer`, or rejects with it when it is an error. */
function hostRunning(answer: RunNowResult | Error, view: RoutineView = daily) {
  const { host } = hostReading(() => view);
  const runNow = vi.fn(async () => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { host: { ...host, runNow } as RoutinesHost, runNow };
}

verifies("routines.page.run-now", () => {
  it("shows no Run now while the host has no engine", async () => {
    const page = await show(screenOf(hostReading(() => daily).host));

    expect(runNowButton(page)).toBeUndefined();
  });

  it("starts the run, also while the routine is off, and offers Open run", async () => {
    const opened: string[] = [];
    const { host, runNow } = hostRunning(
      { started: true, runId: "run_1", shortId: "abc123" },
      { ...daily, enabled: false },
    );
    const { page, toasts } = await showWithToasts(host, (runId) => opened.push(runId));

    await act(async () => runNowButton(page)?.click());

    expect(runNow).toHaveBeenCalledWith(expect.objectContaining({ hubId: "acme", id: "daily" }));
    expect(toasts.list()[0]).toMatchObject({
      title: "Run started · Daily · Run abc123",
      action: { label: "Open run" },
    });
    toasts.list()[0]?.action?.onClick();
    expect(opened).toEqual(["run_1"]);
  });

  it("starts one run for two presses while the host is still starting the first", async () => {
    const { host } = hostRunning({ started: true, runId: "run_1", shortId: "abc123" });
    let answer: (result: RunNowResult) => void = () => {};
    const runNow = vi.fn(() => new Promise<RunNowResult>((resolve) => (answer = resolve)));
    const { page } = await showWithToasts({ ...host, runNow } as RoutinesHost);

    await act(async () => runNowButton(page)?.click());
    await act(async () => runNowButton(page)?.click());
    expect(runNow).toHaveBeenCalledTimes(1);
    expect(runNowButton(page)?.getAttribute("aria-busy")).toBe("true");

    await act(async () => answer({ started: true, runId: "run_1", shortId: "abc123" }));
    await act(async () => runNowButton(page)?.click());
    expect(runNow).toHaveBeenCalledTimes(2);
  });

  it("says the one reason a refusal gives, and the toast stays", async () => {
    const refusals: [RunNowRefusal, string][] = [
      [{ reason: "target-never-live" }, "Not started: Briefing isn't live yet."],
      [{ reason: "target-in-trash" }, "Not started: Briefing is in the trash."],
      [{ reason: "target-not-found" }, "Not started: Briefing isn't in this hub any more."],
      [{ reason: "not-trusted" }, "Not started: Daily isn't trusted yet."],
      [
        { reason: "signed-out", account: "fin@acme.example" },
        "Not started: fin@acme.example is signed out.",
      ],
    ];
    for (const [refusal, title] of refusals) {
      const { host } = hostRunning({ started: false, refusal });
      const { page, toasts } = await showWithToasts(host);

      await act(async () => runNowButton(page)?.click());

      expect(toasts.list()[0]).toMatchObject({ title, sticky: true });
      unmount();
    }
  });

  it("says when the engine isn't answering", async () => {
    const { host } = hostRunning(new EngineNotAnswering());
    const { page, toasts } = await showWithToasts(host);

    await act(async () => runNowButton(page)?.click());

    expect(toasts.list()[0]).toMatchObject({
      title: "Couldn't start Daily.",
      text: "The engine isn't answering.",
      sticky: true,
    });
  });
});
