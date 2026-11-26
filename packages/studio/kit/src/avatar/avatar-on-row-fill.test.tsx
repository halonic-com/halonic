// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { List } from "../list/list.tsx";
import { PlainList, PlainRow } from "../plain-list/plain-list.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Avatar } from "./avatar.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

const classesOf = (element: Element | null | undefined) => element?.className.split(" ") ?? [];

/** The tile's fill on a hovered, pressed or current plain row: never the row's own `surface-muted`. */
const tileOnFilledRow = [
  "group-hover/plain:bg-surface",
  "group-active/plain:bg-surface",
  "group-has-[[aria-current=true]]/plain:bg-surface",
];

/** A `PlainRow` with a picture, current or not. */
function renderPlainRow(current: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: () => undefined,
  } as unknown as CanvasRenderingContext2D);
  const picture = { width: 120, height: 120 } as ImageBitmap;
  const { container } = render(
    <PlainList label="Chats">
      <PlainRow
        id="chief"
        picture={<Avatar name="Chief" picture={picture} size="sidebar" />}
        title="Chief"
        current={current}
        onSelect={() => undefined}
      />
    </PlainList>,
  );
  const item = container.querySelector('li[data-row-id="chief"]') as HTMLElement;
  const row = item.querySelector("button") as HTMLElement;
  const tile = row.querySelector('[aria-hidden="true"]') as HTMLElement;
  return { item, row, tile };
}

/** A List's row with an Avatar: its row, its main cell and the Avatar's tile. */
function renderListRow(plain: boolean, current?: string) {
  const { container } = render(
    <List
      heading={{ name: "Needs you" }}
      rows={[
        { id: "notes", title: "Approve the notes", avatar: <Avatar name="Liam" size="sidebar" /> },
      ]}
      onOpen={() => undefined}
      plain={plain}
      {...(current === undefined ? {} : { current })}
    />,
  );
  const row = container.querySelector('tr[data-row-id="notes"]') as HTMLElement;
  const cell = row.querySelector('[role="gridcell"]') as HTMLElement;
  const tile = cell.querySelector(".rounded-full") as HTMLElement;
  return { row, cell, tile };
}

verifies("kit.avatar-on-row-fill", () => {
  it("fills a picture's tile surface on a current or hovered PlainRow, which is filled surface-muted", () => {
    const { item, row, tile } = renderPlainRow(true);

    expect(row.getAttribute("aria-current")).toBe("true");
    expect(classesOf(row)).toEqual(
      expect.arrayContaining(["hover:bg-surface-muted", "aria-[current=true]:bg-surface-muted"]),
    );
    expect(tile.getAttribute("data-picture")).toBe("drawn");
    expect(classesOf(tile)).toEqual(
      expect.arrayContaining(["bg-surface-muted", ...tileOnFilledRow]),
    );
    expect(tile.closest(".group\\/plain")).toBe(item);
    expect(item.querySelector('[aria-current="true"]')).toBe(row);
  });

  it("keeps the tile's group on a PlainRow that isn't current, so only hover changes it", () => {
    const { item, row, tile } = renderPlainRow(false);

    expect(row.getAttribute("aria-current")).toBeNull();
    expect(item.querySelector('[aria-current="true"]')).toBeNull();
    expect(tile.closest(".group\\/plain")).toBe(item);
  });

  it("fills an Avatar's tile surface on a current or hovered plain List row", () => {
    const { row, cell, tile } = renderListRow(true, "notes");

    expect(row.getAttribute("aria-current")).toBe("true");
    expect(classesOf(cell)).toContain("bg-surface-muted");
    expect(classesOf(tile)).toEqual(
      expect.arrayContaining(["bg-surface-muted", ...tileOnFilledRow]),
    );
    expect(tile.closest(".group\\/plain")).toBe(row);

    const hovered = renderListRow(true);
    expect(classesOf(hovered.cell)).toContain("group-hover:bg-surface-muted");
    expect(hovered.tile.closest(".group\\/plain")).toBe(hovered.row);
  });

  it("leaves the tile surface-muted in a bordered List, whose rows aren't filled surface-muted", () => {
    const { tile } = renderListRow(false, "notes");

    expect(tile.closest(".group\\/plain")).toBeNull();
  });
});
