import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import type { Studio } from "../studio.ts";
import { loadView } from "../view.ts";
import { type PlaceContribution, placeNames, type SidebarPlace, showPlace } from "./frame.ts";

const load = async () => ({ View: () => "view" });

function place(id: SidebarPlace): PlaceContribution {
  return { id, view: "View", load };
}

function feature(id: string, register: (studio: Studio) => void) {
  return defineFeature({ id, title: id, register });
}

verifies("shell.sidebar-places", () => {
  it("lists the places in the sidebar's fixed order, whatever order features register in", () => {
    const shell = createShell({
      features: [
        feature("runs", (studio) => studio.places.add(place("runs"))),
        feature("inbox", (studio) => studio.places.add(place("inbox"))),
        feature("agents", (studio) => studio.places.add(place("agents"))),
      ],
    });
    const places = shell.contributions.places.list();
    expect(places.map((entry) => placeNames[entry.id].label)).toEqual([
      "Home",
      "Inbox",
      "Agents",
      "Runs",
    ]);
    expect(places.map((entry) => entry.featureId)).toEqual(["shell", "inbox", "agents", "runs"]);
  });

  it("lists only Home, added by the shell, when no feature adds a place", async () => {
    const shell = createShell({ features: [] });
    const places = shell.contributions.places.list();
    expect(places.map((entry) => placeNames[entry.id].label)).toEqual(["Home"]);
    expect(places[0]?.featureId).toBe("shell");
    expect(await loadView(places[0] as PlaceContribution)).toBeTypeOf("function");
  });

  it("refuses Home from a feature, because the shell adds it", () => {
    const create = () =>
      createShell({ features: [feature("start", (studio) => studio.places.add(place("home")))] });
    expect(create).toThrow(ShellError);
    expect(create).toThrow(
      'places.add: the feature "start" adds the place "home", which the shell adds itself. Add a card to Home with home.addCard instead.',
    );
  });

  it("names every place from the shell's table, with its icon", () => {
    expect(Object.keys(placeNames)).toEqual([
      "home",
      "inbox",
      "agents",
      "workflows",
      "routines",
      "library",
      "runs",
      "changes",
    ]);
    expect(Object.values(placeNames).map((name) => name.label)).toEqual([
      "Home",
      "Inbox",
      "Agents",
      "Workflows",
      "Routines",
      "Library",
      "Runs",
      "Changes",
    ]);
    expect(showPlace("agents", undefined)).toEqual({
      id: "agents",
      label: "Agents",
      icon: "agents",
      signal: undefined,
      spokenName: "Agents",
    });
  });

  it("shows a signal above zero after the place's name", () => {
    const waiting = { mark: "count", value: 2, spoken: "2 waiting" } as const;
    const shown = showPlace("inbox", waiting);
    expect(shown.signal).toEqual(waiting);
    expect(shown.spokenName).toBe("Inbox, 2 waiting");
  });

  it("shows nothing and adds nothing to the name for a signal of 0", () => {
    const none = showPlace("inbox", { mark: "count", value: 0, spoken: "0 waiting" });
    expect(none.signal).toBeUndefined();
    expect(none.spokenName).toBe("Inbox");
    const idle = showPlace("runs", { mark: "running", value: 0, spoken: "0 running" });
    expect(idle.signal).toBeUndefined();
    expect(idle.spokenName).toBe("Runs");
  });

  it("keeps a place's signal for the sidebar to read", () => {
    const shell = createShell({
      features: [
        feature("inbox", (studio) =>
          studio.places.add({
            ...place("inbox"),
            signal: () => ({ mark: "count", value: 2, spoken: "2 waiting" }),
          }),
        ),
      ],
    });
    const [, inbox] = shell.contributions.places.list();
    expect(inbox?.signal?.({} as never)).toEqual({ mark: "count", value: 2, spoken: "2 waiting" });
  });

  it("refuses a place that isn't one of the sidebar's", () => {
    const create = () =>
      createShell({
        features: [
          feature("dashboards", (studio) =>
            studio.places.add({ ...place("home"), id: "dashboards" as SidebarPlace }),
          ),
        ],
      });
    expect(create).toThrow(ShellError);
    expect(create).toThrow(/"dashboards" adds the place "dashboards".*home, inbox, agents/);
  });

  it("refuses the same place from two features", () => {
    const create = () =>
      createShell({
        features: [
          feature("agents", (studio) => studio.places.add(place("agents"))),
          feature("crew", (studio) => studio.places.add(place("agents"))),
        ],
      });
    expect(create).toThrow(ShellError);
    expect(create).toThrow(
      'places.add: the place "agents" is added by both "agents" and "crew". Each place belongs to one feature',
    );
    expect(create).not.toThrow(/rename/);
  });
});
