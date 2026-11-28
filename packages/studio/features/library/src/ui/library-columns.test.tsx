// @vitest-environment jsdom
import type { LibraryItemKind } from "@halonicjs/app";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { listColumnClass } from "@halonicjs/studio-kit/list-column";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { LibraryColumns } from "./library-columns.tsx";

afterEach(unmountAll);

function show(presentation: "desktop" | "phone", kind: LibraryItemKind = "skill"): HTMLElement {
  return render(
    <PresentationProvider presentation={presentation}>
      <LibraryColumns kind={kind}>
        <p>the list</p>
      </LibraryColumns>
    </PresentationProvider>,
  );
}

function pane(page: HTMLElement, name: "list" | "content"): HTMLElement | null {
  return page.querySelector<HTMLElement>(`[data-pane="${name}"]`);
}

verifies("library.list-column", () => {
  it("puts the list in a column of the kit's list-column size, beside the content pane", () => {
    const page = show("desktop");
    const list = pane(page, "list");
    expect(list?.textContent).toBe("the list");
    expect(list?.className.split(" ")).toEqual(
      expect.arrayContaining([
        ...listColumnClass.split(" "),
        "shrink-0",
        "border-e",
        "overflow-y-auto",
      ]),
    );
    expect(pane(page, "content")?.className.split(" ")).toContain("flex-1");
  });

  it("names the selected kind in the content pane and says what it holds", () => {
    const content = pane(show("desktop"), "content");
    expect(content?.getAttribute("aria-label")).toBe("Skills");
    expect(content?.querySelector("h2")?.textContent).toBe("Skills");
    expect(content?.querySelector("svg")).not.toBeNull();
    expect(content?.textContent).toContain(
      "Instructions your agents can pick up when a task calls for them.",
    );
  });

  it("follows the kind: Knowledge's pane names it and says what it holds", () => {
    const content = pane(show("desktop", "knowledge"), "content");
    expect(content?.getAttribute("aria-label")).toBe("Knowledge");
    expect(content?.querySelector("h2")?.textContent).toBe("Knowledge");
    expect(content?.textContent).toContain("Documents your agents can search.");
  });

  it("shows the list alone on a phone", () => {
    const page = show("phone");
    expect(pane(page, "list")).toBeNull();
    expect(pane(page, "content")).toBeNull();
    expect(page.textContent).toBe("the list");
  });
});
