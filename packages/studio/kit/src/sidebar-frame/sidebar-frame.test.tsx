// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { FramedPanel, framedPanelClass, SidebarFrame } from "./sidebar-frame.tsx";

afterEach(() => {
  unmountAll();
});

function classesOf(element: Element | null): string[] {
  return (element?.className ?? "").split(" ");
}

verifies("kit.framed-sidebar", () => {
  describe("SidebarFrame", () => {
    it("puts the sidebar on the frame and the framed panel 8px beside it", () => {
      const { container } = render(
        <SidebarFrame sidebar={<nav aria-label="Chats">Chief</nav>}>
          <FramedPanel as="main">Chief's chat</FramedPanel>
        </SidebarFrame>,
      );
      const frame = container.querySelector("[data-sidebar-frame]");
      const sidebar = container.querySelector("nav");
      const panel = container.querySelector("main");

      expect(classesOf(frame)).toContain("gap-2");
      expect([...(frame?.children ?? [])]).toEqual([sidebar, panel]);
      expect(sidebar?.className).toBe("");
      expect(classesOf(panel)).toEqual(
        expect.arrayContaining(["rounded-lg", "border", "border-border", "bg-app-panel"]),
      );
    });

    it("gives a panel in Studio's window the surface fill, and a focused app's its panel fill", () => {
      const { container } = render(<FramedPanel tone="studio">Home</FramedPanel>);
      const panel = container.querySelector("[data-framed-panel]");

      expect(classesOf(panel)).toContain("bg-surface");
      expect(classesOf(panel)).not.toContain("bg-app-panel");
      expect(framedPanelClass().split(" ")).toContain("bg-app-panel");
    });

    it("draws the panel as the page's main when asked, with the ref on it", () => {
      const ref = createRef<HTMLElement>();
      const { container } = render(
        <FramedPanel as="main" ref={ref}>
          Inbox
        </FramedPanel>,
      );

      expect(container.querySelector("main")).toBe(ref.current);
    });

    it("draws a plain div by default", () => {
      const { container } = render(<FramedPanel>Inbox</FramedPanel>);

      expect(container.querySelector("main")).toBeNull();
      expect(container.querySelector("[data-framed-panel]")?.tagName).toBe("DIV");
    });
  });
});
