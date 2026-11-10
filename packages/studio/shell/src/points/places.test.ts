import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import type { Studio } from "../studio.ts";
import type { PlaceContribution, SidebarPlace } from "./frame.ts";

const load = async () => ({ View: () => "view" });

function place(id: SidebarPlace, label: string): PlaceContribution {
  return { id, label, icon: id, view: "View", load };
}

function feature(id: string, register: (studio: Studio) => void) {
  return defineFeature({ id, title: id, register });
}

verifies("shell.sidebar-places", () => {
  it("lists the places in the sidebar's fixed order, whatever order features register in", () => {
    const shell = createShell({
      features: [
        feature("runs", (studio) => studio.places.add(place("runs", "Runs"))),
        feature("inbox", (studio) => studio.places.add(place("inbox", "Inbox"))),
        feature("agents", (studio) => studio.places.add(place("agents", "Agents"))),
      ],
    });
    const places = shell.contributions.places.list();
    expect(places.map((entry) => entry.label)).toEqual(["Inbox", "Agents", "Runs"]);
    expect(places.map((entry) => entry.featureId)).toEqual(["inbox", "agents", "runs"]);
  });

  it("lists nothing for places no feature added", () => {
    const shell = createShell({ features: [] });
    expect(shell.contributions.places.list()).toEqual([]);
  });

  it("keeps a place's signal for the sidebar to read", () => {
    const shell = createShell({
      features: [
        feature("inbox", (studio) =>
          studio.places.add({
            ...place("inbox", "Inbox"),
            signal: () => ({ mark: "count", value: 2, spoken: "2 waiting" }),
          }),
        ),
      ],
    });
    const [inbox] = shell.contributions.places.list();
    expect(inbox?.signal?.({} as never)).toEqual({ mark: "count", value: 2, spoken: "2 waiting" });
  });

  it("refuses a place that isn't one of the sidebar's", () => {
    const create = () =>
      createShell({
        features: [
          feature("dashboards", (studio) =>
            studio.places.add({ ...place("home", "Dashboards"), id: "dashboards" as SidebarPlace }),
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
          feature("agents", (studio) => studio.places.add(place("agents", "Agents"))),
          feature("crew", (studio) => studio.places.add(place("agents", "Crew"))),
        ],
      });
    expect(create).toThrow(ShellError);
    expect(create).toThrow(/agents.*crew|crew.*agents/);
  });
});
