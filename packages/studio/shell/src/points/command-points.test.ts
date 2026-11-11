import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import type { Studio } from "../studio.ts";
import { MapTarget } from "../test-support/map-target.ts";

function feature(id: string, register: (studio: Studio) => void) {
  return defineFeature({ id, title: id, register });
}

verifies("shell.commands", () => {
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

verifies("shell.command-sources", () => {
  const forecast = {
    id: "plugins.commands.weather.forecast",
    title: "Show forecast",
    run: () => {},
  };

  it("lists a source's commands as they are now, with the source's feature", () => {
    let on = true;
    const shell = createShell({
      features: [
        feature("plugins", (studio) =>
          studio.commands.addSource({
            id: "plugins.commands",
            commands: () => (on ? [{ ...forecast, source: "Weather plugin" }] : []),
          }),
        ),
        feature("agents", (studio) =>
          studio.commands.add({ id: "agents.new", title: "New agent", run: () => {} }),
        ),
      ],
    });
    const { commands } = shell.contributions;
    expect(commands.list().map((command) => command.id)).toEqual([
      "agents.new",
      "plugins.commands.weather.forecast",
    ]);
    expect(commands.get(forecast.id)).toMatchObject({
      featureId: "plugins",
      source: "Weather plugin",
    });
    on = false;
    expect(commands.list().map((command) => command.id)).toEqual(["agents.new"]);
    expect(commands.get(forecast.id)).toBeUndefined();
  });

  it("leaves out commands a source may not give, and every command of a source that throws", () => {
    const shell = createShell({
      features: [
        feature("plugins", (studio) => {
          studio.commands.addSource({
            id: "plugins.commands",
            commands: () => [
              forecast,
              { ...forecast, title: "Again" },
              { id: "agents.new", title: "Not under the source", run: () => {} },
              { id: "plugins.commands.bad_id", title: "Bad id", run: () => {} },
            ],
          });
          studio.commands.addSource({
            id: "plugins.broken",
            commands: () => {
              throw new Error("the plugin list can't be read");
            },
          });
        }),
      ],
    });
    expect(shell.contributions.commands.list()).toEqual([
      expect.objectContaining({ id: forecast.id, title: "Show forecast" }),
    ]);
    expect(shell.contributions.commands.get("agents.new")).toBeUndefined();
  });

  it("leaves out a source that doesn't give a list, and a command that can't be read or has no title", () => {
    const unreadable = {
      get id(): string {
        throw new Error("the plugin is gone");
      },
      title: "Unreadable",
      run: () => {},
    };
    const shell = createShell({
      features: [
        feature("plugins", (studio) => {
          studio.commands.addSource({
            id: "plugins.commands",
            commands: () => [
              unreadable,
              { ...forecast, id: "plugins.commands.untitled", title: undefined as never },
              { ...forecast, id: "plugins.commands.odd", source: 3 as never },
              null as never,
              forecast,
            ],
          });
          studio.commands.addSource({ id: "plugins.none", commands: () => undefined as never });
          studio.commands.addSource({ id: "plugins.object", commands: () => ({}) as never });
        }),
        feature("agents", (studio) =>
          studio.commands.add({ id: "agents.new", title: "New agent", run: () => {} }),
        ),
      ],
    });
    const { commands } = shell.contributions;
    expect(commands.list().map((command) => command.id)).toEqual(["agents.new", forecast.id]);
    expect(commands.get("agents.new")).toMatchObject({ title: "New agent" });
    expect(commands.get("plugins.commands.untitled")).toBeUndefined();
  });

  it("refuses an id under a source from a command or another source, naming both", () => {
    const create = (register: (studio: Studio) => void) => () =>
      createShell({
        features: [
          feature("plugins", (studio) =>
            studio.commands.addSource({ id: "plugins.commands", commands: () => [] }),
          ),
          feature("agents", register),
        ],
      });
    const command = create((studio) =>
      studio.commands.add({ id: "plugins.commands.new", title: "New", run: () => {} }),
    );
    expect(command).toThrow(ShellError);
    expect(command).toThrow(
      'commands.addSource: "plugins.commands.new" from the feature "agents" starts with "plugins.commands", the command source of "plugins".',
    );
    const source = create((studio) =>
      studio.commands.addSource({ id: "plugins.commands.more", commands: () => [] }),
    );
    expect(source).toThrow('"plugins.commands.more" from the feature "agents" starts with');
  });

  it("refuses two sources with the same id", () => {
    const source = { id: "plugins.commands", commands: () => [] };
    const create = () =>
      createShell({
        features: [
          feature("plugins", (studio) => studio.commands.addSource(source)),
          feature("agents", (studio) => studio.commands.addSource(source)),
        ],
      });
    expect(create).toThrow('commands.addSource: "plugins.commands" is added by both');
  });
});
