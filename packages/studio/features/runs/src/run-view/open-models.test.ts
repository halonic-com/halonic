import { expect, it } from "vitest";
import { openModelsOf } from "./open-models.ts";

it("opens the alias's tab when given one, else the workspace page at Models", () => {
  const commands: string[] = [];
  const items: unknown[] = [];
  const open = openModelsOf({
    runCommand: (id) => commands.push(id) > 0,
    openItem: (item) => items.push(item),
  });
  open?.("fast");
  open?.();
  expect(items).toEqual([{ kind: "model-alias", hub: "local", id: "fast" }]);
  expect(commands).toEqual(["workspace.open-models"]);
});

it("opens Models for an alias where the window can't open a tab, and is absent without commands", () => {
  const commands: string[] = [];
  openModelsOf({ runCommand: (id) => commands.push(id) > 0 })?.("fast");
  expect(commands).toEqual(["workspace.open-models"]);
  expect(openModelsOf({})).toBeUndefined();
});
