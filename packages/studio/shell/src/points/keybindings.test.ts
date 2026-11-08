import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
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

verifies("shell.keybindings", () => {
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

  it("binds the plus key, written as a trailing + or as Plus", () => {
    expect(normalizeKeys("Ctrl++")).toBe("Ctrl++");
    expect(normalizeKeys("shift+ctrl+plus")).toBe("Ctrl+Shift++");
    expect(normalizeKeys("+")).toBe("+");
    expect(() => normalizeKeys("Ctrl+++")).toThrow(ShellError);
    expect(() => normalizeKeys("++")).toThrow(ShellError);
    const shell = createShell({
      features: [
        feature("zoom", (studio) => {
          studio.commands.add(command("zoom.in"));
          studio.keybindings.add({ command: "zoom.in", keys: "Ctrl++" });
        }),
      ],
    });
    expect(shell.contributions.keybindings.resolve("Ctrl+Plus", new Set())?.command).toBe(
      "zoom.in",
    );
  });

  it("reads Cmd as Meta and Mod as Cmd on macOS and Ctrl elsewhere", () => {
    expect(normalizeKeys("cmd+s")).toBe("Meta+S");
    expect(normalizeKeys("Mod+S", "macos")).toBe("Meta+S");
    expect(normalizeKeys("Mod+S", "windows")).toBe("Ctrl+S");
    expect(normalizeKeys("Mod+S")).toBe("Ctrl+S");
    expect(() => normalizeKeys("Mod+Ctrl+S")).toThrow("name Ctrl twice");
    const files = feature("files", (studio) => {
      studio.commands.add(command("files.save"));
      studio.keybindings.add({ command: "files.save", keys: "Mod+S" });
    });
    const mac = createShell({ features: [files], platform: "macos" });
    expect(mac.contributions.keybindings.resolve("Meta+S", new Set())?.command).toBe("files.save");
    expect(mac.contributions.keybindings.resolve("Ctrl+S", new Set())).toBeUndefined();
    const linux = createShell({ features: [files], platform: "linux" });
    expect(linux.contributions.keybindings.resolve("Ctrl+S", new Set())?.command).toBe(
      "files.save",
    );
  });

  it("refuses Mod and Ctrl bound to the same keys off macOS", () => {
    const create = () =>
      createShell({
        platform: "windows",
        features: [
          feature("files", (studio) => {
            studio.commands.add(command("files.save"));
            studio.keybindings.add({ command: "files.save", keys: "Mod+S" });
            studio.keybindings.add({ command: "files.save", keys: "Ctrl+S" });
          }),
        ],
      });
    expect(create).toThrow("Ctrl+S everywhere is bound by both");
  });

  it("refuses Mod and Cmd bound to the same keys on macOS", () => {
    const create = () =>
      createShell({
        platform: "macos",
        features: [
          feature("files", (studio) => {
            studio.commands.add(command("files.save"));
            studio.keybindings.add({ command: "files.save", keys: "Mod+S" });
            studio.keybindings.add({ command: "files.save", keys: "Cmd+S" });
          }),
        ],
      });
    expect(create).toThrow("Meta+S everywhere is bound by both");
  });

  it("accepts the space bar as KeyboardEvent.key spells it, and Esc for Escape", () => {
    expect(normalizeKeys(" ")).toBe("Space");
    expect(normalizeKeys("Ctrl+ ")).toBe("Ctrl+Space");
    expect(() => normalizeKeys("Ctrl + ")).toThrow(ShellError);
    expect(() => normalizeKeys("Shift + ")).toThrow(ShellError);
    expect(() => normalizeKeys("Ctrl+ +A")).toThrow(ShellError);
    expect(normalizeKeys("esc")).toBe("Escape");
    expect(normalizeKeys("Shift+Esc")).toBe("Shift+Escape");
    const shell = createShell({
      features: [
        feature("palette", (studio) => {
          studio.commands.add(command("palette.open"));
          studio.commands.add(command("palette.close"));
          studio.keybindings.add({ command: "palette.open", keys: "Ctrl+Space" });
          studio.keybindings.add({ command: "palette.close", keys: "Esc" });
        }),
      ],
    });
    const { keybindings } = shell.contributions;
    expect(keybindings.resolve("Ctrl+ ", new Set())?.command).toBe("palette.open");
    expect(keybindings.resolve("Escape", new Set())?.command).toBe("palette.close");
  });

  it("counts a repeated when term once, so it doesn't beat a binding with more conditions", () => {
    expect(parseWhen("a && a && !b && !b")).toEqual([
      { name: "a", negated: false },
      { name: "b", negated: true },
    ]);
    const shell = createShell({
      features: [
        feature("editor", (studio) => {
          studio.commands.add(command("editor.repeated"));
          studio.commands.add(command("editor.both"));
          studio.keybindings.add({
            command: "editor.repeated",
            keys: "Ctrl+K",
            when: "editorFocused && editorFocused",
          });
          studio.keybindings.add({
            command: "editor.both",
            keys: "Ctrl+K",
            when: "editorFocused && selection",
          });
        }),
      ],
    });
    const active = new Set(["editorFocused", "selection"]);
    expect(shell.contributions.keybindings.resolve("Ctrl+K", active)?.command).toBe("editor.both");
  });

  it("refuses a when that asks for a context and its negation", () => {
    expect(() => parseWhen("a && !a")).toThrow('asks for "a" and "!a" at once');
    expect(() => parseWhen("!b && c && b")).toThrow(ShellError);
    const create = () =>
      createShell({
        features: [
          feature("editor", (studio) => {
            studio.commands.add(command("editor.never"));
            studio.keybindings.add({ command: "editor.never", keys: "Ctrl+K", when: "a && !a" });
          }),
        ],
      });
    expect(create).toThrow('asks for "a" and "!a" at once');
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
