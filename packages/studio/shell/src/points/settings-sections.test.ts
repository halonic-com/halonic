import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import type { SettingsScope } from "./frame.ts";
import { settingsSectionToOpen } from "./settings-sections.ts";

const load = async () => ({ View: () => "view" });

function section(id: string, scope: SettingsScope, order: number) {
  return { id, title: id, scope, order, view: "View", load };
}

verifies("shell.frame-points", () => {
  it("lists the workspace's sections first, then this computer's by order", () => {
    const shell = createShell({
      features: [
        defineFeature({
          id: "settings",
          title: "Settings",
          register: (studio) => {
            studio.settings.add(section("appearance", "display", 10));
            studio.settings.add(section("assistant", "host", 30));
            studio.settings.add(section("formats", "display", 20));
          },
        }),
        defineFeature({
          id: "models",
          title: "Models",
          register: (studio) => studio.settings.add(section("models", "workspace", 10)),
        }),
      ],
    });
    const ids = shell.contributions.settings.list().map((listed) => listed.id);
    expect(ids).toEqual(["models", "appearance", "formats", "assistant"]);
  });

  it("refuses a scope that isn't one of the three, naming the feature and the section", () => {
    const create = () =>
      createShell({
        features: [
          defineFeature({
            id: "models",
            title: "Models",
            register: (studio) =>
              studio.settings.add({
                ...section("models", "workspace", 10),
                scope: "profile" as SettingsScope,
              }),
          }),
        ],
      });
    expect(create).toThrow(ShellError);
    expect(create).toThrow(
      'settings.add: the feature "models" gives the section "models" the scope "profile".',
    );
  });
});

verifies("shell.settings-open", () => {
  const sections = [{ id: "models" }, { id: "appearance" }, { id: "formats" }];

  it("shows the section asked for", () => {
    expect(settingsSectionToOpen(sections, "models", "formats")).toBe("models");
  });

  it("shows the section shown last when none is asked for", () => {
    expect(settingsSectionToOpen(sections, undefined, "formats")).toBe("formats");
  });

  it("passes over a section no feature added", () => {
    expect(settingsSectionToOpen(sections, "trust", "formats")).toBe("formats");
    expect(settingsSectionToOpen(sections, "trust", "sandbox")).toBe("appearance");
  });

  it("falls back to Appearance, then to the first section", () => {
    expect(settingsSectionToOpen(sections)).toBe("appearance");
    expect(settingsSectionToOpen([{ id: "models" }, { id: "formats" }])).toBe("models");
    expect(settingsSectionToOpen([])).toBeUndefined();
  });
});
