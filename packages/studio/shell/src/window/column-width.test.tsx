// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { columnWidthFor } from "../sidebar/sidebar-width.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { useSidebarWidth } from "./title-bar-start.tsx";

let windowWidth: number;

beforeEach(() => {
  windowWidth = window.innerWidth;
});

afterEach(() => {
  unmountAll();
  resizeWindow(windowWidth);
});

function resizeWindow(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

let column: ReturnType<typeof useSidebarWidth>;

function Harness() {
  column = useSidebarWidth();
  return null;
}

verifies("shell.sidebar-resize", () => {
  describe("the list column's width", () => {
    it("is 34% of the window, kept inside 180 to 380px", () => {
      expect(columnWidthFor(1024)).toBe(348);
      expect(columnWidthFor(1440)).toBe(380);
      expect(columnWidthFor(400)).toBe(180);
    });

    it("follows the window as it resizes", () => {
      resizeWindow(1024);
      render(<Harness />);
      expect(column.width).toBe(348);

      act(() => resizeWindow(1440));
      expect(column.width).toBe(380);
    });

    it("keeps the width the edge set, and follows the window again after a reset", () => {
      resizeWindow(1024);
      render(<Harness />);
      act(() => column.sidebar.onWidthChange(300));
      act(() => resizeWindow(1100));
      expect(column.width).toBe(300);

      act(() => column.sidebar.onWidthChange(column.sidebar.resetWidth));
      act(() => resizeWindow(1024));
      expect(column.width).toBe(348);
    });
  });
});
