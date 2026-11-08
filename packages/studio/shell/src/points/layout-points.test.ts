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

const agentKind = { kind: "agent", label: "Agent", icon: "agent", open: { view: "View", load } };

verifies("shell.layout-points", () => {
  it("lists contributions by order, then id, with the feature that added them", () => {
    const group = (id: string, order: number) => ({ id, order, title: id, items: () => [] });
    const shell = createShell({
      features: [
        feature("runs", (studio) => {
          studio.explorer.addGroup(group("runs", 20));
          studio.explorer.addGroup(group("pinned", 10));
        }),
        feature("agents", (studio) => studio.explorer.addGroup(group("agents", 10))),
      ],
    });
    const groups = shell.contributions.explorer.groups();
    expect(groups.map((entry) => entry.id)).toEqual(["agents", "pinned", "runs"]);
    expect(groups.map((entry) => entry.featureId)).toEqual(["agents", "runs", "runs"]);
    expect(Object.isFrozen(groups[0])).toBe(true);
  });

  it("keeps item kinds, explorer groups and sections apart", () => {
    const shell = createShell({
      features: [
        feature("agents", (studio) => {
          studio.itemKinds.add(agentKind);
          studio.explorer.addGroup({ id: "agents", order: 20, title: "Agents", items: () => [] });
          studio.explorer.addSection({ id: "hubs", order: 5, title: "Hubs", view: "View", load });
        }),
      ],
    });
    const { contributions } = shell;
    expect(contributions.itemKinds.get("agent")?.featureId).toBe("agents");
    expect(contributions.itemKinds.get("workflow")).toBeUndefined();
    expect(contributions.itemKinds.list()).toHaveLength(1);
    expect(contributions.explorer.groups().map((group) => group.id)).toEqual(["agents"]);
    expect(contributions.explorer.sections().map((section) => section.id)).toEqual(["hubs"]);
  });

  it("refuses two features adding the same item kind", () => {
    const create = () =>
      createShell({
        features: [
          feature("agents", (studio) => studio.itemKinds.add(agentKind)),
          feature("agents-copy", (studio) => studio.itemKinds.add(agentKind)),
        ],
      });
    expect(create).toThrow('itemKinds.add: "agent" is added by both "agents" and "agents-copy"');
  });

  it("refuses a duplicate id, naming both features", () => {
    const group = { id: "agents", order: 1, title: "Agents", items: () => [] };
    const create = () =>
      createShell({
        features: [
          feature("agents", (studio) => studio.explorer.addGroup(group)),
          feature("runs", (studio) => studio.explorer.addGroup(group)),
        ],
      });
    expect(create).toThrow(ShellError);
    expect(create).toThrow('explorer.addGroup: "agents" is added by both "agents" and "runs"');
  });

  it("refuses an explorer section with a group's id", () => {
    const create = () =>
      createShell({
        features: [
          feature("agents", (studio) => {
            studio.explorer.addGroup({ id: "agents", order: 1, title: "Agents", items: () => [] });
            studio.explorer.addSection({
              id: "agents",
              order: 2,
              title: "Agents",
              view: "View",
              load,
            });
          }),
        ],
      });
    expect(create).toThrow("Group and section ids share the sidebar");
  });

  it("scopes item page section ids to their kind", () => {
    const workflowKind = { ...agentKind, kind: "workflow", label: "Workflow" };
    const shell = createShell({
      features: [
        feature("agents", (studio) => studio.itemKinds.add(agentKind)),
        feature("workflows", (studio) => studio.itemKinds.add(workflowKind)),
        feature("routines", (studio) => {
          studio.itemPage.addSection({
            on: "agent",
            id: "triggers",
            order: 30,
            view: "View",
            load,
          });
          studio.itemPage.addSection({
            on: "workflow",
            id: "triggers",
            order: 30,
            view: "View",
            load,
          });
        }),
      ],
    });
    expect(shell.contributions.itemPage.sectionsFor("agent")).toHaveLength(1);
    expect(shell.contributions.itemPage.sectionsFor("workflow")).toHaveLength(1);
  });

  it("refuses an item page section on a kind no feature adds", () => {
    const create = () =>
      createShell({
        features: [
          feature("routines", (studio) =>
            studio.itemPage.addSection({
              on: "robot",
              id: "triggers",
              order: 1,
              view: "View",
              load,
            }),
          ),
        ],
      });
    expect(create).toThrow('no feature adds the item kind "robot"');
  });

  it("refuses a contribution made from a class, which a copy would strip of its methods", () => {
    class AgentsGroup {
      readonly id = "agents";
      readonly order = 10;
      readonly title = "Agents";
      items(): never[] {
        return [];
      }
    }
    const create = () =>
      createShell({
        features: [feature("agents", (studio) => studio.explorer.addGroup(new AgentsGroup()))],
      });
    expect(create).toThrow(ShellError);
    expect(create).toThrow(
      'explorer.addGroup: the feature "agents" gives something that isn\'t a plain object.',
    );
  });

  it("refuses ids and kinds that aren't valid names, so keys can't collide", () => {
    const section = (on: string, id: string) => ({ on, id, order: 1, view: "View", load });
    const create = (register: (studio: Studio) => void) => () =>
      createShell({
        features: [
          feature("agents", (studio) => studio.itemKinds.add(agentKind)),
          feature("routines", register),
        ],
      });
    expect(create((studio) => studio.itemPage.addSection(section("agent", "b/c")))).toThrow(
      'itemPage.addSection: the feature "routines" gives id "b/c".',
    );
    expect(create((studio) => studio.itemPage.addSection(section("a/b", "c")))).toThrow(
      'gives on "a/b"',
    );
    expect(
      create((studio) =>
        studio.explorer.addGroup({ id: "", order: 1, title: "", items: () => [] }),
      ),
    ).toThrow('explorer.addGroup: the feature "routines" gives id "".');
    expect(create((studio) => studio.itemKinds.add({ ...agentKind, kind: "2d" }))).toThrow(
      'gives kind "2d"',
    );
  });

  it("refuses contributions after register returned", () => {
    let kept: Studio | undefined;
    createShell({ features: [feature("late", (studio) => (kept = studio))] });
    expect(() =>
      kept?.explorer.addGroup({ id: "x", order: 1, title: "X", items: () => [] }),
    ).toThrow('The feature "late" called explorer.addGroup after register returned.');
  });
});
