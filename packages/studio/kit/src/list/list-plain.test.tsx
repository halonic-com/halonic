// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { PlainList, PlainRow } from "../plain-list/plain-list.tsx";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListRow } from "./list-props.ts";

afterEach(unmountAll);

const items: readonly ListRow[] = [
  { id: "notes", title: "Approve the release notes", meta: "Release 0.2 · Liam", titleEnd: "1 h" },
  {
    id: "digest",
    title: "Send the weekly digest?",
    meta: "Weekly digest · run 0b44e1",
    titleEnd: "2 d",
    unread: { label: "unread" },
  },
];

function renderPlain(current?: string) {
  const { container } = render(
    <List
      heading={{ name: "Needs you" }}
      rows={items}
      onOpen={() => undefined}
      plain
      {...(current === undefined ? {} : { current })}
    />,
  );
  const cell = (id: string) =>
    container.querySelector(`tr[data-row-id="${id}"] [role="gridcell"]`) as HTMLElement;
  return { container, cell };
}

const classesOf = (element: Element | null | undefined) => element?.className.split(" ") ?? [];

/** Rows with a `label`, which overrides the cell's content as its name. */
const labelled: readonly ListRow[] = [
  { id: "notes", title: "Approve the release notes", label: "Approve the release notes, 1 h" },
  {
    id: "digest",
    title: "Send the weekly digest?",
    label: "Send the weekly digest?, 2 d",
    unread: { label: "unread" },
  },
  { id: "chief", title: "Chief", label: "Chief", unread: { label: " unread", count: "2" } },
];

verifies("kit.list-plain", () => {
  it("draws rounded rows with no box or lines, and the current row with the muted fill only", () => {
    const { container, cell } = renderPlain("digest");
    expect(container.querySelector('[role="grid"]')?.className).toContain("border-spacing-y-1");
    for (const id of ["notes", "digest"]) {
      expect(classesOf(cell(id))).toEqual(expect.arrayContaining(["rounded-l-md", "rounded-r-md"]));
      expect(classesOf(cell(id))).not.toContain("border-t");
      expect(classesOf(cell(id))).not.toContain("selected-bar");
    }
    expect(container.querySelector(".border.border-border")).toBeNull();
    expect(classesOf(cell("digest"))).toContain("bg-surface-muted");
    expect(cell("digest").getAttribute("aria-current")).toBe("true");
    expect(classesOf(cell("notes"))).not.toContain("bg-surface-muted");
    expect(classesOf(cell("notes"))).toContain("group-hover:bg-surface-muted");
  });

  it("draws an unread row semibold with a full-colour line and the blue dot; a read row plain", () => {
    const { cell } = renderPlain();
    const titleOf = (id: string) =>
      [...cell(id).querySelectorAll("span")].find(
        (span) => span.textContent === items.find((item) => item.id === id)?.title,
      );
    const metaOf = (id: string) => cell(id).querySelector(".text-small:not([data-part])");
    expect(classesOf(titleOf("digest"))).toContain("font-semibold");
    expect(classesOf(metaOf("digest"))).toContain("text-fg");
    const dot = cell("digest").querySelector("[data-unread]");
    expect(classesOf(dot)).toContain("bg-primary");
    expect(dot?.textContent).toBe("unread");
    expect(classesOf(titleOf("notes"))).toContain("text-body");
    expect(classesOf(titleOf("notes"))).not.toContain("font-semibold");
    expect(classesOf(metaOf("notes"))).toContain("text-fg-muted");
    expect(cell("notes").querySelector("[data-unread]")).toBeNull();
  });

  it("keeps the unread dot and count and the flag dot in CanvasText in forced colours", () => {
    const { container } = render(
      <PlainList label="Chats">
        <PlainRow
          id="chief"
          picture={null}
          title="Chief"
          flag="waits for you"
          unread={{ label: " unread", count: "2" }}
          onSelect={() => undefined}
        />
        <PlainRow
          id="noah"
          picture={null}
          title="Noah"
          unread={{ label: "unread" }}
          onSelect={() => undefined}
        />
      </PlainList>,
    );
    const marks = [...container.querySelectorAll("[data-unread], [data-flag]")];
    expect(marks).toHaveLength(3);
    for (const mark of marks) {
      expect(classesOf(mark)).toEqual(
        expect.arrayContaining(["forced-color-adjust-none", "forced-colors:bg-[CanvasText]"]),
      );
    }
  });

  it("ends a labelled unread row's name with the unread words; a read row keeps its label", () => {
    const { container } = render(
      <List label="Needs you" rows={labelled} onOpen={() => undefined} plain />,
    );
    const name = (id: string) =>
      container
        .querySelector(`tr[data-row-id="${id}"] [role="gridcell"]`)
        ?.getAttribute("aria-label");
    expect(name("notes")).toBe("Approve the release notes, 1 h");
    expect(name("digest")).toBe("Send the weekly digest?, 2 d, unread");
    expect(name("chief")).toBe("Chief, 2 unread");
  });

  it("keeps the plain look on a phone, over the flush look", () => {
    const { container } = render(
      <PresentationProvider presentation="phone">
        <List label="Needs you" rows={items} onOpen={() => undefined} flush plain />
      </PresentationProvider>,
    );
    for (const id of ["notes", "digest"]) {
      const cell = container.querySelector(`tr[data-row-id="${id}"] [role="gridcell"]`);
      expect(classesOf(cell)).toEqual(expect.arrayContaining(["rounded-l-md", "rounded-r-md"]));
      // The flush look's line is a `before:border-t`, so match the class's text.
      expect(cell?.className).not.toMatch(/border-t/);
    }
    expect(container.querySelector('[role="grid"]')?.className).toContain("border-spacing-y-1");
  });
});
