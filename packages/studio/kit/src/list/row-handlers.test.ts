import { verifies } from "@halonicjs/testing-spec";
import type { KeyboardEvent, MouseEvent } from "react";
import { expect, it, vi } from "vitest";
import { type RowHandlerOptions, rowHandlers } from "./row-handlers.ts";

interface Modifiers {
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
}

const noModifiers = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };

/** A click on the row's cell, with the keys held; only the fields the handlers read. */
function clickOf(modifiers: Modifiers = {}, button = 0): MouseEvent<HTMLTableCellElement> {
  const event = { ...noModifiers, ...modifiers, button, preventDefault: vi.fn() };
  return event as unknown as MouseEvent<HTMLTableCellElement>;
}

/** Enter pressed on the row's cell itself, with the keys held. */
function enterOf(modifiers: Modifiers = {}): KeyboardEvent<HTMLTableCellElement> {
  const cell = {};
  const event = {
    ...noModifiers,
    ...modifiers,
    key: "Enter",
    target: cell,
    currentTarget: cell,
    nativeEvent: { isComposing: false, keyCode: 13 },
    preventDefault: vi.fn(),
  };
  return event as unknown as KeyboardEvent<HTMLTableCellElement>;
}

function handlersWith(overrides: Partial<RowHandlerOptions<"sorter">> = {}) {
  const calls = { onOpen: vi.fn(), onOpenInNewTab: vi.fn(), onAltOpen: vi.fn(), onToggle: vi.fn() };
  const handlers = rowHandlers<"sorter">({
    id: "sorter",
    isUnavailable: false,
    ...calls,
    ...overrides,
  });
  return { handlers, calls };
}

verifies("kit.list", () => {
  it("calls onAltOpen, not onOpen, on an Alt-click or Alt Enter", () => {
    const { handlers, calls } = handlersWith();
    handlers.onClick(clickOf({ altKey: true }));
    const enter = enterOf({ altKey: true });
    handlers.onKeyDown(enter);
    expect(calls.onAltOpen.mock.calls).toEqual([["sorter"], ["sorter"]]);
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(calls.onOpen).not.toHaveBeenCalled();
    expect(calls.onOpenInNewTab).not.toHaveBeenCalled();
  });

  it("still opens on a plain click or Enter, and a new tab with Ctrl or ⌘ and Alt held", () => {
    const { handlers, calls } = handlersWith();
    handlers.onClick(clickOf());
    handlers.onKeyDown(enterOf());
    handlers.onClick(clickOf({ ctrlKey: true, altKey: true }));
    handlers.onKeyDown(enterOf({ metaKey: true, altKey: true }));
    expect(calls.onOpen.mock.calls).toEqual([["sorter"], ["sorter"]]);
    expect(calls.onOpenInNewTab.mock.calls).toEqual([["sorter"], ["sorter"]]);
    expect(calls.onAltOpen).not.toHaveBeenCalled();
  });

  it("does nothing on an Alt-click without onAltOpen, nor on a middle click with Alt held", () => {
    const { handlers, calls } = handlersWith({ onAltOpen: undefined });
    handlers.onClick(clickOf({ altKey: true }));
    handlers.onKeyDown(enterOf({ altKey: true }));
    const withAlt = handlersWith();
    withAlt.handlers.onAuxClick(clickOf({ altKey: true }, 1));
    expect(calls.onOpen).not.toHaveBeenCalled();
    expect(withAlt.calls.onAltOpen).not.toHaveBeenCalled();
    expect(withAlt.calls.onOpenInNewTab).not.toHaveBeenCalled();
  });

  it("does nothing on an Alt-click on an unavailable row", () => {
    const { handlers, calls } = handlersWith({ isUnavailable: true });
    handlers.onClick(clickOf({ altKey: true }));
    handlers.onKeyDown(enterOf({ altKey: true }));
    expect(calls.onAltOpen).not.toHaveBeenCalled();
  });
});
