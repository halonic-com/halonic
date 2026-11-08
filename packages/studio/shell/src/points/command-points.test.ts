import { describe, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import type { Studio } from "../studio.ts";
import { MapTarget } from "../test-support/map-target.ts";

function feature(id: string, register: (studio: Studio) => void) {
  return defineFeature({ id, title: id, register });
}

describe("shell.commands", () => {
  it("lists commands by id and search providers by order, with their features", () => {
    const shell = createShell({
      features: [
        feature("agents", (studio) => {
          studio.commands.add({ id: "agents.new", title: "New agent", run: () => {} });
          studio.search.addProvider({
            id: "agents",
            title: "Agents",
            order: 20,
            search: async () => [],
          });
        }),
        feature("routines", (studio) => {
          studio.commands.add({
            id: "agents.edit-triggers",
            title: "Edit triggers",
            run: () => {},
          });
          studio.search.addProvider({
            id: "routines",
            title: "Routines",
            order: 10,
            search: async () => [],
          });
        }),
      ],
    });
    const { commands, search } = shell.contributions;
    expect(commands.list().map((command) => command.id)).toEqual([
      "agents.edit-triggers",
      "agents.new",
    ]);
    expect(commands.get("agents.new")?.featureId).toBe("agents");
    expect(search.providers().map((provider) => provider.id)).toEqual(["routines", "agents"]);
  });

  it("refuses two commands with the same id, naming both features", () => {
    const refresh = { id: "app.refresh", title: "Refresh", run: () => {} };
    const create = () =>
      createShell({
        features: [
          feature("agents", (studio) => studio.commands.add(refresh)),
          feature("runs", (studio) => studio.commands.add(refresh)),
        ],
      });
    expect(create).toThrow(ShellError);
    expect(create).toThrow('commands.add: "app.refresh" is added by both "agents" and "runs"');
  });

  it("hands the saved state back to activate when the workspace opens again", () => {
    const shell = createShell({
      features: [
        feature("agents", (studio) =>
          studio.persist({
            activate: (saved) => {
              const open = saved === undefined ? [] : (saved as { open: string[] }).open;
              return { save: () => ({ open: [...open, "reviewer"] }) };
            },
          }),
        ),
      ],
    });
    const [entry] = shell.contributions.persist.list();
    expect(entry?.featureId).toBe("agents");
    const context = shell.services.contextFor("agents", new MapTarget());
    const firstVisit = entry?.activate(undefined, context).save();
    expect(firstVisit).toEqual({ open: ["reviewer"] });
    expect(entry?.activate(firstVisit, context).save()).toEqual({ open: ["reviewer", "reviewer"] });
  });

  it("refuses a persist hook made from a class", () => {
    class Hook {
      activate() {
        return { save: () => null };
      }
    }
    const create = () =>
      createShell({ features: [feature("agents", (studio) => studio.persist(new Hook()))] });
    expect(create).toThrow(
      'persist: the feature "agents" gives something that isn\'t a plain object.',
    );
  });

  it("refuses persist twice from one feature", () => {
    const hook = { activate: () => ({ save: () => null }) };
    const create = () =>
      createShell({
        features: [
          feature("agents", (studio) => {
            studio.persist(hook);
            studio.persist(hook);
          }),
        ],
      });
    expect(create).toThrow('The feature "agents" calls persist twice.');
  });
});
