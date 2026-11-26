// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { List } from "../list/list.tsx";
import type { ListRow } from "../list/list-props.ts";
import { PlainList, PlainRow } from "../plain-list/plain-list.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Avatar } from "./avatar.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

const classesOf = (element: Element | null | undefined) => element?.className.split(" ") ?? [];

/** The nearest element that marks a muted fill, as `on-muted:` reads it, and how. */
function fillMarkOf(element: Element) {
  const marked = element.closest(
    "[data-fill],[data-hover-fill],[data-focus-fill],[data-focus-visible-fill]",
  );
  return {
    marked,
    fill: marked?.getAttribute("data-fill") ?? null,
    hover: marked?.getAttribute("data-hover-fill") ?? null,
    focus: marked?.getAttribute("data-focus-fill") ?? null,
  };
}

/** A `PlainRow` with a picture: its item, its button and the picture's tile. */
function renderPlainRow({ current = false, withAction = false } = {}) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: () => undefined,
  } as unknown as CanvasRenderingContext2D);
  const picture = { width: 120, height: 120 } as ImageBitmap;
  const action = { label: "Mark as unread", onClick: () => undefined };
  const { container } = render(
    <PlainList label="Chats">
      <PlainRow
        id="chief"
        picture={<Avatar name="Chief" picture={picture} size="sidebar" />}
        title="Chief"
        current={current}
        onSelect={() => undefined}
        action={withAction ? action : undefined}
      />
    </PlainList>,
  );
  const item = container.querySelector('li[data-row-id="chief"]') as HTMLElement;
  const row = item.querySelector("button") as HTMLElement;
  const tile = row.querySelector('[aria-hidden="true"]') as HTMLElement;
  return { item, row, tile };
}

/** A List's row with an Avatar: its row, its main cell and the Avatar's tile. */
function renderListRow(plain: boolean, rowProps: Partial<ListRow> = {}, current?: string) {
  const avatar = <Avatar name="Liam" size="sidebar" />;
  const { container } = render(
    <List
      heading={{ name: "Needs you" }}
      rows={[{ id: "notes", title: "Approve the notes", avatar, ...rowProps }]}
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
  it("steps the tile up to surface on a muted fill, and keeps it muted elsewhere", () => {
    const { tile } = renderPlainRow();
    expect(classesOf(tile)).toEqual(
      expect.arrayContaining(["bg-surface-muted", "on-muted:bg-surface"]),
    );
  });

  it("marks a current PlainRow muted, where its row is filled surface-muted", () => {
    const { item, row, tile } = renderPlainRow({ current: true });

    expect(classesOf(row)).toContain("aria-[current=true]:bg-surface-muted");
    expect(tile.getAttribute("data-picture")).toBe("drawn");
    expect(fillMarkOf(tile)).toEqual({ marked: item, fill: "muted", hover: "muted", focus: null });
  });

  it("marks a PlainRow muted on hover and press, and on focus only when it has an action", () => {
    const plain = renderPlainRow();
    expect(classesOf(plain.row)).toContain("hover:bg-surface-muted");
    expect(fillMarkOf(plain.tile)).toEqual({
      marked: plain.item,
      fill: null,
      hover: "muted",
      focus: null,
    });
    unmountAll();

    const withAction = renderPlainRow({ withAction: true });
    expect(classesOf(withAction.row)).toContain("group-focus-within:bg-surface-muted");
    expect(fillMarkOf(withAction.tile).focus).toBe("muted");
  });

  it("marks a plain List row muted on hover at rest, and while current", () => {
    const rest = renderListRow(true);
    expect(classesOf(rest.cell)).toContain("group-hover:bg-surface-muted");
    expect(fillMarkOf(rest.tile)).toMatchObject({ marked: rest.row, fill: null, hover: "muted" });
    unmountAll();

    const current = renderListRow(true, {}, "notes");
    expect(classesOf(current.cell)).toContain("bg-surface-muted");
    expect(fillMarkOf(current.tile)).toMatchObject({ marked: current.row, fill: "muted" });
  });

  it("marks a plain List row muted on keyboard focus, where its row is filled too", () => {
    const { row, cell, tile } = renderListRow(true);

    expect(classesOf(cell)).toContain("group-has-[:focus-visible]:bg-surface-muted");
    expect(fillMarkOf(tile).marked).toBe(row);
    expect(row.getAttribute("data-focus-visible-fill")).toBe("muted");
    // Not on any focus inside it: a click's focus leaves the row unfilled.
    expect(row.getAttribute("data-focus-fill")).toBeNull();
  });

  it("marks no fill on an unavailable plain List row, which isn't filled on hover", () => {
    const { cell, tile } = renderListRow(true, { unavailable: { reason: "Needs a key" } });

    expect(classesOf(cell)).not.toContain("group-hover:bg-surface-muted");
    expect(fillMarkOf(tile).marked).toBeNull();
  });

  it("marks no fill on a bordered List row, whose fill isn't surface-muted", () => {
    const { tile } = renderListRow(false, {}, "notes");

    expect(fillMarkOf(tile).marked).toBeNull();
  });
});
