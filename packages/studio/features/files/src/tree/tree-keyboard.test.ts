import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  emptyTreeState,
  pressKey,
  type TreeIntent,
  type TreeState,
  typeAheadPauseMs,
} from "./tree-keyboard.ts";
import { buildTree } from "./tree-model.ts";
import { visibleRows } from "./visible-rows.ts";

const tree = buildTree([
  "hubs/p/hub.yaml",
  "hubs/p/agents/a.agent.yaml",
  "providers/local.yaml",
  "skills/tone.md",
  "skills/style.md",
  "models.yaml",
  "workspace.yaml",
]);

/** Presses keys one after another, 1 second apart, and returns the state and the last intent. */
function press(start: Partial<TreeState>, ...keys: string[]) {
  let state: TreeState = { ...emptyTreeState, ...start };
  let intent: TreeIntent | undefined;
  let handled = false;
  let now = 10_000;
  for (const key of keys) {
    const result = pressKey(visibleRows(tree, state.expanded), state, key, now);
    state = result.state;
    intent = result.intent;
    handled = result.handled;
    now += 1000;
  }
  return { state, intent, handled };
}

verifies("files.tree.keyboard", () => {
  it("moves between rows with the up and down arrows, and stops at the ends", () => {
    expect(press({ focus: "hubs" }, "ArrowDown").state.focus).toBe("providers");
    expect(press({ focus: "providers" }, "ArrowUp").state.focus).toBe("hubs");
    expect(press({ focus: "hubs" }, "ArrowUp").state.focus).toBe("hubs");
    expect(press({ focus: "workspace.yaml" }, "ArrowDown").state.focus).toBe("workspace.yaml");
  });

  it("opens a closed folder with → and closes it with ←", () => {
    const opened = press({ focus: "hubs" }, "ArrowRight").state;
    expect(opened.expanded.has("hubs")).toBe(true);
    expect(opened.focus).toBe("hubs");
    const closed = press(opened, "ArrowLeft").state;
    expect(closed.expanded.has("hubs")).toBe(false);
  });

  it("steps into an open folder with → and out to its folder with ←", () => {
    const inside = press({ focus: "hubs" }, "ArrowRight", "ArrowRight").state;
    expect(inside.focus).toBe("hubs/p");
    expect(press(inside, "ArrowLeft").state.focus).toBe("hubs");
  });

  it("does nothing on → for a file, and ← on a top row stays", () => {
    expect(press({ focus: "models.yaml" }, "ArrowRight").state.focus).toBe("models.yaml");
    expect(press({ focus: "models.yaml" }, "ArrowLeft").state.focus).toBe("models.yaml");
  });

  it("opens the focused file with Enter, and toggles a folder", () => {
    expect(press({ focus: "models.yaml" }, "Enter").intent).toEqual({
      kind: "open",
      path: "models.yaml",
    });
    const toggled = press({ focus: "hubs" }, "Enter");
    expect(toggled.state.expanded.has("hubs")).toBe(true);
    expect(toggled.intent).toBeUndefined();
    expect(press(toggled.state, "Enter").state.expanded.has("hubs")).toBe(false);
  });

  it("asks to rename with F2 and to trash with Delete, for a file only", () => {
    expect(press({ focus: "models.yaml" }, "F2").intent).toEqual({
      kind: "rename",
      path: "models.yaml",
    });
    expect(press({ focus: "models.yaml" }, "Delete").intent).toEqual({
      kind: "trash",
      path: "models.yaml",
    });
    expect(press({ focus: "hubs" }, "Delete")).toMatchObject({ intent: undefined, handled: false });
    expect(press({ focus: "hubs" }, "F2").handled).toBe(false);
  });

  it("jumps with Home and End", () => {
    expect(press({ focus: "models.yaml" }, "Home").state.focus).toBe("hubs");
    expect(press({ focus: "hubs" }, "End").state.focus).toBe("workspace.yaml");
  });

  it("opens the folders next to the focused row with *", () => {
    const opened = press({ focus: "hubs" }, "*").state;
    expect([...opened.expanded].sort()).toEqual(["hubs", "providers", "skills"]);
    const inner = press({ focus: "hubs/p", expanded: new Set(["hubs"]) }, "*").state;
    expect(inner.expanded.has("hubs/p")).toBe(true);
    expect(inner.expanded.has("providers")).toBe(false);
  });

  it("finds a row by the letters typed, and starts again after a pause", () => {
    expect(press({ focus: "hubs" }, "m").state.focus).toBe("models.yaml");
    expect(press({ focus: "hubs" }, "s", "k").state.focus).toBe("skills");
    const slow = pressKey(
      visibleRows(tree, new Set()),
      { ...emptyTreeState, focus: "hubs", typeAhead: { text: "s", at: 0 } },
      "m",
      typeAheadPauseMs + 1,
    );
    expect(slow.state.focus).toBe("models.yaml");
  });

  it("walks through the rows that start with one letter typed again", () => {
    const rows = visibleRows(tree, new Set());
    const first = pressKey(rows, { ...emptyTreeState, focus: "providers" }, "s", 1000);
    expect(first.state.focus).toBe("skills");
    const again = pressKey(rows, first.state, "s", 1100);
    expect(again.state.focus).toBe("skills");
  });

  it("keeps the focus when no row matches the letters", () => {
    const result = press({ focus: "hubs" }, "q");
    expect(result.state.focus).toBe("hubs");
    expect(result.handled).toBe(true);
  });

  it("puts the focus on the first row at the first key that means something", () => {
    expect(press({}, "ArrowDown").state.focus).toBe("hubs");
    expect(press({}, "Tab")).toMatchObject({ handled: false });
    expect(press({}, "Tab").state.focus).toBeUndefined();
  });

  it("leaves other keys alone, including keys that are not named like a letter", () => {
    expect(press({ focus: "hubs" }, "Escape").handled).toBe(false);
    expect(press({ focus: "hubs" }, "constructor").handled).toBe(false);
    expect(press({ focus: "hubs" }, " ").handled).toBe(false);
  });

  describe("an empty tree", () => {
    it("handles nothing", () => {
      expect(pressKey([], emptyTreeState, "ArrowDown", 0).handled).toBe(false);
    });
  });
});
