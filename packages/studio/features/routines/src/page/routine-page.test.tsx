// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type RoutinesHost, RoutinesHostService, type RoutineView } from "../api.ts";
import { routinesFeature } from "../feature.ts";
import { buttonNamed, listing, memoryHost, show, unmount } from "../test-support.tsx";
import { RoutinePage, RoutineScreen } from "./routine-page.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const daily: RoutineView = {
  hubId: "acme",
  id: "daily",
  name: "Daily",
  enabled: true,
  trigger: { kind: "schedule", cron: "30 7 * * 1-5" },
  triggerSentence: "Weekdays at 07:30",
  summary: "Weekdays at 07:30 → Briefing",
  target: { kind: "workflow", hubId: "acme", id: "briefing", input: "{}" },
  targetState: "ready",
  overlap: "skip",
  catchUp: "last",
  file: "hubs/acme/workflows/routines/daily.routine.yaml",
  everLive: true,
  changesNotLive: false,
  problems: [],
};

/** A host that reads `routine`, or rejects with `fail`, and tells its listeners about a change. */
function hostReading(routine: () => RoutineView, fail?: () => Error | undefined) {
  const { host, change } = memoryHost([], []);
  const reading = {
    ...host,
    read: async () => {
      const error = fail?.();
      if (error) throw error;
      return routine();
    },
  } as RoutinesHost;
  return { host: reading, change: () => change([]) };
}

const screenOf = (host: RoutinesHost, id = "daily") => (
  <RoutineScreen host={host} hubId="acme" id={id} />
);

verifies("routines.page.frame-and-states", () => {
  it("shows the avatar, the kind, the name and the summary", async () => {
    const page = await show(screenOf(hostReading(() => daily).host));

    expect(page.textContent).toContain("ROUTINE");
    expect(page.querySelector("h1")?.textContent).toBe("Daily");
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
    expect(page.querySelector("h1")?.textContent).toBe("Daily");
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
      <RoutineScreen host={host} hubId="acme" id="gone" goToRoutines={goToRoutines} />,
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
    expect(page.querySelector("h1")?.textContent).toBe("Daily");
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
