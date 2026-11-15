import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import type { Studio } from "../studio.ts";
import type { SidebarViewContribution } from "./frame.ts";

const load = async () => ({ Tree: () => "tree" });

function view(id: string, order: number, label: string): SidebarViewContribution {
  return { id, order, label, view: "Tree", load };
}

function feature(id: string, register: (studio: Studio) => void) {
  return defineFeature({ id, title: id, register });
}

verifies("shell.sidebar-views", () => {
  it("lists the views by order, then id, with the feature that added each", () => {
    const shell = createShell({
      features: [
        feature("files", (studio) => studio.sidebarViews.add(view("files", 10, "Files"))),
        feature("notes", (studio) => {
          studio.sidebarViews.add(view("notes", 5, "Notes"));
          studio.sidebarViews.add(view("drafts", 5, "Drafts"));
        }),
      ],
    });
    const views = shell.contributions.sidebarViews.list();
    expect(views.map((entry) => entry.id)).toEqual(["drafts", "notes", "files"]);
    expect(views.map((entry) => entry.featureId)).toEqual(["notes", "notes", "files"]);
  });

  it("lists none while no feature adds one", () => {
    expect(createShell({ features: [] }).contributions.sidebarViews.list()).toEqual([]);
  });

  it("keeps the view's action, which runs with what the sidebar gives it", () => {
    const run = vi.fn();
    const shell = createShell({
      features: [
        feature("files", (studio) =>
          studio.sidebarViews.add({
            ...view("files", 1, "Files"),
            action: { label: "New file", icon: "plus", run },
          }),
        ),
      ],
    });
    const [files] = shell.contributions.sidebarViews.list();
    expect(files?.action?.label).toBe("New file");
    expect(files?.action?.icon).toBe("plus");
    expect(files?.action?.run).toBe(run);
  });

  it("refuses a view without a label, naming the feature and the view", () => {
    const create = () =>
      createShell({
        features: [feature("files", (studio) => studio.sidebarViews.add(view("files", 1, "  ")))],
      });
    expect(create).toThrow(ShellError);
    expect(create).toThrow(/"files" gives the view "files" no label/);
  });

  it("refuses two views with one id, naming both features", () => {
    const create = () =>
      createShell({
        features: [
          feature("files", (studio) => studio.sidebarViews.add(view("tree", 1, "Files"))),
          feature("notes", (studio) => studio.sidebarViews.add(view("tree", 2, "Notes"))),
        ],
      });
    expect(create).toThrow(/"tree" is added by both "files" and "notes"/);
  });

  it("refuses an invalid id and an object made from a class", () => {
    const badId = () =>
      createShell({
        features: [
          feature("files", (studio) => studio.sidebarViews.add(view("1 files", 1, "Files"))),
        ],
      });
    expect(badId).toThrow(ShellError);
    class ClassView implements SidebarViewContribution {
      readonly id = "files";
      readonly order = 1;
      readonly label = "Files";
      readonly view = "Tree";
      readonly load = load;
    }
    const fromClass = () =>
      createShell({
        features: [feature("files", (studio) => studio.sidebarViews.add(new ClassView()))],
      });
    expect(fromClass).toThrow(/isn't a plain object/);
  });

  it("refuses a view added after register returned", () => {
    let late: Studio | undefined;
    createShell({
      features: [
        feature("files", (studio) => {
          late = studio;
        }),
      ],
    });
    expect(() => late?.sidebarViews.add(view("files", 1, "Files"))).toThrow(ShellError);
  });
});
