import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { UndoHistory, undoLimit } from "./undo-history.ts";

verifies("app.workspace-undo", () => {
  it("steps back and forward through recorded states", () => {
    const history = new UndoHistory<string>();
    history.record("a");
    history.record("b");
    expect(history.undo("c")).toBe("b");
    expect(history.undo("b")).toBe("a");
    expect(history.canUndo).toBe(false);
    expect(history.redo("a")).toBe("b");
    expect(history.redo("b")).toBe("c");
    expect(history.canRedo).toBe(false);
  });

  it("has nothing to undo or redo at first", () => {
    const history = new UndoHistory<string>();
    expect(history.undo("a")).toBeUndefined();
    expect(history.redo("a")).toBeUndefined();
  });

  it("keeps the latest 200 steps", () => {
    const history = new UndoHistory<number>();
    for (let step = 0; step <= undoLimit; step++) {
      history.record(step);
    }
    let undone = 0;
    while (history.undo(-1) !== undefined) {
      undone++;
    }
    expect(undone).toBe(200);
  });

  it("forgets redo after a new change", () => {
    const history = new UndoHistory<string>();
    history.record("a");
    history.undo("b");
    history.record("a");
    expect(history.canRedo).toBe(false);
  });

  it("makes one step of changes in a row with the same key, until the step is broken", () => {
    const history = new UndoHistory<string>();
    history.record("a", "f.yaml");
    history.record("ab", "f.yaml");
    history.record("abc", "g.yaml");
    history.breakStep();
    history.record("abcd", "g.yaml");
    expect(history.undo("abcde")).toBe("abcd");
    expect(history.undo("abcd")).toBe("abc");
    expect(history.undo("abc")).toBe("a");
  });

  it("rewrites every undo and redo step with map", () => {
    const history = new UndoHistory<string>();
    history.record("a");
    history.record("b");
    expect(history.undo("c")).toBe("b");
    history.map((step) => step.toUpperCase());
    expect(history.redo("B")).toBe("C");
    expect(history.undo("C")).toBe("B");
    expect(history.undo("B")).toBe("A");
  });

  it("forgets every step on clear", () => {
    const history = new UndoHistory<string>();
    history.record("a");
    history.undo("b");
    history.record("c");
    history.clear();
    expect([history.canUndo, history.canRedo]).toEqual([false, false]);
  });
});
