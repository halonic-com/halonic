import { describe, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import type { Studio } from "../studio.ts";
import { normalizeKeys, parseWhen } from "./keybindings.ts";

function feature(id: string, register: (studio: Studio) => void) {
  return defineFeature({ id, title: id, register });
}

function command(id: string) {
  return { id, title: id, run: () => {} };
}

describe("shell.keybindings", () => {
  it("prefers the binding whose context holds over the one for everywhere", () => {
    const shell = createShell({
      features: [
        feature("app", (studio) => {
          studio.commands.add(command("app.undo"));
          studio.keybindings.add({ command: "app.undo", keys: "Ctrl+Z" });
        }),
        feature("code-editor", (studio) => {
          studio.commands.add(command("codeEditor.undo"));
          studio.keybindings.add({
            command: "codeEditor.undo",
            keys: "Ctrl+Z",
            when: "codeEditorFocused",
          });
        }),
      ],
    });
    const { keybindings } = shell.contributions;
    expect(keybindings.resolve("Ctrl+Z", new Set(["codeEditorFocused"]))?.command).toBe(
      "codeEditor.undo",
    );
    expect(keybindings.resolve("ctrl+z", new Set())?.command).toBe("app.undo");
  });

  it("matches named keys regardless of case", () => {
    const shell = createShell({
      features: [
        feature("explorer", (studio) => {
          studio.commands.add(command("explorer.up"));
          studio.keybindings.add({ command: "explorer.up", keys: "ctrl+arrowup" });
        }),
      ],
    });
    const { keybindings } = shell.contributions;
    expect(keybindings.resolve("Ctrl+ArrowUp", new Set())?.command).toBe("explorer.up");
    expect(keybindings.list()[0]?.keys).toBe("ctrl+arrowup");
  });

  it("refuses a binding made from a class", () => {
    class UndoBinding {
      readonly command = "app.undo";
      get keys(): string {
        return "Ctrl+Z";
      }
    }
    const create = () =>
      createShell({
        features: [
          feature("app", (studio) => {
            studio.commands.add(command("app.undo"));
            studio.keybindings.add(new UndoBinding());
          }),
        ],
      });
    expect(create).toThrow(
      'keybindings.add: the feature "app" gives something that isn\'t a plain object.',
    );
  });

  it("applies a binding only while its whole when holds", () => {
    const shell = createShell({
      features: [
        feature("agents", (studio) => {
          studio.commands.add(command("agents.new"));
          studio.keybindings.add({
            command: "agents.new",
            keys: "Ctrl+Alt+A",
            when: "workspaceFocused && !dialogOpen",
          });
        }),
      ],
    });
    const { keybindings } = shell.contributions;
    expect(keybindings.resolve("alt+ctrl+a", new Set())).toBeUndefined();
    expect(keybindings.resolve("alt+ctrl+a", new Set(["workspaceFocused"]))?.command).toBe(
      "agents.new",
    );
    expect(
      keybindings.resolve("alt+ctrl+a", new Set(["workspaceFocused", "dialogOpen"])),
    ).toBeUndefined();
    expect(keybindings.resolve("Ctrl+A", new Set(["workspaceFocused"]))).toBeUndefined();
  });

  it("refuses the same keys and when bound twice, naming both features", () => {
    const create = () =>
      createShell({
        features: [
          feature("files", (studio) => {
            studio.commands.add(command("files.save"));
            studio.keybindings.add({ command: "files.save", keys: "Ctrl+S" });
          }),
          feature("agents", (studio) =>
            studio.keybindings.add({ command: "files.save", keys: "s+ctrl" }),
          ),
        ],
      });
    expect(create).toThrow(ShellError);
    expect(create).toThrow(
      'Ctrl+S everywhere is bound by both "files" (files.save) and "agents" (files.save)',
    );
  });

  it("refuses a binding to a command no feature adds", () => {
    const create = () =>
      createShell({
        features: [
          feature("agents", (studio) =>
            studio.keybindings.add({ command: "agents.nope", keys: "Ctrl+N" }),
          ),
        ],
      });
    expect(create).toThrow('binds Ctrl+N to "agents.nope", but no feature adds that command');
  });

  it("writes keys in one form and refuses malformed keys", () => {
    expect(normalizeKeys("shift+ctrl+p")).toBe("Ctrl+Shift+P");
    expect(normalizeKeys("Meta+ArrowUp")).toBe("Meta+ArrowUp");
    expect(normalizeKeys("ctrl+arrowup")).toBe("Ctrl+ArrowUp");
    expect(normalizeKeys("PAGEDOWN")).toBe("PageDown");
    expect(normalizeKeys("shift+f12")).toBe("Shift+F12");
    expect(normalizeKeys("ctrl+/")).toBe("Ctrl+/");
    expect(() => normalizeKeys("Ctrl+ArrowUpp")).toThrow('name the key "ArrowUpp"');
    expect(() => normalizeKeys("F25")).toThrow(ShellError);
    expect(() => normalizeKeys("Ctrl+Alt")).toThrow(ShellError);
    expect(() => normalizeKeys("Ctrl+A+B")).toThrow(ShellError);
    expect(() => normalizeKeys("Ctrl+ctrl+A")).toThrow("name Ctrl twice");
  });

  it("reads when terms in one order and refuses malformed ones", () => {
    expect(parseWhen("b && !a")).toEqual([
      { name: "a", negated: true },
      { name: "b", negated: false },
    ]);
    expect(parseWhen(undefined)).toEqual([]);
    expect(() => parseWhen("a || b")).toThrow(ShellError);
    expect(() => parseWhen("a && ")).toThrow(ShellError);
  });
});
