// @vitest-environment jsdom

import { engineWords, limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { type RoutineListing, RoutinesHostService } from "../api.ts";
import { routinesFeature } from "../feature.ts";
import { buttonNamed, listing, memoryHost, show, typeInto, unmount } from "../test-support.tsx";
import { RoutinesPage, RoutinesView } from "./routines-page.tsx";

afterEach(unmount);

const hubs = [
  { id: "acme", name: "acme" },
  { id: "beta", name: "beta" },
];

const tomorrow = new Date(Date.now() + 36 * 3_600_000).toISOString();

const routines: readonly RoutineListing[] = [
  listing("acme", "weekly", "Weekly report", {
    enabled: false,
    summary: "Mondays at 09:00 → Report",
  }),
  listing("acme", "daily", "Daily", { nextRun: tomorrow }),
];

const rowOf = (page: HTMLElement, text: string) =>
  [...page.querySelectorAll('[role="gridcell"]')].find((each) =>
    each.textContent?.includes(text),
  ) as HTMLElement;

verifies("routines.list.rows-and-states", () => {
  it("lists each hub's routines by name with the one-line summary, and says an empty hub is empty", async () => {
    const page = await show(<RoutinesView host={memoryHost(hubs, routines).host} />);
    const text = page.textContent ?? "";

    expect(page.querySelector("h1")?.textContent).toBe("Routines");
    expect(text).toContain(
      "A routine starts a workflow or an agent on its own: on a schedule or every so often. " +
        "Routines start on time only while halonic routines watch is running in a terminal.",
    );
    expect(text.indexOf("Daily")).toBeLessThan(text.indexOf("Weekly report"));
    expect(text).toContain("Daily at 07:30 → Daily");
    expect(text).toContain("DDaily");
    expect(text).toContain("No routines in beta yet.");
  });

  it("shows the next time for a routine that is on, and the chip Off, without a time, for one that is off", async () => {
    const page = await show(<RoutinesView host={memoryHost(hubs, routines).host} />);

    expect(rowOf(page, "Daily at 07:30").textContent).toMatch(
      /next (today|tomorrow|[A-Z][a-z]{2}) /,
    );
    expect(rowOf(page, "Weekly report").textContent).toContain("Off");
    expect(rowOf(page, "Weekly report").textContent).not.toContain("next ");
  });

  it("shows one chip: Off, else Paused until trusted, else Needs sign-in again, else Needs you", async () => {
    const rows = [
      listing("acme", "a", "A", { enabled: false, needsSignIn: true, pausedUntilTrusted: true }),
      listing("acme", "b", "B", { needsSignIn: true, needsYou: 2, pausedUntilTrusted: true }),
      listing("acme", "c", "C", { needsSignIn: true, needsYou: 2 }),
      listing("acme", "d", "D", { needsYou: 2 }),
      listing("acme", "e", "E"),
    ];
    const page = await show(<RoutinesView host={memoryHost(hubs, rows).host} />);
    const chips = (name: string) => rowOf(page, `${name}Daily`).textContent;

    expect(chips("A")).toContain("Off");
    expect(chips("A")).not.toContain("Needs sign-in");
    expect(chips("B")).toContain("Paused until trusted");
    expect(chips("B")).not.toContain("Needs");
    expect(chips("C")).toContain("Needs sign-in again");
    expect(chips("C")).not.toContain("Needs you");
    expect(chips("D")).toContain("Needs you");
    expect(chips("E")).not.toMatch(/Off|Needs|Paused/);
  });

  it("shows Can't start, says why to screen readers and shows no time when what a routine starts isn't there", async () => {
    const rows = [
      listing("acme", "morning", "Morning replies", {
        summary: "Daily at 08:00 → support-reply",
        targetName: "support-reply",
        targetFound: false,
        nextRun: tomorrow,
      }),
      listing("acme", "weekend", "Weekend", { enabled: false, targetFound: false, needsYou: 2 }),
      listing("acme", "untrusted", "Untrusted", { targetFound: false, pausedUntilTrusted: true }),
    ];
    const page = await show(<RoutinesView host={memoryHost(hubs, rows).host} />);
    const row = rowOf(page, "Morning replies");
    const chip = [...row.querySelectorAll("span")].find((span) =>
      span.className.includes("text-danger"),
    );

    expect(chip?.querySelector(".sr-only")?.textContent).toBe(
      ": support-reply isn't in this workspace",
    );
    expect(row.textContent).toContain("Can't start: support-reply isn't in this workspace");
    expect(row.textContent).not.toContain("next ");
    expect(rowOf(page, "Weekend").textContent).toContain("Can't start");
    expect(rowOf(page, "Weekend").textContent).not.toMatch(/Off|Needs you/);
    expect(rowOf(page, "Untrusted").textContent).toContain("Can't start");
    expect(rowOf(page, "Untrusted").textContent).not.toContain("Paused until trusted");
  });

  it("shows only the empty state when there are no routines", async () => {
    const page = await show(<RoutinesView host={memoryHost(hubs, []).host} />);

    expect(page.textContent).toContain("No routines yet");
    expect(page.textContent).toContain(
      "A routine starts a workflow or an agent on its own, for example every weekday at 8.",
    );
    expect(page.querySelector('input[type="search"]')).toBeNull();
  });

  it("says nothing matches a search, and Clear search brings the rows back", async () => {
    const page = await show(<RoutinesView host={memoryHost(hubs, routines).host} />);
    const field = page.querySelector<HTMLInputElement>('input[type="search"]');
    if (field === null) throw new Error("no search field");

    await typeInto(field, "zzz");
    expect(page.textContent).toContain('No routines match "zzz".');

    await act(async () => buttonNamed(page, "Clear search")?.click());
    expect(page.textContent).toContain("Weekly report");
  });

  it("says Loading routines while it reads", async () => {
    const { host } = memoryHost(hubs, routines);
    const page = await show(
      <RoutinesView host={{ ...host, list: () => new Promise(() => undefined) }} />,
    );

    expect(
      page.querySelector('[aria-label="Loading routines"], [aria-busy="true"]'),
    ).not.toBeNull();
    expect(page.textContent).not.toContain("Weekly report");
  });

  it("says why it couldn't load, and Try again reads again", async () => {
    const { host } = memoryHost(hubs, routines);
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("The disk can't be read"))
      .mockResolvedValue(routines);
    const page = await show(<RoutinesView host={{ ...host, list }} />);

    expect(page.textContent).toContain("Couldn't load routines");
    expect(page.textContent).toContain("The engine isn't answering. It may still be starting.");
    expect(page.textContent).not.toContain("The disk can't be read");

    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(page.textContent).toContain("Weekly report");
    expect(document.activeElement).toBe(page.querySelector("h1"));
  });

  it("words the failure for the phone's host", async () => {
    const { host } = memoryHost(hubs, routines);
    const page = await show(
      <RoutinesView
        host={{ ...host, list: () => Promise.reject(new Error("x")) }}
        engine={engineWords.phone}
      />,
    );

    expect(page.textContent).toContain("Halonic on your computer isn't answering.");
  });

  it("keeps the rows and adds a line with Try again when a refresh fails", async () => {
    const { host, change } = memoryHost(hubs, routines);
    let failing = false;
    const list = () => (failing ? Promise.reject(new Error("x")) : host.list());
    const page = await show(<RoutinesView host={{ ...host, list }} />);

    failing = true;
    await act(async () => change(routines));

    expect(page.textContent).toContain("Weekly report");
    expect(page.textContent).not.toContain("Couldn't load routines");
    expect(page.textContent).toContain("The engine isn't answering. Showing what it said last.");

    failing = false;
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(page.textContent).not.toContain("Showing what it said last");
  });

  it("reads again when the host says the routines changed", async () => {
    const { host, change } = memoryHost(hubs, routines);
    const page = await show(<RoutinesView host={host} />);

    await act(async () => change([...routines, listing("beta", "new", "Fresh one")]));

    expect(page.textContent).toContain("Fresh one");
  });

  it("keeps the newest read when an older read settles after it", async () => {
    const reads: ((rows: readonly RoutineListing[]) => void)[] = [];
    let changed = () => {};
    const host = {
      ...memoryHost(hubs, []).host,
      list: () => new Promise<readonly RoutineListing[]>((resolve) => reads.push(resolve)),
      subscribe: (listener: () => void) => {
        changed = listener;
        return () => {};
      },
    };
    const page = await show(<RoutinesView host={host} />);
    await act(async () => changed());

    await act(async () => reads[1]?.(routines));
    await act(async () => reads[0]?.([]));

    expect(page.textContent).toContain("Weekly report");
    expect(page.textContent).not.toContain("No routines yet");
  });

  it("opens a Ctrl-clicked row in a new tab, else in this one", async () => {
    const open = vi.fn();
    const openInNewTab = vi.fn();
    const page = await show(
      <RoutinesView
        host={memoryHost(hubs, routines).host}
        open={open}
        openInNewTab={openInNewTab}
      />,
    );

    await act(async () =>
      rowOf(page, "Daily at 07:30").dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true }),
      ),
    );

    expect(openInNewTab).toHaveBeenCalledWith(expect.objectContaining({ id: "daily" }));
    expect(open).not.toHaveBeenCalled();
  });

  it("opens a routine as an item of the routine kind from the place", async () => {
    const openItem = vi.fn();
    const { host } = memoryHost(hubs, routines);
    const context = {
      openItem,
      services: limitedLookup(routinesFeature, {
        get: (key: unknown) => (key === RoutinesHostService ? host : undefined),
      }),
    };
    const page = await show(<RoutinesPage context={context as never} />);

    await act(async () => rowOf(page, "Daily at 07:30").click());

    expect(openItem).toHaveBeenCalledWith({ kind: "routine", hub: "acme", id: "daily" });
  });
});
