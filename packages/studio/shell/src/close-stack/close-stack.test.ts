import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import { type CloseLayer, type CloseLayerKind, createCloseStack } from "./close-stack.ts";

/** A layer that records its name in `closed` when it closes. */
function layer(kind: CloseLayerKind, name: string, closed: string[]): CloseLayer {
  return {
    kind,
    close: () => {
      closed.push(name);
    },
  };
}

verifies("shell.close-stack", () => {
  it("closes by rank, whatever order the layers opened in", () => {
    const stack = createCloseStack();
    const closed: string[] = [];
    stack.open(layer("side-panel", "panel", closed));
    stack.open(layer("stacked-card", "card", closed));
    stack.open(layer("dialog", "dialog", closed));
    stack.open(layer("tooltip", "tooltip", closed));
    stack.open(layer("menu", "menu", closed));
    while (stack.escape()) {
      // each Esc closes one layer
    }
    expect(closed).toEqual(["menu", "tooltip", "dialog", "card", "panel"]);
    expect(stack.escape()).toBe(false);
  });

  it("closes the most recently opened layer first within one rank", () => {
    const stack = createCloseStack();
    const closed: string[] = [];
    stack.open(layer("stacked-card", "first card", closed));
    stack.open(layer("dialog", "dialog", closed));
    stack.open(layer("sheet", "sheet", closed));
    stack.open(layer("stacked-card", "second card", closed));
    stack.escape();
    stack.escape();
    stack.escape();
    expect(closed).toEqual(["sheet", "dialog", "second card"]);
    expect(stack.top()?.kind).toBe("stacked-card");
  });

  it("serves Android's Back from the same stack", () => {
    const stack = createCloseStack();
    const closed: string[] = [];
    stack.open(layer("docked-card", "docked", closed));
    stack.open(layer("menu", "menu", closed));
    expect(stack.back()).toBe(true);
    expect(stack.escape()).toBe(true);
    expect(closed).toEqual(["menu", "docked"]);
    expect(stack.back()).toBe(false);
  });

  it("counts the side panel only while it says it is active", () => {
    const stack = createCloseStack();
    const closed: string[] = [];
    let focusInside = false;
    stack.open({ ...layer("side-panel", "panel", closed), isActive: () => focusInside });
    expect(stack.top()).toBeUndefined();
    expect(stack.escape()).toBe(false);
    focusInside = true;
    expect(stack.escape()).toBe(true);
    expect(closed).toEqual(["panel"]);
  });

  it("keeps a layer that refuses to close, and still uses up the key", () => {
    const stack = createCloseStack();
    const closed: string[] = [];
    let asked = 0;
    stack.open(layer("stacked-card", "card", closed));
    stack.open({
      kind: "dialog",
      close: () => {
        asked += 1;
        return false;
      },
    });
    expect(stack.escape()).toBe(true);
    expect(stack.escape()).toBe(true);
    expect(asked).toBe(2);
    expect(closed).toEqual([]);
    expect(stack.top()?.kind).toBe("dialog");
  });

  it("ignores Esc while an input method is composing", () => {
    const stack = createCloseStack();
    const closed: string[] = [];
    stack.open(layer("inline-edit", "rename", closed));
    expect(stack.escape({ isComposing: true })).toBe(false);
    expect(closed).toEqual([]);
    expect(stack.escape({ isComposing: false })).toBe(true);
    expect(closed).toEqual(["rename"]);
  });

  it("forgets a layer that leaves on its own, and a second leave does nothing", () => {
    const stack = createCloseStack();
    const closed: string[] = [];
    stack.open(layer("docked-card", "docked", closed));
    const leaveMenu = stack.open(layer("menu", "menu", closed));
    leaveMenu();
    leaveMenu();
    stack.escape();
    expect(closed).toEqual(["docked"]);
  });

  it("refuses a kind that isn't in the rank list", () => {
    const stack = createCloseStack();
    const popover = { kind: "popover", close: () => true } as unknown as CloseLayer;
    expect(() => stack.open(popover)).toThrow(ShellError);
    expect(() => stack.open(popover)).toThrow('"popover" isn\'t a close layer kind');
    // An inherited key such as "toString" isn't a kind either.
    const inherited = { kind: "toString", close: () => true } as unknown as CloseLayer;
    expect(() => stack.open(inherited)).toThrow('"toString" isn\'t a close layer kind');
  });

  it("gives the shell one close stack for the window", () => {
    const shell = createShell({
      features: [defineFeature({ id: "agents", title: "Agents", register: () => {} })],
    });
    const closed: string[] = [];
    shell.closeStack.open(layer("maximise", "maximise", closed));
    expect(shell.closeStack.escape()).toBe(true);
    expect(closed).toEqual(["maximise"]);
  });
});
