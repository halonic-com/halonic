import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import type { Studio } from "../studio.ts";

const load = async () => ({ View: () => "view" });

function feature(id: string, register: (studio: Studio) => void) {
  return defineFeature({ id, title: id, register });
}

verifies("shell.frame-points", () => {
  it("lists bar items by order, then id, with the feature that added them", () => {
    const shell = createShell({
      features: [
        feature("runs", (studio) => {
          studio.statusBar.add({ id: "spend", order: 20, view: "View", load });
          studio.statusBar.add({ id: "target", order: 10, view: "View", load });
        }),
        feature("inbox", (studio) =>
          studio.statusBar.add({ id: "errors", order: 10, view: "View", load }),
        ),
      ],
    });
    const items = shell.contributions.statusBar.list();
    expect(items.map((item) => item.id)).toEqual(["errors", "target", "spend"]);
    expect(items.map((item) => item.featureId)).toEqual(["inbox", "runs", "runs"]);
  });

  it("keeps every frame point separate", () => {
    const shell = createShell({
      features: [
        feature("agents", (studio) => {
          studio.panelWindows.add({ id: "chat", title: "Chat", order: 2, view: "View", load });
          studio.panelWindows.add({ id: "log", title: "Log", order: 1, view: "View", load });
          studio.titleBar.add({ id: "hub-picker", order: 1, view: "View", load });
          studio.phoneBar.add({
            id: "agents",
            order: 1,
            label: "Agents",
            icon: "agent",
            view: "View",
            load,
            badge: () => 3,
          });
          studio.settings.add({ id: "models", title: "Models", order: 1, view: "View", load });
        }),
      ],
    });
    const { contributions } = shell;
    expect(contributions.panelWindows.list().map((panel) => panel.id)).toEqual(["log", "chat"]);
    expect(contributions.titleBar.list().map((item) => item.id)).toEqual(["hub-picker"]);
    expect(contributions.statusBar.list()).toEqual([]);
    expect(contributions.phoneBar.list()[0]?.label).toBe("Agents");
    expect(contributions.settings.list().map((section) => section.id)).toEqual(["models"]);
  });

  it("scopes card ids to their selection", () => {
    const shell = createShell({
      features: [
        feature("agents", (studio) =>
          studio.cards.add({ id: "summary", for: "agent", order: 1, view: "View", load }),
        ),
        feature("runs", (studio) =>
          studio.cards.add({ id: "summary", for: "run", order: 1, view: "View", load }),
        ),
      ],
    });
    const agentCards = shell.contributions.cards.for("agent");
    expect(agentCards.map((card) => card.featureId)).toEqual(["agents"]);
    expect(shell.contributions.cards.for("step")).toEqual([]);
  });

  it("refuses card ids and selections that aren't valid names", () => {
    const card = (id: string, selection: string) => ({
      id,
      for: selection,
      order: 1,
      view: "View",
      load,
    });
    const create = (id: string, selection: string) => () =>
      createShell({
        features: [feature("agents", (studio) => studio.cards.add(card(id, selection)))],
      });
    expect(create("b/c", "agent")).toThrow('cards.add: the feature "agents" gives id "b/c".');
    expect(create("c", "agent/b")).toThrow('gives for "agent/b"');
  });

  it("refuses a duplicate id, naming both features", () => {
    const section = { id: "models", title: "Models", order: 1, view: "View", load };
    const create = () =>
      createShell({
        features: [
          feature("agents", (studio) => studio.settings.add(section)),
          feature("runs", (studio) => studio.settings.add(section)),
        ],
      });
    expect(create).toThrow(ShellError);
    expect(create).toThrow('settings.add: "models" is added by both "agents" and "runs"');
  });
});
